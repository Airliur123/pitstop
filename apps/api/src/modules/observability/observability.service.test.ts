import type { Pool } from '@pitstop/database';
import { describe, expect, it, vi } from 'vitest';

import type { RedisService } from '../../common/redis/redis.service';
import type { ApiEnvironmentProvider } from '../../configuration';
import { MetricsRegistry } from './metrics-registry';
import { ObservabilityService } from './observability.service';

const environment = {
  HEALTH_DEPENDENCY_TIMEOUT_MS: 100,
  NODE_ENV: 'test',
  RELEASE_VERSION: 'phase-11-test',
  WORKER_HEARTBEAT_TTL_SECONDS: 30,
} as ApiEnvironmentProvider;

describe('ObservabilityService', () => {
  it('returns an ADMIN-safe aggregate snapshot and publishes bounded gauges', async () => {
    const now = new Date().toISOString();
    const pool = {
      execute: vi.fn().mockResolvedValue([
        [
          {
            contributions_pending: 2,
            google_form_dlq: 1,
            google_form_inbox: 3,
            reports_pending: 4,
          },
        ],
      ]),
      query: vi.fn().mockResolvedValue([[{ one: 1 }]]),
    } as unknown as Pool;
    const redis = {
      ping: vi.fn().mockResolvedValue(true),
      run: vi.fn().mockResolvedValue([
        JSON.stringify({
          counters: {
            jobsDeadLetteredTotal: 1,
            jobsFailedTotal: 2,
            jobsProcessedTotal: 8,
            jobsRetriedTotal: 3,
            jobsSucceededTotal: 6,
            staleLeasesRecoveredTotal: 4,
          },
          lastSuccessfulActivityAt: now,
          observedAt: now,
          queue: {
            deadLetter: { failed: 1, waiting: 2 },
            integration: { active: 1, delayed: 2, failed: 4, waiting: 5 },
          },
          schemaVersion: 1,
          state: 'ready',
        }),
        JSON.stringify({
          counters: {
            jobsDeadLetteredTotal: 1,
            jobsFailedTotal: 2,
            jobsProcessedTotal: 8,
            jobsRetriedTotal: 3,
            jobsSucceededTotal: 6,
            staleLeasesRecoveredTotal: 4,
          },
        }),
      ]),
    } as unknown as RedisService;
    const metrics = new MetricsRegistry();
    const service = new ObservabilityService(environment, pool, redis, metrics);

    const result = await service.diagnostics();

    expect(result).toMatchObject({
      backlog: {
        contributionsPending: 2,
        googleFormDlq: 1,
        googleFormInbox: 3,
        reportsPendingOrInReview: 4,
      },
      dependencies: { database: 'up', queue: 'up', redis: 'up' },
      queues: { active: 1, delayed: 2, dlq: 3, failed: 4, waiting: 5 },
      release: 'phase-11-test',
      status: 'ready',
      worker: { state: 'ready' },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/email|payload|latitude|longitude|secret/i);
    expect(metrics.render()).toContain('pitstop_domain_backlog{kind="contributions_pending"} 2');
  });

  it('treats malformed worker snapshots as unavailable', async () => {
    const pool = {
      execute: vi.fn().mockResolvedValue([[]]),
      query: vi.fn().mockResolvedValue([[{ one: 1 }]]),
    } as unknown as Pool;
    const redis = {
      ping: vi.fn().mockResolvedValue(true),
      run: vi.fn().mockResolvedValue(['{"payload":"private"}', 'not-json']),
    } as unknown as RedisService;
    const service = new ObservabilityService(environment, pool, redis, new MetricsRegistry());

    await expect(service.diagnostics()).resolves.toMatchObject({
      queues: { active: 0, delayed: 0, dlq: 0, failed: 0, waiting: 0 },
      worker: { lastHeartbeatAt: null, state: 'unavailable' },
    });
  });
});
