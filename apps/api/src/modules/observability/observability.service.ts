import { Inject, Injectable } from '@nestjs/common';
import type {
  AdminSystemDiagnostics,
  DomainBacklogDiagnostics,
  QueueDiagnostics,
  WorkerDiagnostics,
} from '@pitstop/contracts';
import { pingDatabase, type Pool, type RowDataPacket } from '@pitstop/database';

import { DATABASE_POOL } from '../../common/database/database.module';
import { RedisService } from '../../common/redis/redis.service';
import { API_ENVIRONMENT, type ApiEnvironmentProvider } from '../../configuration';
import { MetricsRegistry } from './metrics-registry';

const WORKER_HEARTBEAT_KEY = 'pitstop:worker:v1:integration:heartbeat';
const WORKER_METRICS_KEY = 'pitstop:worker:v1:integration:metrics';

interface BacklogRow extends RowDataPacket {
  readonly contributions_pending: number | string;
  readonly google_form_dlq: number | string;
  readonly google_form_inbox: number | string;
  readonly reports_pending: number | string;
}

interface WorkerHeartbeat {
  readonly lastSuccessfulActivityAt: string | null;
  readonly metrics: WorkerMetrics;
  readonly observedAt: string;
  readonly queues: QueueDiagnostics;
  readonly state: 'ready' | 'stopping';
}

interface WorkerMetrics {
  readonly dlq: number;
  readonly failed: number;
  readonly processed: number;
  readonly retried: number;
  readonly staleLeaseRecoveries: number;
  readonly succeeded: number;
}

const EMPTY_QUEUES: QueueDiagnostics = {
  active: 0,
  delayed: 0,
  dlq: 0,
  failed: 0,
  waiting: 0,
};

const EMPTY_BACKLOG: DomainBacklogDiagnostics = {
  contributionsPending: 0,
  googleFormDlq: 0,
  googleFormInbox: 0,
  reportsPendingOrInReview: 0,
};

@Injectable()
export class ObservabilityService {
  constructor(
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironmentProvider,
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(MetricsRegistry) private readonly metrics: MetricsRegistry,
  ) {}

  async diagnostics(): Promise<AdminSystemDiagnostics> {
    const [databaseUp, redisUp, backlog, workerState] = await Promise.all([
      this.withTimeout(pingDatabase(this.pool), false),
      this.withTimeout(this.redis.ping(), false),
      this.readBacklog(),
      this.readWorkerState(),
    ]);
    const queueUp = redisUp;
    this.metrics.set(
      'pitstop_dependency_available',
      { dependency: 'database' },
      databaseUp ? 1 : 0,
    );
    this.metrics.set('pitstop_dependency_available', { dependency: 'redis' }, redisUp ? 1 : 0);
    this.metrics.set('pitstop_dependency_available', { dependency: 'queue' }, queueUp ? 1 : 0);
    if (!databaseUp) {
      this.metrics.increment('pitstop_dependency_operation_failures_total', {
        dependency: 'database',
        operation: 'diagnostics',
      });
    }
    if (!redisUp) {
      this.metrics.increment('pitstop_dependency_operation_failures_total', {
        dependency: 'redis',
        operation: 'diagnostics',
      });
    }
    this.publishBacklogMetrics(backlog);
    this.publishWorkerMetrics(workerState);

    return {
      backlog,
      dependencies: {
        database: databaseUp ? 'up' : 'down',
        queue: queueUp ? 'up' : 'down',
        redis: redisUp ? 'up' : 'down',
      },
      environment: this.environment.NODE_ENV,
      generatedAt: new Date().toISOString(),
      queues: workerState.queues,
      release: this.environment.RELEASE_VERSION,
      service: 'pitstop-api',
      status: databaseUp && redisUp && queueUp ? 'ready' : 'not_ready',
      worker: workerState.worker,
    };
  }

  async refreshMetrics(): Promise<void> {
    await this.diagnostics();
  }

