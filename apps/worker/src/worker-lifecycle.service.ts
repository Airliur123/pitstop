import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import type {
  DetectDuplicatePlaceJob,
  GeocodeContributionJob,
  PitstopJobName,
  ProcessGoogleFormSubmissionJob,
} from '@pitstop/contracts';
import type { Pool } from '@pitstop/database';
import { Job, Queue, Worker as BullWorker } from 'bullmq';
import Redis from 'ioredis';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { WORKER_ENVIRONMENT, type WorkerEnvironmentProvider } from './configuration';
import { IntegrationJobService } from './integration-job.service';
import { IntegrationWorkerRepository } from './integration-worker.repository';
import { classifyWorkerError, integrationJobPolicy, PermanentWorkerError } from './job-policy';
import { WORKER_DATABASE_POOL } from './worker-database';
import {
  readWorkerRuntimeSettings,
  sanitizeJobIdentifiers,
  WORKER_HEARTBEAT_KEY,
  WORKER_METRICS_KEY,
  WorkerMetrics,
  type WorkerOperationalState,
  type WorkerQueueSnapshot,
} from './worker-observability';

export const INTEGRATION_QUEUE = 'pitstop-integration';
export const INTEGRATION_DLQ = 'pitstop-integration-dlq';

type IntegrationJobData =
  DetectDuplicatePlaceJob | GeocodeContributionJob | ProcessGoogleFormSubmissionJob;

const integrationJobNames = new Set<PitstopJobName>([
  'detect-duplicate-place',
  'geocode-contribution',
  'process-google-form-submission',
]);
const ulidPattern = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

@Injectable()
export class WorkerLifecycleService implements OnModuleInit, OnApplicationShutdown {
  private acceptingWork = false;
  private connection?: Redis;
  private databaseClose?: Promise<void>;
  private deadLetterQueue?: Queue;
  private readonly failureHandlers = new Set<Promise<void>>();
  private heartbeatTimer?: NodeJS.Timeout;
  private readonly metrics = new WorkerMetrics();
  private observabilityInFlight: Promise<void> | undefined;
  private queue?: Queue;
  private reconcileInFlight: Promise<void> | undefined;
  private reconcileTimer?: NodeJS.Timeout;
  private redisAvailable = false;
  private redisEverReady = false;
  private readonly runtimeSettings = readWorkerRuntimeSettings();
  private shutdownInFlight?: Promise<void>;
  private stopping = false;
  private worker?: BullWorker<IntegrationJobData>;
  private workerConnection?: Redis;
  private workerRun?: Promise<void>;

  constructor(
    @Inject(WORKER_ENVIRONMENT) private readonly environment: WorkerEnvironmentProvider,
    @Inject(WORKER_DATABASE_POOL) private readonly databasePool: Pool,
    @Inject(IntegrationJobService) private readonly jobs: IntegrationJobService,
    @Inject(IntegrationWorkerRepository) private readonly repository: IntegrationWorkerRepository,
    @InjectPinoLogger(WorkerLifecycleService.name)
    private readonly logger: PinoLogger,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.environment.NODE_ENV === 'test') {
      this.logger.info({
        jobName: 'worker-bootstrap',
        status: 'TEST_READY',
      });
      return;
    }

