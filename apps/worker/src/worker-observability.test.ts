import { Writable } from 'node:stream';

import pino from 'pino';
import { describe, expect, it } from 'vitest';

import { runBoundedShutdown } from './worker-lifecycle.service';
import {
  isValidCorrelationId,
  readWorkerRuntimeSettings,
  sanitizeJobIdentifiers,
  workerLogRedactPaths,
  WorkerMetrics,
  type WorkerQueueSnapshot,
} from './worker-observability';

const emptyQueue: WorkerQueueSnapshot = {
  deadLetter: { failed: 0, waiting: 0 },
  integration: { active: 0, delayed: 0, failed: 0, waiting: 0 },
};

describe('Phase 11 worker observability', () => {
  it('uses bounded runtime settings and shared configuration aliases', () => {
    expect(
      readWorkerRuntimeSettings({
        GRACEFUL_SHUTDOWN_TIMEOUT_MS: '45000',
        METRICS_ENABLED: 'true',
        NODE_ENV: 'production',
        RELEASE_VERSION: 'release.2026-07-31+1',
        WORKER_HEARTBEAT_INTERVAL_MS: '20000',
        WORKER_HEARTBEAT_TTL_SECONDS: '30',
      }),
    ).toMatchObject({
      environment: 'production',
      heartbeatIntervalMs: 20_000,
      heartbeatTtlSeconds: 60,
      metricsEnabled: true,
      release: 'release.2026-07-31+1',
      shutdownTimeoutMs: 45_000,
    });
    expect(
      readWorkerRuntimeSettings({
        GRACEFUL_SHUTDOWN_TIMEOUT_MS: 'unbounded',
        METRICS_ENABLED: 'unexpected',
        NODE_ENV: 'unexpected',
        RELEASE_VERSION: 'release with whitespace',
        WORKER_HEARTBEAT_INTERVAL_MS: '0',
      }),
    ).toMatchObject({
      environment: 'unknown',
      heartbeatIntervalMs: 10_000,
      metricsEnabled: false,
      release: 'unknown',
      shutdownTimeoutMs: 30_000,
    });
  });

  it('preserves safe correlation and replaces control characters or oversized values', () => {
    const valid = sanitizeJobIdentifiers({
      correlationId: 'request-01K12345678901234567890123',
      requestId: 'request-01K12345678901234567890123',
    });
    expect(valid.requestId).toBe(valid.correlationId);
    expect(isValidCorrelationId(valid.correlationId)).toBe(true);

    const recovered = sanitizeJobIdentifiers({
      correlationId: 'attacker\r\nforged-log',
      requestId: 'safe-request-id',
    });
    expect(recovered).toEqual({
      correlationId: 'safe-request-id',
      requestId: 'safe-request-id',
    });

    const requestWithColon = sanitizeJobIdentifiers({
      correlationId: 'invalid:correlation',
      requestId: 'request:valid',
    });
    expect(requestWithColon.requestId).toBe('request:valid');
    expect(requestWithColon.correlationId).not.toContain(':');
    expect(isValidCorrelationId(requestWithColon.correlationId)).toBe(true);

    const replaced = sanitizeJobIdentifiers({
      correlationId: 'x'.repeat(65),
      requestId: '<invalid>',
    });
    expect(replaced.requestId).toBe(replaced.correlationId);
    expect(isValidCorrelationId(replaced.correlationId)).toBe(true);
    expect(replaced.correlationId).not.toContain('x'.repeat(65));
  });

  it('records fixed-cardinality job, retry, DLQ, recovery, duration, and queue metrics', () => {
    const settings = readWorkerRuntimeSettings({
      METRICS_ENABLED: 'true',
      NODE_ENV: 'test',
      RELEASE_VERSION: 'test',
    });
    const metrics = new WorkerMetrics();
    metrics.recordRedisAvailable(false);
    metrics.recordJobStarted();
    metrics.recordProcessingDuration(12.8);
    metrics.recordJobSucceeded(new Date('2026-07-31T00:00:00.000Z'));
    metrics.recordJobStarted();
    metrics.recordProcessingDuration(7);
    metrics.recordJobFailure({ databaseFailure: true, exhausted: false });
    metrics.recordJobFailure({ databaseFailure: false, exhausted: true });
    metrics.recordStaleLeaseRecovery(2);
    metrics.recordStalledJob();
    metrics.recordRedisUnavailable();
    metrics.recordRedisAvailable(true);

    const snapshot = metrics.snapshot(
      settings,
      'ready',
      {
        deadLetter: { failed: 1, waiting: 2 },
        integration: { active: 1, delayed: 2, failed: 3, waiting: 4 },
      },
      new Date('2026-07-31T00:00:01.000Z'),
    );
    expect(snapshot.heartbeat).toMatchObject({
      lastSuccessfulActivityAt: '2026-07-31T00:00:00.000Z',
      observedAt: '2026-07-31T00:00:01.000Z',
      schemaVersion: 1,
      state: 'ready',
    });
    expect(snapshot.metrics.counters).toMatchObject({
      databaseFailuresTotal: 1,
      jobsDeadLetteredTotal: 1,
      jobsFailedTotal: 2,
      jobsProcessedTotal: 2,
      jobsRetriedTotal: 1,
      jobsSucceededTotal: 1,
      redisRecoveriesTotal: 1,
      redisUnavailableTotal: 1,
      staleLeasesRecoveredTotal: 2,
      stalledJobsTotal: 1,
    });
    expect(snapshot.metrics.processingDurationMs).toEqual({
      count: 2,
      maximumMs: 12,
      totalMs: 19,
    });
    expect(snapshot.metrics.queue.integration).toEqual({
      active: 1,
      delayed: 2,
      failed: 3,
      waiting: 4,
    });
    expect(JSON.stringify(snapshot)).not.toMatch(
      /requestId|correlationId|userId|email|placeId|inboxId/,
    );
  });

  it('redacts credentials, payload, email, signatures, and precise coordinates from Pino logs', () => {
    let output = '';
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });
    const logger = pino(
      {
        base: { environment: 'test', release: 'test', service: 'pitstop-worker' },
        redact: { censor: '[REDACTED]', paths: [...workerLogRedactPaths] },
      },
      destination,
    );
    logger.info({
      authorization: 'Bearer raw-secret',
      email: 'driver@example.com',
      job: {
        data: {
          evidence: 'private evidence',
          latitude: -6.1468,
          longitude: 106.8061,
        },
      },
      payload: { signature: 'raw-signature' },
      safeStatus: 'READY',
    });

    expect(output).toContain('"safeStatus":"READY"');
    expect(output).toContain('"service":"pitstop-worker"');
    expect(output).toContain('[REDACTED]');
    expect(output).not.toMatch(
      /raw-secret|driver@example\.com|private evidence|raw-signature|106\.8061|-6\.1468/,
    );
  });

  it('runs shutdown steps in order and enforces the hard deadline', async () => {
    const order: string[] = [];
    await runBoundedShutdown(
      [
        async () => {
          order.push('pause');
        },
        async () => {
          order.push('drain');
        },
        async () => {
          order.push('close');
        },
      ],
      1_000,
    );
    expect(order).toEqual(['pause', 'drain', 'close']);

    await expect(
      runBoundedShutdown([() => new Promise<void>(() => undefined)], 10),
    ).rejects.toThrow('WORKER_SHUTDOWN_TIMEOUT');
  });

  it('emits a bounded empty snapshot without dynamic labels', () => {
    const settings = readWorkerRuntimeSettings({ NODE_ENV: 'test' });
    const snapshot = new WorkerMetrics().snapshot(
      settings,
      'stopping',
      emptyQueue,
      new Date('2026-07-31T00:00:00.000Z'),
    );
    expect(Object.keys(snapshot.metrics.counters).sort()).toEqual([
      'databaseFailuresTotal',
      'jobsDeadLetteredTotal',
      'jobsFailedTotal',
      'jobsProcessedTotal',
      'jobsRetriedTotal',
      'jobsSucceededTotal',
      'queueOperationFailuresTotal',
      'redisRecoveriesTotal',
      'redisUnavailableTotal',
      'staleLeasesRecoveredTotal',
      'stalledJobsTotal',
    ]);
    expect(snapshot.heartbeat.state).toBe('stopping');
  });
});