  private async readBacklog(): Promise<DomainBacklogDiagnostics> {
    try {
      const result = await this.withTimeout(
        this.pool.execute<BacklogRow[]>(
          `
          SELECT
            (SELECT COUNT(*) FROM contributions
              WHERE contribution_status IN (?, ?)) AS contributions_pending,
            (SELECT COUNT(*) FROM place_reports
              WHERE report_status IN (?, ?)) AS reports_pending,
            (SELECT COUNT(*) FROM google_form_submissions
              WHERE processing_status IN (?, ?, ?, ?)) AS google_form_inbox,
            (SELECT COUNT(*) FROM google_form_submissions
              WHERE processing_status = ?) AS google_form_dlq
        `,
          [
            'PENDING',
            'IN_REVIEW',
            'PENDING',
            'IN_REVIEW',
            'RECEIVED',
            'QUEUED',
            'PROCESSING',
            'RETRYABLE_FAILURE',
            'DEAD_LETTER',
          ],
        ),
        null,
      );
      const row = result?.[0][0];
      if (!row) return EMPTY_BACKLOG;
      return {
        contributionsPending: safeCount(row.contributions_pending),
        googleFormDlq: safeCount(row.google_form_dlq),
        googleFormInbox: safeCount(row.google_form_inbox),
        reportsPendingOrInReview: safeCount(row.reports_pending),
      };
    } catch {
      this.metrics.increment('pitstop_dependency_operation_failures_total', {
        dependency: 'database',
        operation: 'backlog',
      });
      return EMPTY_BACKLOG;
    }
  }

  private async readWorkerState(): Promise<{
    readonly metrics: WorkerMetrics;
    readonly queues: QueueDiagnostics;
    readonly worker: WorkerDiagnostics;
  }> {
    let raw: (string | null)[] | null;
    try {
      raw = await this.withTimeout(
        this.redis.run((client) => client.mget(WORKER_HEARTBEAT_KEY, WORKER_METRICS_KEY)),
        null,
      );
    } catch {
      this.metrics.increment('pitstop_dependency_operation_failures_total', {
        dependency: 'redis',
        operation: 'worker_state',
      });
      raw = null;
    }
    const heartbeat = parseHeartbeat(raw?.[0]);
    const workerMetrics = parseWorkerMetrics(raw?.[1], heartbeat?.metrics);
    if (!heartbeat) {
      return {
        metrics: workerMetrics,
        queues: EMPTY_QUEUES,
        worker: {
          lastHeartbeatAt: null,
          lastSuccessfulActivityAt: null,
          state: 'unavailable',
        },
      };
    }
    const heartbeatTime = Date.parse(heartbeat.observedAt);
    const stale =
      !Number.isFinite(heartbeatTime) ||
      Date.now() - heartbeatTime > this.environment.WORKER_HEARTBEAT_TTL_SECONDS * 1_000;
    return {
      metrics: workerMetrics,
      queues: heartbeat.queues,
      worker: {
        lastHeartbeatAt: heartbeat.observedAt,
        lastSuccessfulActivityAt: heartbeat.lastSuccessfulActivityAt,
        state: stale ? 'stale' : heartbeat.state,
      },
    };
  }

  private publishBacklogMetrics(backlog: DomainBacklogDiagnostics): void {
    const values = {
      contributions_pending: backlog.contributionsPending,
      google_form_dlq: backlog.googleFormDlq,
      google_form_inbox: backlog.googleFormInbox,
      reports_pending_or_in_review: backlog.reportsPendingOrInReview,
    };
    for (const [kind, value] of Object.entries(values)) {
      this.metrics.set('pitstop_domain_backlog', { kind }, value);
    }
  }

