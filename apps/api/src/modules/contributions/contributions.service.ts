import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { AuthUser, ContributionDetail, SubmitContributionResult } from '@pitstop/contracts';
import {
  canonicalizeContributionDraft,
  contributionSubmissionSchema,
  type CreateContributionInput,
  type SubmitContributionInput,
  type UpdateContributionInput,
} from '@pitstop/validation';

import { ApiProblemException } from '../../common/errors/api-problem.exception';
import { ContributionRepositoryError, ContributionsRepository } from './contributions.repository';
import { ContributionsRateLimitService } from './contributions-rate-limit.service';

@Injectable()
export class ContributionsService {
  constructor(
    @Inject(ContributionsRepository) private readonly repository: ContributionsRepository,
    @Inject(ContributionsRateLimitService)
    private readonly rateLimit: ContributionsRateLimitService,
  ) {}

  async createDraft(
    user: AuthUser,
    input: CreateContributionInput,
    idempotencyKey: string,
  ): Promise<ContributionDetail> {
    await this.rateLimit.enforce(user.id, 'create');
    const payload = canonicalizeContributionDraft(input.payload ?? {});
    return this.runRepository(() =>
      this.repository.createDraft({
        idempotencyKey,
        payload,
        requestHash: requestHash({ payload }),
        userId: user.id,
      }),
    );
  }

  async detail(user: AuthUser, contributionId: string): Promise<ContributionDetail> {
    const contribution = await this.repository.findOwned(contributionId, user.id);
    if (!contribution) throw contributionNotFound();
    return contribution;
  }

  async updateDraft(
    user: AuthUser,
    contributionId: string,
    input: UpdateContributionInput,
  ): Promise<ContributionDetail> {
    await this.rateLimit.enforce(user.id, 'update');
    const payload = canonicalizeContributionDraft(input.payload);
    return this.runRepository(() =>
      this.repository.updateDraft({
        contributionId,
        expectedVersion: input.expectedVersion,
        payload,
        userId: user.id,
      }),
    );
  }

  async submitDraft(
    user: AuthUser,
    contributionId: string,
    input: SubmitContributionInput,
    idempotencyKey: string,
  ): Promise<SubmitContributionResult> {
    await this.rateLimit.enforce(user.id, 'submit');
    const contribution = await this.detail(user, contributionId);
    const validation = contributionSubmissionSchema.safeParse(contribution.payload);
    if (!validation.success) {
      throw new ApiProblemException({
        status: 400,
        code: 'CONTRIBUTION_INCOMPLETE',
        title: 'Contribution is incomplete',
        detail: 'Complete every required contribution field before submitting.',
        validationErrors: validation.error.issues.map((issue) => ({
          field: issue.path.map(String).join('.') || 'payload',
          message: issue.message,
        })),
      });
    }
    const result = await this.runRepository(() =>
      this.repository.submitDraft({
        contributionId,
        expectedVersion: input.expectedVersion,
        idempotencyKey,
        requestHash: requestHash({
          contributionId,
          expectedVersion: input.expectedVersion,
          operation: 'submit',
          userId: user.id,
        }),
        userId: user.id,
      }),
    );
    if (result.status !== 'PENDING' || result.submittedAt === null) {
      throw new Error('Contribution submission did not produce a pending contribution');
    }
    return {
      ...result,
      status: 'PENDING',
      submittedAt: result.submittedAt,
    };
  }

  private async runRepository<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof ContributionRepositoryError)) throw error;
      if (error.code === 'NOT_FOUND') throw contributionNotFound();
      if (error.code === 'INVALID_STATE') {
        throw new ApiProblemException({
          status: 409,
          code: 'CONTRIBUTION_INVALID_STATE',
          title: 'Contribution state conflict',
          detail: 'This contribution can no longer be changed by its contributor.',
        });
      }
      if (error.code === 'VERSION_CONFLICT') {
        throw new ApiProblemException({
          status: 409,
          code: 'CONTRIBUTION_VERSION_CONFLICT',
          title: 'Contribution version conflict',
          detail: 'The contribution changed in another request. Reload it before continuing.',
        });
      }
      throw new ApiProblemException({
        status: 409,
        code: 'IDEMPOTENCY_KEY_REUSED',
        title: 'Idempotency key conflict',
        detail: 'This idempotency key was already used for a different request.',
      });
    }
  }
}

function contributionNotFound(): ApiProblemException {
  return new ApiProblemException({
    status: 404,
    code: 'CONTRIBUTION_NOT_FOUND',
    title: 'Contribution not found',
    detail: 'The contribution could not be found.',
  });
}

function requestHash(value: Readonly<Record<string, unknown>>): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
