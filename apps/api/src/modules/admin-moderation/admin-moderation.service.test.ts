import type { AdminContributionDetail, AuthUser } from '@pitstop/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicCacheService } from '../../common/cache/public-cache.service';
import type { ApiProblemException } from '../../common/errors/api-problem.exception';
import type { ApiEnvironmentProvider } from '../../configuration';
import {
  type AdminModerationRepository,
  AdminModerationRepositoryError,
} from './admin-moderation.repository';
import { AdminModerationService } from './admin-moderation.service';
import type { AdminModerationRateLimitService } from './admin-moderation-rate-limit.service';

const admin: AuthUser = {
  email: 'ad***@example.test',
  id: '01K00000000000000000000001',
  role: 'ADMIN',
};

const contribution: AdminContributionDetail = {
  approvedAt: '2026-07-29T02:00:00.000Z',
  createdAt: '2026-07-29T00:00:00.000Z',
  currentReviewer: {
    claimExpired: false,
    claimExpiresAt: '2026-07-29T02:30:00.000Z',
    claimedAt: '2026-07-29T02:00:00.000Z',
    email: admin.email,
    id: admin.id,
  },
  contributor: null,
  decisionReason: null,
  duplicateHints: [],
  history: [],
  id: '01K00000000000000000000002',
  mergedAt: null,
  mergedPlaceId: null,
  payload: {
    address: 'Jl. Pengujian No. 8',
    category: 'MAKAN_MURAH',
    facilities: [],
    mainMenu: { name: 'Nasi telur', priceAmount: 12_000 },
    operatingHours: [],
    placeName: 'Warung Uji',
  },
  publicationTarget: { mode: 'CREATE_NEW', targetPlaceId: null },
  source: 'APPLICATION',
  status: 'APPROVED',
  submittedAt: '2026-07-29T01:00:00.000Z',
  updatedAt: '2026-07-29T02:00:00.000Z',
  verifiedLocation: {
    city: 'Jakarta Barat',
    district: 'Tambora',
    latitude: -6.1468,
    longitude: 106.8061,
    postalCode: '11220',
    province: 'DKI Jakarta',
  },
  version: 4,
};

function setup() {
  const repository = {
    approve: vi.fn(),
    claim: vi.fn(),
    dashboard: vi.fn(),
    decide: vi.fn(),
    detail: vi.fn().mockResolvedValue(contribution),
    list: vi.fn(),
    merge: vi.fn(),
  };
  const rateLimit = { enforce: vi.fn().mockResolvedValue(undefined) };
  const cache = { invalidate: vi.fn().mockResolvedValue(true) };
  const environment = {
    PUBLIC_CURSOR_SIGNING_SECRET: 'test-cursor-secret-with-at-least-thirty-two-bytes',
  };
  const service = new AdminModerationService(
    repository as unknown as AdminModerationRepository,
    rateLimit as unknown as AdminModerationRateLimitService,
    cache as unknown as PublicCacheService,
    environment as ApiEnvironmentProvider,
  );
  return { cache, rateLimit, repository, service };
}

function problemCode(error: unknown): string | undefined {
  const response = (error as ApiProblemException).getResponse();
  return typeof response === 'object' && response !== null
    ? (Reflect.get(response, 'code') as string | undefined)
    : undefined;
}

describe('AdminModerationService', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('forwards optimistic claim input with a deterministic request hash', async () => {
    const { rateLimit, repository, service } = setup();
    repository.claim.mockResolvedValue({ contribution, replayed: false });
    await service.claim(admin, contribution.id, { expectedVersion: 4 }, 'claim-key-123');
    expect(rateLimit.enforce).toHaveBeenCalledWith(admin.id, 'mutation');
    expect(repository.claim).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: admin.id,
        contributionId: contribution.id,
        expectedVersion: 4,
        idempotencyKey: 'claim-key-123',
        requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it('maps reviewer and version conflicts to typed 409 Problem Details', async () => {
    const { repository, service } = setup();
    repository.claim
      .mockRejectedValueOnce(new AdminModerationRepositoryError('NOT_REVIEWER'))
      .mockRejectedValueOnce(new AdminModerationRepositoryError('VERSION_CONFLICT'));

    await expect(
      service.claim(admin, contribution.id, { expectedVersion: 4 }, 'claim-key-123'),
    ).rejects.toSatisfy(
      (error: ApiProblemException) =>
        error.getStatus() === 409 && problemCode(error) === 'CONTRIBUTION_REVIEWER_CONFLICT',
    );
    await expect(
      service.claim(admin, contribution.id, { expectedVersion: 4 }, 'claim-key-456'),
    ).rejects.toSatisfy(
      (error: ApiProblemException) =>
        error.getStatus() === 409 && problemCode(error) === 'CONTRIBUTION_VERSION_CONFLICT',
    );
  });

  it('does not call approve when the canonical payload is incomplete', async () => {
    const { repository, service } = setup();
    if (!contribution.verifiedLocation) throw new Error('Test fixture location is missing');
    repository.detail.mockResolvedValue({
      ...contribution,
      payload: { placeName: 'Belum lengkap' },
      status: 'IN_REVIEW',
    });
    await expect(
      service.approve(
        admin,
        contribution.id,
        {
          expectedVersion: 4,
          location: contribution.verifiedLocation,
          publicationTarget: { mode: 'CREATE_NEW' },
        },
        'approve-key-123',
      ),
    ).rejects.toSatisfy(
      (error: ApiProblemException) =>
        error.getStatus() === 422 && problemCode(error) === 'CONTRIBUTION_PAYLOAD_INVALID',
    );
    expect(repository.approve).not.toHaveBeenCalled();
  });

  it('invalidates only the committed public Place detail and tolerates cache failure', async () => {
    const { cache, repository, service } = setup();
    repository.merge.mockResolvedValue({
      contribution: { ...contribution, status: 'MERGED', version: 5 },
      placeId: '01K00000000000000000000009',
      placeSlug: 'warung-uji-00000002',
      replayed: false,
    });
    cache.invalidate.mockResolvedValue(false);

    await expect(
      service.merge(admin, contribution.id, { expectedVersion: 4 }, 'merge-key-123', 'request-123'),
    ).resolves.toMatchObject({ placeSlug: 'warung-uji-00000002' });
    expect(cache.invalidate).toHaveBeenCalledWith('place-detail', {
      slug: 'warung-uji-00000002',
    });
  });
});