  private publishWorkerMetrics(state: {
    readonly metrics: WorkerMetrics;
    readonly queues: QueueDiagnostics;
    readonly worker: WorkerDiagnostics;
  }): void {
    this.metrics.set(
      'pitstop_worker_up',
      {},
      state.worker.state === 'ready' || state.worker.state === 'stopping' ? 1 : 0,
    );
    for (const [queueState, value] of Object.entries(state.queues)) {
      this.metrics.set('pitstop_worker_queue_jobs', { state: queueState }, value);
    }
    for (const [outcome, value] of Object.entries({
      dlq: state.metrics.dlq,
      failed: state.metrics.failed,
      processed: state.metrics.processed,
      retried: state.metrics.retried,
      succeeded: state.metrics.succeeded,
    })) {
      this.metrics.set('pitstop_worker_jobs_total', { outcome }, value);
    }
    this.metrics.set(
      'pitstop_worker_stale_lease_recoveries_total',
      {},
      state.metrics.staleLeaseRecoveries,
    );
  }

  private async withTimeout<T>(operation: Promise<T>, fallback: T): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<T>((resolve) => {
          timeout = setTimeout(
            () => resolve(fallback),
            this.environment.HEALTH_DEPENDENCY_TIMEOUT_MS,
          );
          timeout.unref();
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}

function parseHeartbeat(value: string | null | undefined): WorkerHeartbeat | null {
  const parsed = parseJsonRecord(value);
  if (!parsed || parsed.schemaVersion !== 1) return null;
  if (parsed.state !== 'ready' && parsed.state !== 'stopping') return null;
  if (!isIsoTimestamp(parsed.observedAt)) return null;
  if (
    parsed.lastSuccessfulActivityAt !== null &&
    !isIsoTimestamp(parsed.lastSuccessfulActivityAt)
  ) {
    return null;
  }
  const queues = parseQueues(parsed.queues);
  const workerQueue = queues ?? parseQueues(parsed.queue);
  if (!workerQueue) return null;
  return {
    lastSuccessfulActivityAt: parsed.lastSuccessfulActivityAt as string | null,
    metrics: parseWorkerCounters(parsed.counters),
    observedAt: parsed.observedAt as string,
    queues: workerQueue,
    state: parsed.state,
  };
}

function parseWorkerMetrics(
  value: string | null | undefined,
  fallback: WorkerMetrics = emptyWorkerMetrics(),
): WorkerMetrics {
  const parsed = parseJsonRecord(value);
  if (!parsed) return fallback;
  const counters = recordValue(parsed.counters);
  return counters ? parseWorkerCounters(counters) : fallback;
}

function parseQueues(value: unknown): QueueDiagnostics | null {
  if (typeof value !== 'object' || value === null) return null;
  const integration = recordValue(Reflect.get(value, 'integration'));
  const deadLetter = recordValue(Reflect.get(value, 'deadLetter'));
  if (integration && deadLetter) {
    return {
      active: safeCount(integration.active),
      delayed: safeCount(integration.delayed),
      dlq: safeCount(deadLetter.waiting) + safeCount(deadLetter.failed),
      failed: safeCount(integration.failed),
      waiting: safeCount(integration.waiting),
    };
  }
  return {
    active: safeCount(Reflect.get(value, 'active')),
    delayed: safeCount(Reflect.get(value, 'delayed')),
    dlq: safeCount(Reflect.get(value, 'dlq')),
    failed: safeCount(Reflect.get(value, 'failed')),
    waiting: safeCount(Reflect.get(value, 'waiting')),
  };
}

function parseWorkerCounters(value: unknown): WorkerMetrics {
  const counters = recordValue(value);
  return {
    dlq: safeCount(counters?.jobsDeadLetteredTotal),
    failed: safeCount(counters?.jobsFailedTotal),
    processed: safeCount(counters?.jobsProcessedTotal),
    retried: safeCount(counters?.jobsRetriedTotal),
    staleLeaseRecoveries: safeCount(counters?.staleLeasesRecoveredTotal),
    succeeded: safeCount(counters?.jobsSucceededTotal),
  };
}

function emptyWorkerMetrics(): WorkerMetrics {
  return {
    dlq: 0,
    failed: 0,
    processed: 0,
    retried: 0,
    staleLeaseRecoveries: 0,
    succeeded: 0,
  };
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function parseJsonRecord(value: string | null | undefined): Record<string, unknown> | null {
  if (!value || value.length > 16_384) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function safeCount(value: unknown): number {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 32 && Number.isFinite(Date.parse(value));
}
