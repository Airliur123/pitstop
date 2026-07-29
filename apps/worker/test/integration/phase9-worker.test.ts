import type { WorkerEnvironment } from '@pitstop/config';
import {
  createDatabaseConnectionConfig,
  createDatabasePool,
  createUlid,
  migrateDatabase,
  type Pool,
  type RowDataPacket,
  seedDatabase,
} from '@pitstop/database';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ConfiguredGeocodingAdapter } from '../../src/geocoding.adapters';
import { IntegrationJobService } from '../../src/integration-job.service';
import { IntegrationWorkerRepository } from '../../src/integration-worker.repository';
import { classifyWorkerError, integrationJobPolicy } from '../../src/job-policy';

interface CountRow extends RowDataPacket {
  readonly count: number;
}

interface StatusRow extends RowDataPacket {
  readonly contribution_id: string | null;
  readonly contribution_status: string;
  readonly duplicate_detection_status: string;
  readonly geocoding_status: string;
  readonly processing_status: string;
}

describe.sequential('Phase 9 worker integration', () => {
  let mysql: StartedTestContainer | undefined;
  let redisContainer: StartedTestContainer | undefined;
  let pool: Pool | undefined;
  let repository: IntegrationWorkerRepository;
  let service: IntegrationJobService;
  let environment: WorkerEnvironment;

  beforeAll(async () => {
    [mysql, redisContainer] = await Promise.all([
      new GenericContainer('mysql:8.4.10')
        .withEnvironment({
          MYSQL_DATABASE: 'pitstop_worker_test',
          MYSQL_PASSWORD: 'pitstop_worker_test',
          MYSQL_ROOT_PASSWORD: 'pitstop_root_test',
          MYSQL_USER: 'pitstop_worker_test',
          TZ: 'UTC',
        })
        .withCommand([
          '--character-set-server=utf8mb4',
          '--collation-server=utf8mb4_0900_ai_ci',
          '--default-time-zone=+00:00',
        ])
        .withExposedPorts(3306)
        .withWaitStrategy(Wait.forLogMessage(/port: 3306.*MySQL Community Server/i))
        .withStartupTimeout(150_000)
        .start(),
      new GenericContainer('redis:8.2.7-alpine')
        .withExposedPorts(6379)
        .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/i))
        .start(),
    ]);
    const databaseUrl = `mysql://pitstop_worker_test:pitstop_worker_test@${mysql.getHost()}:${mysql.getMappedPort(3306)}/pitstop_worker_test`;
    pool = createDatabasePool(createDatabaseConnectionConfig({ DATABASE_URL: databaseUrl }));
    await migrateDatabase(pool);
    await seedDatabase(pool);
    environment = {
      DATABASE_URL: databaseUrl,
      DUPLICATE_RADIUS_METERS: 250,
      GEOCODING_BASE_URL: 'https://nominatim.openstreetmap.org',
      GEOCODING_CONFIDENCE_THRESHOLD: 0.7,
      GEOCODING_HTTP_TIMEOUT_MS: 30_000,
      GEOCODING_PROVIDER: 'deterministic',
      GEOCODING_USER_AGENT: 'PitStop-worker-test/1.0',
      LOG_LEVEL: 'silent',
      NODE_ENV: 'test',
      REDIS_URL: `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`,
      WORKER_RECONCILE_INTERVAL_MS: 5_000,
      WORKER_STAGE_LEASE_SECONDS: 300,
    };
    repository = new IntegrationWorkerRepository(pool);
    service = new IntegrationJobService(
      environment,
      new ConfiguredGeocodingAdapter(environment),
      repository,
      { info: () => undefined } as never,
    );
  });

  afterAll(async () => {
    await pool?.end();
    await redisContainer?.stop();
    await mysql?.stop();
  });

  it('creates exactly one pending contribution and completes geocoding/dedupe idempotently', async () => {
    const inboxId = await insertInbox({
      category: 'MAKAN_MURAH',
      mapUrl: 'https://www.google.com/maps/place/X/@-6.1468,106.8061,17z',
      placeName: 'Warung Bu Ani',
    });
    const processJob = processJobFor(inboxId);
    const geocodeJob = await service.processSubmission(processJob);
    expect(geocodeJob).not.toBeNull();
    const repeated = await service.processSubmission(processJob);
    expect(repeated?.contributionId).toBe(geocodeJob?.contributionId);
    expect(
      await count(
        `SELECT COUNT(*) AS count FROM contributions
         WHERE source = 'GOOGLE_FORM' AND submitted_by IS NULL`,
      ),
    ).toBe(1);

    const duplicateJob = await service.geocode(geocodeJob);
    expect(duplicateJob).not.toBeNull();
    await service.geocode(geocodeJob);
    expect(
      await count('SELECT COUNT(*) AS count FROM geocoding_results WHERE contribution_id = ?', [
        geocodeJob?.contributionId ?? '',
      ]),
    ).toBe(1);
    await service.detectDuplicates(duplicateJob);
    const status = await inboxStatus(inboxId);
    expect(status).toMatchObject({
      contribution_status: 'PENDING',
      duplicate_detection_status: 'SUCCEEDED',
      geocoding_status: 'SUCCEEDED',
      processing_status: 'COMPLETED',
    });
    expect(
      await count('SELECT COUNT(*) AS count FROM duplicate_place_hints WHERE contribution_id = ?', [
        geocodeJob?.contributionId ?? '',
      ]),
    ).toBeGreaterThan(0);
  });

  it('keeps low-confidence and permanent failures pending without publishing a Place', async () => {
    const lowInbox = await insertInbox({
      address: 'Jl. Kabur [low-confidence]',
      category: 'TOILET',
    });
    const lowGeocode = await service.processSubmission(processJobFor(lowInbox));
    expect(await service.geocode(lowGeocode)).toBeNull();
    expect(await inboxStatus(lowInbox)).toMatchObject({
      contribution_status: 'PENDING',
      duplicate_detection_status: 'SKIPPED',
      geocoding_status: 'LOW_CONFIDENCE',
      processing_status: 'COMPLETED',
    });

    const failedInbox = await insertInbox({ address: '[not-found]', category: 'TOILET' });
    const failedGeocode = await service.processSubmission(processJobFor(failedInbox));
    let failure: unknown;
    try {
      await service.geocode(failedGeocode);
    } catch (error) {
      failure = error;
    }
    const classified = classifyWorkerError(failure);
    await repository.recordJobFailure(failedInbox, 'geocode-contribution', classified, true);
    expect(await inboxStatus(failedInbox)).toMatchObject({
      contribution_status: 'PENDING',
      geocoding_status: 'FAILED',
      processing_status: 'DEAD_LETTER',
    });
    expect(
      await count(
        `SELECT COUNT(*) AS count
         FROM places p JOIN contributions c ON c.merged_place_id = p.id
         WHERE c.id = ?`,
        [failedGeocode?.contributionId ?? ''],
      ),
    ).toBe(0);
  });

  it('retries a BullMQ job five times and supports idempotent database replay recovery', async () => {
    if (!redisContainer) throw new Error('Redis container unavailable');
    const connection = new Redis(
      `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`,
      { maxRetriesPerRequest: null },
    );
    const queueName = `phase9-retry-${createUlid()}`;
    const queue = new Queue(queueName, { connection });
    const workerConnection = connection.duplicate();
    connection.on('error', () => undefined);
    workerConnection.on('error', () => undefined);
    let attempts = 0;
    const worker = new Worker(
      queueName,
      async () => {
        attempts += 1;
        throw new Error('retry fixture');
      },
      { connection: workerConnection },
    );
    const exhausted = new Promise<void>((resolve) => {
      worker.on('failed', (job) => {
        if (job && job.attemptsMade >= integrationJobPolicy.attempts) resolve();
      });
    });
    await queue.add(
      'retry-fixture',
      { safe: true },
      { ...integrationJobPolicy, removeOnFail: false },
    );
    await exhausted;
    expect(attempts).toBe(5);
    await worker.close();
    await queue.obliterate({ force: true });
    await queue.close();
    await workerConnection.quit();
    connection.disconnect();

    const inboxId = await insertInbox({ category: 'TOILET' });
    const first = await service.processSubmission(processJobFor(inboxId));
    await getPool().execute(
      `UPDATE google_form_submissions SET processing_status = 'DEAD_LETTER' WHERE id = ?`,
      [inboxId],
    );
    await getPool().execute(
      `UPDATE google_form_submissions
       SET processing_status = 'RECEIVED', last_error_class = NULL, last_error_code = NULL
       WHERE id = ?`,
      [inboxId],
    );
    const recovered = await service.processSubmission(processJobFor(inboxId));
    expect(recovered?.contributionId).toBe(first?.contributionId);
    expect(
      await count('SELECT COUNT(*) AS count FROM contributions WHERE id = ?', [
        first?.contributionId ?? '',
      ]),
    ).toBe(1);
  });

  it('reclaims a crashed geocoding stage only after lease expiry and only once', async () => {
    const inboxId = await insertInbox({ category: 'TOILET' });
    const geocodeJob = await service.processSubmission(processJobFor(inboxId));
    expect(geocodeJob).not.toBeNull();
    await repository.markGeocodingProcessing(inboxId);

    const activeClaims = await Promise.all([
      repository.claimGeocodingCandidates(300),
      repository.claimGeocodingCandidates(300),
    ]);
    expect(activeClaims.flat().filter((job) => job.inboxId === inboxId)).toHaveLength(0);

    await getPool().execute(
      `UPDATE google_form_submissions
       SET updated_at = DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 301 SECOND)
       WHERE id = ?`,
      [inboxId],
    );
    const competingClaims = await Promise.all([
      repository.claimGeocodingCandidates(300),
      repository.claimGeocodingCandidates(300),
    ]);
    const reclaimed = competingClaims.flat().filter((job) => job.inboxId === inboxId);
    expect(reclaimed).toHaveLength(1);
    expect(reclaimed[0]).toMatchObject({
      contributionId: geocodeJob?.contributionId,
      inboxId,
    });

    await service.geocode(reclaimed[0]);
    expect(
      await count('SELECT COUNT(*) AS count FROM geocoding_results WHERE contribution_id = ?', [
        geocodeJob?.contributionId ?? '',
      ]),
    ).toBe(1);
  });

  it('recovers stale duplicate detection atomically without duplicating hints', async () => {
    const inboxId = await insertInbox({
      category: 'MAKAN_MURAH',
      mapUrl: 'https://www.google.com/maps/place/X/@-6.1468,106.8061,17z',
      placeName: 'Warung Bu Ani',
    });
    const geocodeJob = await service.processSubmission(processJobFor(inboxId));
    const duplicateJob = await service.geocode(geocodeJob);
    expect(duplicateJob).not.toBeNull();
    await service.detectDuplicates(duplicateJob);
    const originalHintCount = await count(
      'SELECT COUNT(*) AS count FROM duplicate_place_hints WHERE contribution_id = ?',
      [geocodeJob?.contributionId ?? ''],
    );
    expect(originalHintCount).toBeGreaterThan(0);

    await getPool().execute(
      `UPDATE google_form_submissions
       SET processing_status = 'PROCESSING', duplicate_detection_status = 'PROCESSING',
         updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [inboxId],
    );
    expect(
      (await repository.claimDuplicateCandidates(300)).filter((job) => job.inboxId === inboxId),
    ).toHaveLength(0);
    await getPool().execute(
      `UPDATE google_form_submissions
       SET updated_at = DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 301 SECOND)
       WHERE id = ?`,
      [inboxId],
    );

    const competingClaims = await Promise.all([
      repository.claimDuplicateCandidates(300),
      repository.claimDuplicateCandidates(300),
    ]);
    const reclaimed = competingClaims.flat().filter((job) => job.inboxId === inboxId);
    expect(reclaimed).toHaveLength(1);
    await service.detectDuplicates(reclaimed[0]);

    expect(await inboxStatus(inboxId)).toMatchObject({
      duplicate_detection_status: 'SUCCEEDED',
      geocoding_status: 'SUCCEEDED',
      processing_status: 'COMPLETED',
    });
    expect(
      await count('SELECT COUNT(*) AS count FROM duplicate_place_hints WHERE contribution_id = ?', [
        geocodeJob?.contributionId ?? '',
      ]),
    ).toBe(originalHintCount);
  });

  async function insertInbox(input: {
    readonly address?: string;
    readonly category: 'MAKAN_MURAH' | 'TOILET';
    readonly mapUrl?: string;
    readonly placeName?: string;
  }): Promise<string> {
    const sourceId = createUlid();
    const inboxId = createUlid();
    const externalId = `worker-${inboxId}`;
    await getPool().execute(
      `INSERT INTO integration_sources (
         id, code, name, is_active, current_key_id
       ) VALUES (?, ?, 'Worker test source', true, 'test-v1')`,
      [sourceId, `worker-${sourceId.toLowerCase()}`],
    );
    const priceFields =
      input.category === 'MAKAN_MURAH'
        ? {
            cheapestMenuName: 'Nasi telur',
            cheapestMenuPrice: 12_000,
            maximumUsefulBudget: 15_000,
          }
        : {};
    const payload = {
      address: input.address ?? 'Jl. Worker Test',
      area: 'Tambora',
      category: input.category,
      facilities: [],
      openingHours: [],
      placeName: input.placeName ?? `Worker Place ${inboxId}`,
      sourceMetadata: {
        externalSubmissionId: externalId,
        receivedAt: new Date().toISOString(),
        sourceId: 'worker-test',
        submittedAt: new Date().toISOString(),
      },
      ...priceFields,
      ...(input.mapUrl ? { mapUrl: input.mapUrl } : {}),
    };
    await getPool().execute(
      `INSERT INTO google_form_submissions (
         id, integration_source_id, external_submission_id, payload, payload_schema_version,
         request_hash, accepted_key_id, correlation_id, received_at, submitted_at
       ) VALUES (?, ?, ?, ?, 1, ?, 'test-v1', ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
      [
        inboxId,
        sourceId,
        externalId,
        JSON.stringify(payload),
        'a'.repeat(64),
        `request-${inboxId}`,
      ],
    );
    return inboxId;
  }

  function processJobFor(inboxId: string) {
    return {
      attempt: 0,
      correlationId: `request-${inboxId}`,
      enqueuedAt: new Date().toISOString(),
      idempotencyKey: `google-form:process:${inboxId}`,
      inboxId,
      requestId: `request-${inboxId}`,
    };
  }

  async function inboxStatus(inboxId: string): Promise<StatusRow | undefined> {
    const [rows] = await getPool().execute<StatusRow[]>(
      `SELECT g.processing_status, g.geocoding_status, g.duplicate_detection_status,
         g.contribution_id, c.contribution_status
       FROM google_form_submissions g
       LEFT JOIN contributions c ON c.id = g.contribution_id
       WHERE g.id = ?`,
      [inboxId],
    );
    return rows[0];
  }

  async function count(queryText: string, values: readonly string[] = []): Promise<number> {
    const [rows] = await getPool().execute<CountRow[]>(queryText, [...values]);
    return Number(rows[0]?.count ?? 0);
  }

  function getPool(): Pool {
    if (!pool) throw new Error('Worker test database unavailable');
    return pool;
  }
});
