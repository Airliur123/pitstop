import type { AuthUser } from '@pitstop/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { PublicCacheService } from '../../common/cache/public-cache.service';
import type { ApiEnvironmentProvider } from '../../configuration';
import type { AdminModerationRateLimitService } from '../admin-moderation/admin-moderation-rate-limit.service';
import type { ReportsRepository } from './reports.repository';
import { ReportsService } from './reports.service';
import type { ReportsRateLimitService } from './reports-rate-limit.service';

const user: AuthUser = {
  email: 'us***@example.test',
  id: '01K00000000000000000000001',
  role: 'USER',
};
const admin: AuthUser = {
  email: 'ad***@example.test',
  id: '01K00000000000000000000002',
  role: 'ADMIN',
};
const reportId = '01K00000000000000000000003';
const placeId = '01K00000000000000000000004';
const slug = 'warung-cache-regression';

function setup() {
  const reportDetail = {
    id: reportId,
    place: { id: placeId, name: 'Warung Cache', slug, version: 4 },
  };
  const confirmationDetail = {
    id: '01K00000000000000000000005',
    place: { id: placeId, name: 'Warung Cache', slug, verificationStatus: 'STALE', version: 5 },
    replayed: false,
  };
  const repository = {
    applyReport: vi.fn().mockResolvedValue({ placeSlug: slug, reportId, replayed: false }),
    confirmPlace: vi.fn().mockResolvedValue(confirmationDetail),
    createReport: vi.fn().mockResolvedValue(reportDetail),
    findAdminReport: vi.fn().mockResolvedValue(reportDetail),
    rejectReport: vi.fn().mockResolvedValue({ reportId, replayed: false }),
  };
  const rateLimit = { enforce: vi.fn().mockResolvedValue(undefined) };
  const adminRateLimit = { enforce: vi.fn().mockResolvedValue(undefined) };
  const cache = {
    invalidate: vi.fn().mockResolvedValue(true),
    invalidateNamespace: vi.fn().mockResolvedValue(true),
  };
  const environment = {
    PUBLIC_CURSOR_SIGNING_SECRET: 'test-cursor-secret-with-at-least-thirty-two-bytes',
  };
  const service = new ReportsService(
    repository as unknown as ReportsRepository,
    rateLimit as unknown as ReportsRateLimitService,
    adminRateLimit as unknown as AdminModerationRateLimitService,
    cache as unknown as PublicCacheService,
    environment as ApiEnvironmentProvider,
  );
  return { cache, confirmationDetail, reportDetail, repository, service };
}

describe('ReportsService cache invalidation', () => {
  it('invalidates the correct detail slug only after report creation commits', async () => {
    const { cache, reportDetail, repository, service } = setup();
    let resolveCreate: ((value: typeof reportDetail) => void) | undefined;
    repository.createReport.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );

    const pending = service.createReport(
      user,
      placeId,
      {
        expectedPlaceVersion: 3,
        explanation: 'Nama warung ini sudah berubah berdasarkan papan terbaru.',
        proposedChange: { kind: 'OTHER', name: 'Warung Cache' },
        reportType: 'OTHER',
      },
      'report-cache-key',
      'request-create',
    );
    await vi.waitFor(() => expect(repository.createReport).toHaveBeenCalledOnce());
    expect(cache.invalidate).not.toHaveBeenCalled();

    resolveCreate?.(reportDetail);
    await pending;
    expect(cache.invalidate).toHaveBeenCalledWith('place-detail', { slug });
  });

  it('invalidates detail cache after confirmation, rejection, and apply mutations', async () => {
    const { cache, repository, service } = setup();
    await service.confirmPlace(
      user,
      placeId,
      {
        confirmationType: 'STILL_VALID',
        confirmedAt: new Date().toISOString(),
        expectedPlaceVersion: 4,
      },
      'confirmation-cache-key',
      'request-confirm',
    );
    expect(cache.invalidate).toHaveBeenCalledTimes(1);
    await service.reject(
      admin,
      reportId,
      { expectedVersion: 2, resolution: 'Bukti tidak mendukung perubahan yang diajukan.' },
      'reject-cache-key',
      'request-reject',
    );
    expect(cache.invalidate).toHaveBeenCalledTimes(2);
    await service.apply(
      admin,
      reportId,
      {
        approvedPatch: { kind: 'OTHER', name: 'Warung Cache' },
        expectedPlaceVersion: 4,
        expectedReportVersion: 2,
        resolution: 'Perubahan telah dibandingkan dengan sumber terbaru.',
      },
      'apply-cache-key',
      'request-apply',
    );
    expect(cache.invalidate).toHaveBeenCalledTimes(3);

    expect(repository.confirmPlace).toHaveBeenCalledOnce();
    expect(repository.rejectReport).toHaveBeenCalledOnce();
    expect(repository.applyReport).toHaveBeenCalledOnce();
    expect(cache.invalidate).toHaveBeenNthCalledWith(1, 'place-detail', { slug });
    expect(cache.invalidate).toHaveBeenNthCalledWith(2, 'place-detail', { slug });
    expect(cache.invalidate).toHaveBeenNthCalledWith(3, 'place-detail', { slug });
  });
});