    try {
      this.connection = new Redis(this.environment.REDIS_URL, { maxRetriesPerRequest: null });
      this.workerConnection = this.connection.duplicate();
      this.attachRedisListeners(this.connection);
      this.attachRedisListeners(this.workerConnection);
      await withTimeout(
        Promise.all([this.connection.ping(), this.workerConnection.ping()]),
        Math.min(10_000, this.runtimeSettings.shutdownTimeoutMs),
        'WORKER_REDIS_STARTUP_TIMEOUT',
      );
      this.markRedisAvailable();

      this.queue = new Queue(INTEGRATION_QUEUE, { connection: this.connection });
      this.deadLetterQueue = new Queue(INTEGRATION_DLQ, { connection: this.connection });
      this.worker = new BullWorker<IntegrationJobData>(
        INTEGRATION_QUEUE,
        (job) =>
          withTimeout(
            this.process(job),
            this.environment.GEOCODING_HTTP_TIMEOUT_MS,
            `JOB_TIMEOUT:${safeJobName(job.name)}`,
          ),
        {
          autorun: false,
          concurrency: 4,
          connection: this.workerConnection,
        },
      );
      this.attachWorkerListeners(this.worker);
      this.acceptingWork = true;
      this.workerRun = superviseWorkerRun(
        this.worker.run(),
        () => this.stopping,
        async (error) => {
          const shutdown = this.handleWorkerRuntimeFailure(error);
          this.shutdownInFlight ??= shutdown;
          await shutdown;
        },
      );

      await this.runReconcile();
      await this.publishObservability('ready');
      this.startTimers();
      this.logger.info({
        jobName: 'worker-bootstrap',
        queue: INTEGRATION_QUEUE,
        status: 'READY',
      });
    } catch (error) {
      this.acceptingWork = false;
      this.stopping = true;
      const classification = classifyWorkerError(error);
      this.logger.error({
        errorClass: classification.errorClass,
        errorCode: classification.code,
        jobName: 'worker-bootstrap',
        status: 'FAILED',
      });
      await this.forceCloseResources();
      throw error;
    }
  }

  onApplicationShutdown(signal?: string): Promise<void> {
    this.shutdownInFlight ??= this.shutdown(signal);
    return this.shutdownInFlight;
  }

  private attachRedisListeners(connection: Redis): void {
    connection.on('error', (error: Error) => {
      const transitioned = this.markRedisUnavailable();
      if (transitioned && !this.stopping) {
        this.logger.warn({
          errorClass: error.name,
          errorCode: safeExternalErrorCode(error),
          jobName: 'worker-redis',
          status: 'UNAVAILABLE',
        });
      }
    });
    connection.on('close', () => {
      const transitioned = this.markRedisUnavailable();
      if (transitioned && !this.stopping) {
        this.logger.warn({
          errorClass: 'RedisConnectionError',
          errorCode: 'CONNECTION_CLOSED',
          jobName: 'worker-redis',
          status: 'UNAVAILABLE',
        });
      }
    });
    connection.on('ready', () => {
      this.markRedisAvailable();
    });
  }

  private attachWorkerListeners(worker: BullWorker<IntegrationJobData>): void {
    worker.on('failed', (job, error) => {
      if (!job) return;
      const handler = this.handleFailure(job, error).catch((failure: unknown) => {
        this.metrics.recordQueueOperationFailure();
        const classification = classifyWorkerError(failure);
        this.logger.error({
          errorClass: classification.errorClass,
          errorCode: classification.code,
          jobName: safeJobName(job.name),
          status: 'FAILURE_HANDLER_FAILED',
        });
      });
      this.failureHandlers.add(handler);
      void handler.finally(() => {
        this.failureHandlers.delete(handler);
      });
    });
    worker.on('stalled', () => {
      this.metrics.recordStalledJob();
    });
    worker.on('error', (error) => {
      if (this.stopping) return;
      this.logger.error({
        errorClass: error.name,
        errorCode: safeExternalErrorCode(error),
        jobName: 'worker-runtime',
        status: 'FAILED',
      });
    });
  }

  private startTimers(): void {
    this.reconcileTimer = setInterval(() => {
      void this.runReconcile();
    }, this.environment.WORKER_RECONCILE_INTERVAL_MS);
    this.reconcileTimer.unref();

    if (this.runtimeSettings.heartbeatEnabled || this.runtimeSettings.metricsEnabled) {
      this.heartbeatTimer = setInterval(() => {
        void this.publishObservability('ready');
      }, this.runtimeSettings.heartbeatIntervalMs);
      this.heartbeatTimer.unref();
    }
  }

  private async handleWorkerRuntimeFailure(error: unknown): Promise<void> {
    this.acceptingWork = false;
    this.stopping = true;
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    const classification = classifyWorkerError(error);
    this.logger.error({
      errorClass: classification.errorClass,
      errorCode: classification.code,
      jobName: 'worker-runtime',
      status: 'FAILED',
    });
    await this.publishObservability('stopping');
    process.exitCode = 1;
    await this.forceCloseResources();
  }

  private async process(job: Job<IntegrationJobData>): Promise<unknown> {
    const startedAt = Date.now();
    this.metrics.recordJobStarted();
    const data = sanitizeJobIdentifiers({ ...job.data, attempt: job.attemptsMade + 1 });
    try {
      let result: unknown;
      if (job.name === 'process-google-form-submission') {
        const next = await this.jobs.processSubmission(data);
        if (next) await this.add('geocode-contribution', next);
        result = { contributionId: next?.contributionId ?? null, processed: true };
      } else if (job.name === 'geocode-contribution') {
        const next = await this.jobs.geocode(data);
        if (next) await this.add('detect-duplicate-place', next);
        result = { duplicateDetectionQueued: Boolean(next), processed: true };
      } else if (job.name === 'detect-duplicate-place') {
        await this.jobs.detectDuplicates(data);
        result = { processed: true };
      } else {
        throw new PermanentWorkerError('UNSUPPORTED_INTEGRATION_JOB');
      }
      this.metrics.recordJobSucceeded();
      this.logger.info({
        attempt: boundedCount(job.attemptsMade + 1),
        correlationId: data.correlationId,
        durationMs: boundedCount(Date.now() - startedAt),
        jobId: safeJobId(job.id),
        jobName: safeJobName(job.name),
        requestId: data.requestId,
        status: 'SUCCEEDED',
      });
      return result;
    } catch (error) {
      if (!classifyWorkerError(error).retryable) job.discard();
      throw error;
    } finally {
      this.metrics.recordProcessingDuration(Date.now() - startedAt);
    }
  }

  private async handleFailure(job: Job<IntegrationJobData>, error: Error): Promise<void> {
    const data = sanitizeJobIdentifiers(job.data);
    const classification = classifyWorkerError(error);
    const exhausted =
      !classification.retryable ||
      job.attemptsMade >= Number(job.opts.attempts ?? integrationJobPolicy.attempts);
    this.metrics.recordJobFailure({
      databaseFailure: classification.errorClass === 'RETRYABLE_DATABASE',
      exhausted,
    });

    const jobName = pitstopJobNameOrNull(job.name);
    const inboxId = safeUlidOrNull(data.inboxId);
    if (jobName && inboxId) {
      await this.repository.recordJobFailure(inboxId, jobName, classification, exhausted);
    }
    this.logger.warn({
      attempt: boundedCount(job.attemptsMade),
      correlationId: data.correlationId,
      durationMs: boundedCount(
        typeof job.processedOn === 'number' ? Date.now() - job.processedOn : 0,
      ),
      errorClass: classification.errorClass,
      errorCode: classification.code,
      exhausted,
      inboxId,
      jobId: safeJobId(job.id),
      jobName: safeJobName(job.name),
      requestId: data.requestId,
      status: exhausted ? 'DEAD_LETTER' : 'RETRY_SCHEDULED',
    });
    if (exhausted) {
      await this.deadLetterQueue?.add(
        `${safeJobName(job.name)}-dead-letter`,
        {
          contributionId:
            'contributionId' in data ? safeUlidOrNull(data.contributionId) : undefined,
          correlationId: data.correlationId,
          errorClass: classification.errorClass,
          errorCode: classification.code,
          failedAt: new Date().toISOString(),
          inboxId,
          jobName: safeJobName(job.name),
          requestId: data.requestId,
        },
        {
          jobId: `${safeJobName(job.name)}-${inboxId ?? 'invalid'}-${boundedCount(job.attemptsMade)}`,
          removeOnComplete: false,
          removeOnFail: false,
        },
      );
    }
  }

  private async runReconcile(): Promise<void> {
    if (!this.acceptingWork) return;
    if (this.reconcileInFlight) {
      await this.reconcileInFlight;
      return;
    }
    const operation = this.reconcile();
    this.reconcileInFlight = operation;
    try {
      await operation;
    } finally {
      if (this.reconcileInFlight === operation) this.reconcileInFlight = undefined;
    }
  }

  private async reconcile(): Promise<void> {
    if (!this.queue) return;
    try {
      const [processJobs, geocodeBatch, duplicateBatch] = await Promise.all([
        this.repository.findEnqueueCandidates(),
        this.repository.claimGeocodingCandidatesWithStats(
          this.environment.WORKER_STAGE_LEASE_SECONDS,
        ),
        this.repository.claimDuplicateCandidatesWithStats(
          this.environment.WORKER_STAGE_LEASE_SECONDS,
        ),
      ]);
      const staleRecovered = geocodeBatch.staleRecovered + duplicateBatch.staleRecovered;
      this.metrics.recordStaleLeaseRecovery(staleRecovered);
      for (const job of processJobs) {
        await this.add('process-google-form-submission', job);
        await this.repository.markQueued(job.inboxId);
      }
      for (const job of geocodeBatch.jobs) await this.add('geocode-contribution', job);
      for (const job of duplicateBatch.jobs) await this.add('detect-duplicate-place', job);
      if (processJobs.length + geocodeBatch.jobs.length + duplicateBatch.jobs.length > 0) {
        this.logger.info({
          duplicateJobs: duplicateBatch.jobs.length,
          geocodeJobs: geocodeBatch.jobs.length,
          jobName: 'integration-reconciliation',
          processJobs: processJobs.length,
          staleRecovered,
          status: 'ENQUEUED',
        });
      }
    } catch (error) {
      const classification = classifyWorkerError(error);
      if (classification.errorClass === 'RETRYABLE_DATABASE') {
        this.metrics.recordDatabaseFailure();
      } else {
        this.metrics.recordQueueOperationFailure();
      }
      this.logger.error({
        errorClass: classification.errorClass,
        errorCode: classification.code,
        jobName: 'integration-reconciliation',
        status: 'FAILED',
      });
    }
  }

  private async add(name: PitstopJobName, data: IntegrationJobData): Promise<void> {
    await this.queue?.add(name, sanitizeJobIdentifiers(data), {
      ...integrationJobPolicy,
      jobId: `${name}-${data.inboxId}`,
    });
  }

  private publishObservability(state: WorkerOperationalState): Promise<void> {
    if (!this.runtimeSettings.heartbeatEnabled && !this.runtimeSettings.metricsEnabled) {
      return Promise.resolve();
    }
    if (this.observabilityInFlight) return this.observabilityInFlight;
    const operation = this.writeObservability(state).finally(() => {
      if (this.observabilityInFlight === operation) this.observabilityInFlight = undefined;
    });
    this.observabilityInFlight = operation;
    return operation;
  }

  private async writeObservability(state: WorkerOperationalState): Promise<void> {
    if (!this.connection || !this.queue || !this.deadLetterQueue) return;
    try {
      const [integrationCounts, deadLetterCounts] = await Promise.all([
        this.queue.getJobCounts('waiting', 'active', 'delayed', 'failed'),
        this.deadLetterQueue.getJobCounts('waiting', 'failed'),
      ]);
      const queue: WorkerQueueSnapshot = {
        deadLetter: {
          failed: boundedCount(deadLetterCounts.failed),
          waiting: boundedCount(deadLetterCounts.waiting),
        },
        integration: {
          active: boundedCount(integrationCounts.active),
          delayed: boundedCount(integrationCounts.delayed),
          failed: boundedCount(integrationCounts.failed),
          waiting: boundedCount(integrationCounts.waiting),
        },
      };
      const snapshot = this.metrics.snapshot(this.runtimeSettings, state, queue);
      const pipeline = this.connection.pipeline();
      if (this.runtimeSettings.heartbeatEnabled) {
        pipeline.set(
          WORKER_HEARTBEAT_KEY,
          JSON.stringify(snapshot.heartbeat),
          'EX',
          this.runtimeSettings.heartbeatTtlSeconds,
        );
      }
      if (this.runtimeSettings.metricsEnabled) {
        pipeline.set(
          WORKER_METRICS_KEY,
          JSON.stringify(snapshot.metrics),
          'EX',
          this.runtimeSettings.heartbeatTtlSeconds,
        );
      }
      const result = await pipeline.exec();
      const writeError = result?.find(([error]) => error)?.[0];
      if (writeError) throw writeError;
      this.markRedisAvailable();
    } catch (error) {
      this.metrics.recordQueueOperationFailure();
      const transitioned = this.markRedisUnavailable();
      if (transitioned && !this.stopping) {
        const classification = classifyWorkerError(error);
        this.logger.warn({
          errorClass: classification.errorClass,
          errorCode: classification.code,
          jobName: 'worker-observability',
          status: 'WRITE_FAILED',
        });
      }
    }
  }

  private async shutdown(signal?: string): Promise<void> {
    this.acceptingWork = false;
    this.stopping = true;
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.logger.info({
      jobName: 'worker-shutdown',
      signal: safeShutdownSignal(signal),
      status: 'STOPPING',
    });

    try {
      await runBoundedShutdown(
        [
          async () => {
            await this.worker?.pause(true);
          },
          async () => {
            await this.publishObservability('stopping');
          },
          async () => {
            await this.reconcileInFlight;
          },
          async () => {
            await this.worker?.close(false);
            await this.workerRun;
          },
          async () => {
            await this.waitForFailureHandlers();
          },
          async () => {
            await this.publishObservability('stopping');
          },
          async () => {
            await this.queue?.close();
            await this.deadLetterQueue?.close();
          },
          async () => {
            await this.workerConnection?.quit();
            await this.connection?.quit();
          },
          async () => {
            await this.closeDatabase();
          },
        ],
        this.runtimeSettings.shutdownTimeoutMs,
      );
      this.logger.info({
        jobName: 'worker-shutdown',
        signal: safeShutdownSignal(signal),
        status: 'STOPPED',
      });
    } catch (error) {
      const classification = classifyWorkerError(error);
      this.logger.error({
        errorClass: classification.errorClass,
        errorCode: classification.code,
        jobName: 'worker-shutdown',
        signal: safeShutdownSignal(signal),
        status: 'FORCED',
      });
      process.exitCode = 1;
      await this.forceCloseResources();
      throw error;
    }
  }

  private async waitForFailureHandlers(): Promise<void> {
    while (this.failureHandlers.size > 0) {
      await Promise.all([...this.failureHandlers]);
    }
  }

  private markRedisAvailable(): void {
    if (this.redisAvailable) return;
    const recovered = this.redisEverReady;
    this.redisAvailable = true;
    this.redisEverReady = true;
    this.metrics.recordRedisAvailable(recovered);
    if (recovered && !this.stopping) {
      this.logger.info({
        jobName: 'worker-redis',
        status: 'RECOVERED',
      });
    }
  }

  private markRedisUnavailable(): boolean {
    if (!this.redisAvailable) return false;
    this.redisAvailable = false;
    this.metrics.recordRedisUnavailable();
    return true;
  }

  private async forceCloseResources(): Promise<void> {
    if (this.worker) void this.worker.close(true).catch(() => undefined);
    this.workerConnection?.disconnect();
    this.connection?.disconnect();
    try {
      await withTimeout(this.closeDatabase(), 1_000, 'WORKER_DATABASE_FORCE_CLOSE_TIMEOUT');
    } catch {
      // The process is already marked unhealthy; do not extend shutdown beyond the hard deadline.
    }
  }

  private closeDatabase(): Promise<void> {
    this.databaseClose ??= this.databasePool.end();
    return this.databaseClose;
  }
}

