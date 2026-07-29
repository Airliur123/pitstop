import { createHash } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  AdminContributionDetail,
  AdminContributionQueue,
  AdminDashboard,
  AuthUser,
  MergeContributionResult,
  ModerationMutationResult,
} from '@pitstop/contracts';
import { isUlid } from '@pitstop/database';
import {
  type AdminContributionQueueInput,
  type ApproveContributionInput,
  contributionSubmissionSchema,
  type ExpectedVersionInput,
  type MergeContributionInput,
  type ModerationDecisionInput,
} from '@pitstop/validation';
import { ZodError } from 'zod';

import { PublicCacheService } from '../../common/cache/public-cache.service';
import { ApiProblemException } from '../../common/errors/api-problem.exception';
import { API_ENVIRONMENT, type ApiEnvironmentProvider } from '../../configuration';
import { decodeAdminQueueCursor, encodeAdminQueueCursor } from './admin-moderation.cursor';
import {
  AdminModerationRepository,
  AdminModerationRepositoryError,
} from './admin-moderation.repository';
import { AdminModerationRateLimitService } from './admin-moderation-rate-limit.service';

@Injectable()
export class AdminModerationService {
  private readonly logger = new Logger(AdminModerationService.name);

  constructor(
    @Inject(AdminModerationRepository) private readonly repository: AdminModerationRepository,
    @Inject(AdminModerationRateLimitService)
    private readonly rateLimit: AdminModerationRateLimitService,
    @Inject(PublicCacheService) private readonly cache: PublicCacheService,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironmentProvider,
  ) {}

  async dashboard(admin: AuthUser): Promise<AdminDashboard> {
    await this.rateLimit.enforce(admin.id, 'read');
    return this.repository.dashboard();
  }

  async list(admin: AuthUser, input: AdminContributionQueueInput): Promise<AdminContributionQueue> {
    await this.rateLimit.enforce(admin.id, 'read');
    const cursor = input.cursor
      ? decodeAdminQueueCursor(
          input.cursor,
          input.sort,
          this.environment.PUBLIC_CURSOR_SIGNING_SECRET,
        )
      : undefined;
    const result = await this.repository.list(input, cursor);
    const last = result.items.at(-1);
    return {
      ...result,
      pagination: {
        hasMore: result.pagination.hasMore,
        nextCursor:
          result.pagination.hasMore && last
            ? encodeAdminQueueCursor(
                {
                  id: last.id,
                  sort: input.sort,
                  submittedAt: last.submittedAt,
                  version: 1,
                },
                this.environment.PUBLIC_CURSOR_SIGNING_SECRET,
              )
            : null,
      },
    };
  }

  async detail(admin: AuthUser, contributionId: string): Promise<AdminContributionDetail> {
    await this.rateLimit.enforce(admin.id, 'read');
    const contribution = await this.repository.detail(parseContributionId(contributionId));
    if (!contribution) throw contributionNotFound();
    return contribution;
  }

  async claim(
    admin: AuthUser,
    contributionId: string,
    input: ExpectedVersionInput,
    idempotencyKey: string,
  ): Promise<ModerationMutationResult> {
    await this.rateLimit.enforce(admin.id, 'mutation');
    return this.runRepository(() =>
      this.repository.claim({
        adminId: admin.id,
        contributionId: parseContributionId(contributionId),
        expectedVersion: input.expectedVersion,
        idempotencyKey,
        requestHash: requestHash({
          adminId: admin.id,
          contributionId,
          expectedVersion: input.expectedVersion,
          operation: 'claim',
        }),
      }),
    );
  }

  async needsRevision(
    admin: AuthUser,
    contributionId: string,
    input: ModerationDecisionInput,
    idempotencyKey: string,
  ): Promise<ModerationMutationResult> {
    return this.decision('NEEDS_REVISION', admin, contributionId, input, idempotencyKey);
  }

  async reject(
    admin: AuthUser,
    contributionId: string,
    input: ModerationDecisionInput,
    idempotencyKey: string,
  ): Promise<ModerationMutationResult> {
    return this.decision('REJECT', admin, contributionId, input, idempotencyKey);
  }

  async approve(
    admin: AuthUser,
    contributionId: string,
    input: ApproveContributionInput,
    idempotencyKey: string,
  ): Promise<ModerationMutationResult> {
    await this.rateLimit.enforce(admin.id, 'mutation');
    await this.assertCanonicalPayload(contributionId);
    return this.runRepository(() =>
      this.repository.approve({
        adminId: admin.id,
        approval: input,
        contributionId: parseContributionId(contributionId),
        idempotencyKey,
        requestHash: requestHash({
          adminId: admin.id,
          contributionId,
          input,
          operation: 'approve',
        }),
      }),
    );
  }

