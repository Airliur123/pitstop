import type { AuthUser, ContributionDetail } from '@pitstop/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { ApiProblemException } from '../../common/errors/api-problem.exception';
import {
  ContributionRepositoryError,
  type ContributionsRepository,
} from './contributions.repository';
import { ContributionsService } from './contributions.service';
import type { ContributionsRateLimitService } from './contributions-rate-limit.service';

const user: AuthUser = {
  email: 'ow***@example.test',
  id: '01K00000000000000000000001',
  role: 'USER',
};

const completeDraft: ContributionDetail = {
  createdAt: '2026-07-28T00:00:00.000Z',
  id: '01K00000000000000000000002',
  payload: {
    address: 'Jl. Pengujian No. 7',
    category: 'MAKAN_MURAH',
    facilities: [],
    mainMenu: { name: 'Nasi telur', priceAmount: 12_000 },
    placeName: 'Warung Pengujian',
  },
  status: 'DRAFT',
  submittedAt: null,
  updatedAt: '2026-07-28T00:00:00.000Z',
  version: 2,
};

function setup() {
  const repository = {
    createDraft: vi.fn(),
    findOwned: vi.fn(),
    submitDraft: vi.fn(),
    updateDraft: vi.fn(),
  };
  const rateLimit = { enforce: vi.fn().mockResolvedValue(undefined) };
  const service = new ContributionsService(
    repository as unknown as ContributionsRepository,
    rateLimit as unknown as ContributionsRateLimitService,
  );
  return { rateLimit, repository, service };
}

function problemCode(error: unknown): string | undefined {
  const response = (error as ApiProblemException).getResponse();
  return typeof response === 'object' && response !== null
    ? (Reflect.get(response, 'code') as string | undefined)
    : undefined;
}

describe('ContributionsService', () => {
  it('hides missing and non-owned contributions behind the same 404', async () => {
    const { repository, service } = setup();
    repository.findOwned.mockResolvedValue(null);

    await expect(service.detail(user, completeDraft.id)).rejects.toSatisfy(
      (error: ApiProblemException) =>
        error.getStatus() === 404 && problemCode(error) === 'CONTRIBUTION_NOT_FOUND',
    );
    expect(repository.findOwned).toHaveBeenCalledWith(completeDraft.id, user.id);
  });

  it('rejects an incomplete draft before any status mutation', async () => {
    const { repository, service } = setup();
    repository.findOwned.mockResolvedValue({
      ...completeDraft,
      payload: { placeName: 'Belum lengkap' },
    });

    await expect(
      service.submitDraft(user, completeDraft.id, { expectedVersion: 2 }, 'submit-key-123'),
    ).rejects.toSatisfy(
      (error: ApiProblemException) =>
        error.getStatus() === 400 && problemCode(error) === 'CONTRIBUTION_INCOMPLETE',
    );
    expect(repository.submitDraft).not.toHaveBeenCalled();
  });

  it('submits a complete owned draft and returns the server timestamp', async () => {
    const { rateLimit, repository, service } = setup();
    repository.findOwned.mockResolvedValue(completeDraft);
    repository.submitDraft.mockResolvedValue({
      ...completeDraft,
      status: 'PENDING',
      submittedAt: '2026-07-28T01:00:00.000Z',
      version: 3,
    });

    await expect(
      service.submitDraft(user, completeDraft.id, { expectedVersion: 2 }, 'submit-key-123'),
    ).resolves.toMatchObject({
      status: 'PENDING',
      submittedAt: '2026-07-28T01:00:00.000Z',
      version: 3,
    });
    expect(rateLimit.enforce).toHaveBeenCalledWith(user.id, 'submit');
    expect(repository.submitDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        contributionId: completeDraft.id,
        expectedVersion: 2,
        idempotencyKey: 'submit-key-123',
        requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        userId: user.id,
      }),
    );
  });

  it('maps immutable and optimistic-lock repository errors to typed conflicts', async () => {
    const { repository, service } = setup();
    repository.updateDraft
      .mockRejectedValueOnce(new ContributionRepositoryError('INVALID_STATE'))
      .mockRejectedValueOnce(new ContributionRepositoryError('VERSION_CONFLICT'));

    const update = () =>
      service.updateDraft(user, completeDraft.id, {
        expectedVersion: 2,
        payload: {
          address: 'Jl. Pengujian No. 7',
          category: 'MAKAN_MURAH',
          facilities: [],
          mainMenu: { name: 'Nasi telur', priceAmount: 12_000 },
          placeName: 'Warung Pengujian',
        },
      });
    await expect(update()).rejects.toSatisfy(
      (error: ApiProblemException) =>
        error.getStatus() === 409 && problemCode(error) === 'CONTRIBUTION_INVALID_STATE',
    );
    await expect(update()).rejects.toSatisfy(
      (error: ApiProblemException) =>
        error.getStatus() === 409 && problemCode(error) === 'CONTRIBUTION_VERSION_CONFLICT',
    );
  });
});