export async function runBoundedShutdown(
  steps: readonly (() => Promise<void>)[],
  timeoutMilliseconds: number,
): Promise<void> {
  await withTimeout(
    (async () => {
      for (const step of steps) await step();
    })(),
    timeoutMilliseconds,
    'WORKER_SHUTDOWN_TIMEOUT',
  );
}

export async function superviseWorkerRun(
  run: Promise<void>,
  isStopping: () => boolean,
  onUnexpectedFailure: (error: unknown) => Promise<void>,
): Promise<void> {
  try {
    await run;
  } catch (error) {
    if (!isStopping()) await onUnexpectedFailure(error);
  }
}

export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMilliseconds: number,
  code = 'JOB_TIMEOUT',
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(code)), timeoutMilliseconds);
        timer.unref();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function pitstopJobNameOrNull(value: string): PitstopJobName | null {
  return integrationJobNames.has(value as PitstopJobName) ? (value as PitstopJobName) : null;
}

function safeJobName(value: string): string {
  return pitstopJobNameOrNull(value) ?? 'unsupported-integration-job';
}

function safeJobId(value: number | string | undefined): string {
  const normalized = String(value ?? '');
  return normalized.length > 0 &&
    normalized.length <= 128 &&
    /^[A-Za-z0-9](?:[A-Za-z0-9._:-]*)$/.test(normalized)
    ? normalized
    : 'unknown';
}

function safeUlidOrNull(value: unknown): string | null {
  return typeof value === 'string' && ulidPattern.test(value) ? value : null;
}

function safeShutdownSignal(value: string | undefined): 'SIGINT' | 'SIGTERM' | 'application' {
  return value === 'SIGINT' || value === 'SIGTERM' ? value : 'application';
}

function safeExternalErrorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null) return 'UNKNOWN';
  const value = Reflect.get(error, 'code');
  return typeof value === 'string' && /^[A-Z0-9_-]{1,64}$/.test(value) ? value : 'UNKNOWN';
}

function boundedCount(value: number | undefined): number {
  return Number.isFinite(value)
    ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(value ?? 0)))
    : 0;
}