  async merge(
    admin: AuthUser,
    contributionId: string,
    input: MergeContributionInput,
    idempotencyKey: string,
    requestId: string,
  ): Promise<MergeContributionResult> {
    await this.rateLimit.enforce(admin.id, 'mutation');
    await this.assertCanonicalPayload(contributionId);
    const result = await this.runRepository(() =>
      this.repository.merge({
        adminId: admin.id,
        contributionId: parseContributionId(contributionId),
        expectedVersion: input.expectedVersion,
        idempotencyKey,
        requestHash: requestHash({
          adminId: admin.id,
          contributionId,
          expectedVersion: input.expectedVersion,
          operation: 'merge',
        }),
        requestId,
      }),
    );
    const invalidated = await this.cache.invalidate('place-detail', { slug: result.placeSlug });
    if (!invalidated) {
      this.logger.warn({
        cacheInvalidation: 'failed-after-commit',
        contributionId: result.contribution.id,
        placeId: result.placeId,
      });
    }
    return result;
  }

  private async decision(
    action: 'NEEDS_REVISION' | 'REJECT',
    admin: AuthUser,
    contributionId: string,
    input: ModerationDecisionInput,
    idempotencyKey: string,
  ): Promise<ModerationMutationResult> {
    await this.rateLimit.enforce(admin.id, 'mutation');
    return this.runRepository(() =>
      this.repository.decide(action, {
        adminId: admin.id,
        contributionId: parseContributionId(contributionId),
        decision: input,
        idempotencyKey,
        requestHash: requestHash({
          action,
          adminId: admin.id,
          contributionId,
          input,
        }),
      }),
    );
  }

  private async assertCanonicalPayload(contributionId: string): Promise<void> {
    const contribution = await this.repository.detail(parseContributionId(contributionId));
    if (!contribution) throw contributionNotFound();
    const result = contributionSubmissionSchema.safeParse(contribution.payload);
    if (result.success) return;
    throw new ApiProblemException({
      status: 422,
      code: 'CONTRIBUTION_PAYLOAD_INVALID',
      title: 'Contribution payload is not publishable',
      detail: 'The canonical contribution payload must be complete before approval or publication.',
      validationErrors: result.error.issues.map((issue) => ({
        field: issue.path.map(String).join('.') || 'payload',
        message: issue.message,
      })),
    });
  }

  private async runRepository<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ZodError) {
        throw new ApiProblemException({
          status: 422,
          code: 'CONTRIBUTION_PAYLOAD_INVALID',
          title: 'Contribution payload is not publishable',
          detail: 'The canonical contribution payload is invalid.',
        });
      }
      if (!(error instanceof AdminModerationRepositoryError)) throw error;
      if (error.code === 'NOT_FOUND') throw contributionNotFound();
      if (error.code === 'VERSION_CONFLICT') {
        throw conflict(
          'CONTRIBUTION_VERSION_CONFLICT',
          'The contribution changed in another moderation request. Reload it before continuing.',
        );
      }
      if (error.code === 'CLAIM_CONFLICT') {
        throw conflict(
          'CONTRIBUTION_CLAIM_CONFLICT',
          'This contribution is currently claimed by another administrator.',
        );
      }
      if (error.code === 'NOT_REVIEWER') {
        throw conflict(
          'CONTRIBUTION_REVIEWER_CONFLICT',
          'Only the active reviewer can make this moderation decision.',
        );
      }
      if (error.code === 'PUBLICATION_TARGET_INVALID') {
        throw new ApiProblemException({
          status: 422,
          code: 'PUBLICATION_TARGET_INVALID',
          title: 'Invalid publication target',
          detail: 'The selected existing Place is not an active publication target.',
        });
      }
      if (error.code === 'IDEMPOTENCY_KEY_REUSED') {
        throw conflict(
          'IDEMPOTENCY_KEY_REUSED',
          'This idempotency key was already used for a different moderation request.',
        );
      }
      throw conflict(
        'CONTRIBUTION_INVALID_STATE',
        'This moderation action is not valid for the current contribution state.',
      );
    }
  }
}

function parseContributionId(value: string): string {
  if (isUlid(value)) return value;
  throw contributionNotFound();
}

function contributionNotFound(): ApiProblemException {
  return new ApiProblemException({
    status: 404,
    code: 'CONTRIBUTION_NOT_FOUND',
    title: 'Contribution not found',
    detail: 'The contribution could not be found.',
  });
}

function conflict(code: string, detail: string): ApiProblemException {
  return new ApiProblemException({
    status: 409,
    code,
    title: 'Moderation conflict',
    detail,
  });
}

function requestHash(value: Readonly<Record<string, unknown>>): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
