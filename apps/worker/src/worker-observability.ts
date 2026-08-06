import { randomUUID } from 'node:crypto';

export const WORKER_HEARTBEAT_KEY = 'pitstop:worker:v1:integration:heartbeat';
export const WORKER_METRICS_KEY = 'pitstop:worker:v1:integration:metrics';

export const workerLogRedactPaths = [
  'authorization',
  'cookie',
  'csrfToken',
  'email',
  'hmacSignature',
  'job.data',
  'latitude',
  'longitude',
  'magicToken',
  'password',
  'payload',
  'raw',
  'rawPayload',
  'req.headers',
  'request.headers',
  'res.headers',
  'response.headers',
  'secret',
  'setCookie',
  'signature',
  'token',
  '*.authorization',
  '*.cookie',
  '*.csrfToken',
  '*.email',
  '*.hmacSignature',
  '*.latitude',
  '*.longitude',
  '*.magicToken',
  '*.password',
  '*.payload',
  '*.rawPayload',
  '*.secret',
  '*.setCookie',
  '*.signature',
  '*.token',
] as const;

const correlationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const safeReleasePattern = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/;
const safeLogLevels = new Set(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']);

export interface WorkerRuntimeSettings {
  readonly environment: 'development' | 'production' | 'test' | 'unknown';
  readonly heartbeatEnabled: boolean;
  readonly heartbeatIntervalMs: number;
  readonly heartbeatTtlSeconds: number;
  readonly logLevel: string;
  readonly metricsEnabled: boolean;
  readonly release: string;
  readonly service: 'pitstop-worker';
  readonly shutdownTimeoutMs: number;
}

export interface WorkerQueueCounts {
  readonly active: number;
  readonly delayed: number;
  readonly failed: number;
  readonly waiting: number;
}

export interface WorkerDeadLetterQueueCounts {
  readonly failed: number;
  readonly waiting: number;
}

export interface WorkerQueueSnapshot {
  readonly deadLetter: WorkerDeadLetterQueueCounts;
  readonly integration: WorkerQueueCounts;
}

export type WorkerOperationalState = 'ready' | 'stopping';

interface WorkerMetricCounters {
  databaseFailuresTotal: number;
  jobsDeadLetteredTotal: number;
  jobsFailedTotal: number;
  jobsProcessedTotal: number;
  jobsRetriedTotal: number;
  jobsSucceededTotal: number;
  queueOperationFailuresTotal: number;
  redisRecoveriesTotal: number;
  redisUnavailableTotal: number;
  staleLeasesRecoveredTotal: number;
  stalledJobsTotal: number;
}

interface WorkerProcessingDuration {
  count: number;
  maximumMs: number;
  totalMs: number;
}

export interface WorkerMetricsSnapshot {
  readonly counters: Readonly<WorkerMetricCounters>;
  readonly dependency: {
    readonly redisAvailable: boolean;
  };
  readonly environment: WorkerRuntimeSettings['environment'];
  readonly observedAt: string;
  readonly processingDurationMs: Readonly<WorkerProcessingDuration>;
  readonly queue: WorkerQueueSnapshot;
  readonly release: string;
  readonly schemaVersion: 1;
  readonly service: WorkerRuntimeSettings['service'];
  readonly startedAt: string;
  readonly state: WorkerOperationalState;
}

export interface WorkerHeartbeat {
  readonly counters: Pick<
    WorkerMetricCounters,
    | 'jobsDeadLetteredTotal'
    | 'jobsFailedTotal'
    | 'jobsProcessedTotal'
    | 'jobsRetriedTotal'
    | 'jobsSucceededTotal'
    | 'staleLeasesRecoveredTotal'
  >;
  readonly environment: WorkerRuntimeSettings['environment'];
  readonly lastSuccessfulActivityAt: string | null;
  readonly observedAt: string;
  readonly queue: WorkerQueueSnapshot;
  readonly release: string;
  readonly schemaVersion: 1;
  readonly service: WorkerRuntimeSettings['service'];
  readonly startedAt: string;
  readonly state: WorkerOperationalState;
}

export class WorkerMetrics {
  private readonly counters: WorkerMetricCounters = {
    databaseFailuresTotal: 0,
    jobsDeadLetteredTotal: 0,
    jobsFailedTotal: 0,
    jobsProcessedTotal: 0,
    jobsRetriedTotal: 0,
    jobsSucceededTotal: 0,
    queueOperationFailuresTotal: 0,
    redisRecoveriesTotal: 0,
    redisUnavailableTotal: 0,
    staleLeasesRecoveredTotal: 0,
    stalledJobsTotal: 0,
  };
  private lastSuccessfulActivityAt: string | null = null;
  private readonly processingDuration: WorkerProcessingDuration = {
    count: 0,
    maximumMs: 0,
    totalMs: 0,
  };
  private redisAvailable = false;
  private readonly startedAt = new Date().toISOString();

  recordJobStarted(): void {
    increment(this.counters, 'jobsProcessedTotal');
  }

  recordJobSucceeded(at = new Date()): void {
    increment(this.counters, 'jobsSucceededTotal');
    this.lastSuccessfulActivityAt = at.toISOString();
  }

  recordJobFailure(input: {
    readonly databaseFailure: boolean;
    readonly exhausted: boolean;
  }): void {
    increment(this.counters, 'jobsFailedTotal');
    increment(this.counters, input.exhausted ? 'jobsDeadLetteredTotal' : 'jobsRetriedTotal');
    if (input.databaseFailure) increment(this.counters, 'databaseFailuresTotal');
  }

  recordDatabaseFailure(): void {
    increment(this.counters, 'databaseFailuresTotal');
  }

  recordProcessingDuration(durationMs: number): void {
    const boundedDuration = boundedMetricValue(durationMs);
    increment(this.processingDuration, 'count');
    this.processingDuration.totalMs = addBounded(this.processingDuration.totalMs, boundedDuration);
    this.processingDuration.maximumMs = Math.max(
      this.processingDuration.maximumMs,
      boundedDuration,
    );
  }

  recordQueueOperationFailure(): void {
    increment(this.counters, 'queueOperationFailuresTotal');
  }

  recordRedisAvailable(recovered: boolean): void {
    this.redisAvailable = true;
    if (recovered) increment(this.counters, 'redisRecoveriesTotal');
  }

  recordRedisUnavailable(): void {
    this.redisAvailable = false;
    increment(this.counters, 'redisUnavailableTotal');
  }

  recordStaleLeaseRecovery(count: number): void {
    this.counters.staleLeasesRecoveredTotal = addBounded(
      this.counters.staleLeasesRecoveredTotal,
      boundedMetricValue(count),
    );
  }

  recordStalledJob(): void {
    increment(this.counters, 'stalledJobsTotal');
  }

  snapshot(
    settings: WorkerRuntimeSettings,
    state: WorkerOperationalState,
    queue: WorkerQueueSnapshot,
    observedAt = new Date(),
  ): { readonly heartbeat: WorkerHeartbeat; readonly metrics: WorkerMetricsSnapshot } {
    const observedAtIso = observedAt.toISOString();
    const counters = { ...this.counters };
    const shared = {
      environment: settings.environment,
      observedAt: observedAtIso,
      queue,
      release: settings.release,
      schemaVersion: 1 as const,
      service: settings.service,
      startedAt: this.startedAt,
      state,
    };
    return {
      heartbeat: {
        ...shared,
        counters: {
          jobsDeadLetteredTotal: counters.jobsDeadLetteredTotal,
          jobsFailedTotal: counters.jobsFailedTotal,
          jobsProcessedTotal: counters.jobsProcessedTotal,
          jobsRetriedTotal: counters.jobsRetriedTotal,
          jobsSucceededTotal: counters.jobsSucceededTotal,
          staleLeasesRecoveredTotal: counters.staleLeasesRecoveredTotal,
        },
        lastSuccessfulActivityAt: this.lastSuccessfulActivityAt,
      },
      metrics: {
        ...shared,
        counters,
        dependency: { redisAvailable: this.redisAvailable },
        processingDurationMs: { ...this.processingDuration },
      },
    };
  }
}

export function readWorkerRuntimeSettings(
  environment: NodeJS.ProcessEnv = process.env,
): WorkerRuntimeSettings {
  const configuredLogLevel = environment.LOG_LEVEL;
  const heartbeatIntervalMs = boundedInteger(
    environment.WORKER_HEARTBEAT_INTERVAL_MS,
    10_000,
    1_000,
    60_000,
  );
  const minimumHeartbeatTtl = Math.ceil(heartbeatIntervalMs / 1_000) * 3;
  const configuredHeartbeatTtl = boundedInteger(
    environment.WORKER_HEARTBEAT_TTL_SECONDS,
    30,
    5,
    300,
  );
  return {
    environment: safeEnvironment(environment.NODE_ENV),
    heartbeatEnabled: true,
    heartbeatIntervalMs,
    heartbeatTtlSeconds: Math.min(300, Math.max(minimumHeartbeatTtl, configuredHeartbeatTtl)),
    logLevel:
      configuredLogLevel && safeLogLevels.has(configuredLogLevel) ? configuredLogLevel : 'info',
    metricsEnabled: environment.METRICS_ENABLED === 'true',
    release: safeRelease(environment.RELEASE_VERSION),
    service: 'pitstop-worker',
    shutdownTimeoutMs: boundedInteger(
      environment.GRACEFUL_SHUTDOWN_TIMEOUT_MS,
      30_000,
      1_000,
      120_000,
    ),
  };
}

export function sanitizeJobIdentifiers<T extends { correlationId: string; requestId: string }>(
  job: T,
): T {
  const validCorrelationId = validCorrelationIdOrNull(job.correlationId);
  const validRequestId = validRequestIdOrNull(job.requestId);
  const requestIdAsCorrelationId = validCorrelationIdOrNull(validRequestId);
  const correlationId =
    validCorrelationId ?? requestIdAsCorrelationId ?? `wrk_${randomUUID().replaceAll('-', '')}`;
  return {
    ...job,
    correlationId,
    requestId: validRequestId ?? correlationId,
  };
}

export function isValidCorrelationId(value: unknown): value is string {
  return typeof value === 'string' && correlationIdPattern.test(value);
}

export function isValidRequestId(value: unknown): value is string {
  return typeof value === 'string' && requestIdPattern.test(value);
}

function validCorrelationIdOrNull(value: unknown): string | null {
  return isValidCorrelationId(value) ? value : null;
}

function validRequestIdOrNull(value: unknown): string | null {
  return isValidRequestId(value) ? value : null;
}

function safeEnvironment(value: string | undefined): WorkerRuntimeSettings['environment'] {
  return value === 'development' || value === 'production' || value === 'test' ? value : 'unknown';
}

function safeRelease(value: string | undefined): string {
  return value && safeReleasePattern.test(value) ? value : 'unknown';
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function boundedMetricValue(value: number): number {
  return Number.isFinite(value)
    ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(value)))
    : 0;
}

function addBounded(left: number, right: number): number {
  return Math.min(Number.MAX_SAFE_INTEGER, left + right);
}

function increment<T extends Record<K, number>, K extends keyof T>(record: T, key: K): void {
  record[key] = addBounded(record[key], 1) as T[K];
}
