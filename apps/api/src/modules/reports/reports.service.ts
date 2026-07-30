import { createHash } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  AdminReportDetail,
  AdminReportQueue,
  AuditLogPage,
  AuthUser,
  PlaceConfirmationDetail,
  PlaceReportDetail,
  ReportMutationResult,
  UserActivity,
} from '@pitstop/contracts';
import { isUlid } from '@pitstop/database';
import type {
  ActivityQueryInput,
  AdminReportQueueInput,
  ApplyReportInput,
  AuditLogQueryInput,
  ConfirmationInput,
  CreateReportInput,
  ReportDecisionInput,
} from '@pitstop/validation';

import { PublicCacheService } from '../../common/cache/public-cache.service';
import { ApiProblemException } from '../../common/errors/api-problem.exception';
import { API_ENVIRONMENT, type ApiEnvironmentProvider } from '../../configuration';
import { AdminModerationRateLimitService } from '../admin-moderation/admin-moderation-rate-limit.service';
import { decodeReportsCursor, encodeReportsCursor } from './reports.cursor';
import { ReportsRepository, ReportsRepositoryError } from './reports.repository';
import { ReportsRateLimitService } from './reports-rate-limit.service';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @Inject(ReportsRepository) private readonly repository: ReportsRepository,
    @Inject(ReportsRateLimitService) private readonly rateLimit: ReportsRateLimitService,
    @Inject(AdminModerationRateLimitService)
    private readonly adminRateLimit: AdminModerationRateLimitService,
    @Inject(PublicCacheService) private readonly cache: PublicCacheService,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironmentProvider,
  ) {}

  async createReport(
    user: AuthUser,
    placeId: string,
    input: CreateReportInput,
    idempotencyKey: string,
    requestId: string,
  ): Promise<PlaceReportDetail> {
    const parsedPlaceId = parseId(placeId, 'PLACE_NOT_FOUND');
    await this.rateLimit.enforce(user.id, 'report', parsedPlaceId);
    return this.runRepository(() =>
      this.repository.createReport({
        idempotencyKey,
        placeId: parsedPlaceId,
        report: input,
        requestHash: requestHash({
          input,
          operation: 'create-report',
          placeId: parsedPlaceId,
          userId: user.id,
        }),
        requestId,
        userId: user.id,
      }),
    );
  }

  async reportDetail(user: AuthUser, reportId: string): Promise<PlaceReportDetail> {
    const report = await this.repository.findOwnedReport(
      parseId(reportId, 'REPORT_NOT_FOUND'),
      user.id,
    );
    if (!report) throw notFound('REPORT_NOT_FOUND', 'Report');
    return report;
  }

  async confirmPlace(
    user: AuthUser,
    placeId: string,
    input: ConfirmationInput,
    idempotencyKey: string,
    requestId: string,
  ): Promise<PlaceConfirmationDetail> {
    const parsedPlaceId = parseId(placeId, 'PLACE_NOT_FOUND');
    await this.rateLimit.enforce(user.id, 'confirmation', parsedPlaceId);
    return this.runRepository(() =>
      this.repository.confirmPlace({
        confirmation: input,
        idempotencyKey,
        placeId: parsedPlaceId,
        requestHash: requestHash({
          input,
          operation: 'confirm-place',
          placeId: parsedPlaceId,
          userId: user.id,
        }),
        requestId,
        userId: user.id,
      }),
    );
  }

  async activity(user: AuthUser, input: ActivityQueryInput): Promise<UserActivity> {
    await this.rateLimit.enforce(user.id, 'activity');
    const cursor = input.cursor
      ? decodeReportsCursor(
          input.cursor,
          { kind: 'ACTIVITY' },
          this.environment.PUBLIC_CURSOR_SIGNING_SECRET,
        )
      : undefined;
    const result = await this.repository.activity(user.id, input, cursor);
    const last = result.items.at(-1);
    return {
      ...result,
      pagination: {
        hasMore: result.pagination.hasMore,
        nextCursor:
          result.pagination.hasMore && last
            ? encodeReportsCursor(
                {
                  id: last.id,
                  kind: 'ACTIVITY',
                  timestamp: last.updatedAt,
                  type: last.type,
                  version: 1,
                },
                this.environment.PUBLIC_CURSOR_SIGNING_SECRET,
              )
            : null,
      },
    };
  }

  async listAdminReports(admin: AuthUser, input: AdminReportQueueInput): Promise<AdminReportQueue> {
    await this.adminRateLimit.enforce(admin.id, 'read');
    const cursor = input.cursor
      ? decodeReportsCursor(
          input.cursor,
          { kind: 'ADMIN_REPORTS', sort: input.sort },
          this.environment.PUBLIC_CURSOR_SIGNING_SECRET,
        )
      : undefined;
    const result = await this.repository.listAdminReports(input, cursor);
    const last = result.items.at(-1);
    return {
      ...result,
      pagination: {
        hasMore: result.pagination.hasMore,
        nextCursor:
          result.pagination.hasMore && last
            ? encodeReportsCursor(
                {
                  id: last.id,
                  kind: 'ADMIN_REPORTS',
                  sort: input.sort,
                  timestamp: last.submittedAt,
                  version: 1,
                },
                this.environment.PUBLIC_CURSOR_SIGNING_SECRET,
              )
            : null,
      },
    };
  }

  async adminReportDetail(admin: AuthUser, reportId: string): Promise<AdminReportDetail> {
    await this.adminRateLimit.enforce(admin.id, 'read');
    const report = await this.repository.findAdminReport(parseId(reportId, 'REPORT_NOT_FOUND'));
    if (!report) throw notFound('REPORT_NOT_FOUND', 'Report');
    return report;
  }

  async claim(
    admin: AuthUser,
    reportId: string,
    expectedVersion: number,
    idempotencyKey: string,
    requestId: string,
  ): Promise<ReportMutationResult> {
    await this.adminRateLimit.enforce(admin.id, 'mutation');
    const parsedReportId = parseId(reportId, 'REPORT_NOT_FOUND');
    const result = await this.runRepository(() =>
      this.repository.claimReport({
        adminId: admin.id,
        expectedVersion,
        idempotencyKey,
        reportId: parsedReportId,
        requestHash: requestHash({
          adminId: admin.id,
          expectedVersion,
          operation: 'claim-report',
          reportId: parsedReportId,
        }),
        requestId,
      }),
    );
    return {
      report: await this.requiredAdminDetail(result.reportId),
      replayed: result.replayed,
    };
  }

  async apply(
    admin: AuthUser,
    reportId: string,
    input: ApplyReportInput,
    idempotencyKey: string,
    requestId: string,
  ): Promise<ReportMutationResult> {
    await this.adminRateLimit.enforce(admin.id, 'mutation');
    const parsedReportId = parseId(reportId, 'REPORT_NOT_FOUND');
    const result = await this.runRepository(() =>
      this.repository.applyReport({
        adminId: admin.id,
        application: input,
        idempotencyKey,
        reportId: parsedReportId,
        requestHash: requestHash({
          adminId: admin.id,
          input,
          operation: 'apply-report',
          reportId: parsedReportId,
        }),
        requestId,
      }),
    );
    const [detailInvalidated, searchInvalidated, recommendationInvalidated] = await Promise.all([
      this.cache.invalidate('place-detail', { slug: result.placeSlug }),
      this.cache.invalidateNamespace('place-search'),
      this.cache.invalidateNamespace('recommendations'),
    ]);
    if (!detailInvalidated || !searchInvalidated || !recommendationInvalidated) {
      this.logger.warn({
        cacheInvalidation: 'failed-after-report-commit',
        reportId: result.reportId,
      });
    }
    return {
      report: await this.requiredAdminDetail(result.reportId),
      replayed: result.replayed,
    };
  }

  async reject(
    admin: AuthUser,
    reportId: string,
    input: ReportDecisionInput,
    idempotencyKey: string,
    requestId: string,
  ): Promise<ReportMutationResult> {
    await this.adminRateLimit.enforce(admin.id, 'mutation');
    const parsedReportId = parseId(reportId, 'REPORT_NOT_FOUND');
    const result = await this.runRepository(() =>
      this.repository.rejectReport({
        adminId: admin.id,
        expectedVersion: input.expectedVersion,
        idempotencyKey,
        reportId: parsedReportId,
        requestHash: requestHash({
          adminId: admin.id,
          input,
          operation: 'reject-report',
          reportId: parsedReportId,
        }),
        requestId,
        resolution: input.resolution,
      }),
    );
    return {
      report: await this.requiredAdminDetail(result.reportId),
      replayed: result.replayed,
    };
  }

  async audit(admin: AuthUser, input: AuditLogQueryInput): Promise<AuditLogPage> {
    await this.adminRateLimit.enforce(admin.id, 'read');
    const cursor = input.cursor
      ? decodeReportsCursor(
          input.cursor,
          { kind: 'ADMIN_AUDIT' },
          this.environment.PUBLIC_CURSOR_SIGNING_SECRET,
        )
      : undefined;
    const result = await this.repository.listAuditLogs(input, cursor);
    const last = result.items.at(-1);
    return {
      ...result,
      pagination: {
        hasMore: result.pagination.hasMore,
        nextCursor:
          result.pagination.hasMore && last
            ? encodeReportsCursor(
                {
                  id: last.id,
                  kind: 'ADMIN_AUDIT',
                  timestamp: last.createdAt,
                  version: 1,
                },
                this.environment.PUBLIC_CURSOR_SIGNING_SECRET,
              )
            : null,
      },
    };
  }

  private async requiredAdminDetail(reportId: string): Promise<AdminReportDetail> {
    const report = await this.repository.findAdminReport(reportId);
    if (!report) throw new Error('Report mutation result could not be reloaded');
    return report;
  }

  private async runRepository<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof ReportsRepositoryError)) throw error;
      switch (error.code) {
        case 'NOT_FOUND':
        case 'PLACE_UNAVAILABLE':
          throw notFound('PLACE_NOT_FOUND', 'Place');
        case 'VERSION_CONFLICT':
          throw conflict(
            'VERSION_CONFLICT',
            'The report or Place changed in another request. Reload before continuing.',
          );
        case 'CLAIM_CONFLICT':
          throw conflict(
            'REPORT_CLAIM_CONFLICT',
            'This report is currently claimed by another administrator.',
          );
        case 'NOT_REVIEWER':
          throw conflict(
            'REPORT_REVIEWER_CONFLICT',
            'Only the active reviewer can make this decision.',
          );
        case 'INVALID_STATE':
          throw conflict(
            'REPORT_INVALID_STATE',
            'This report action is not valid for its current state.',
          );
        case 'IDEMPOTENCY_KEY_REUSED':
          throw conflict(
            'IDEMPOTENCY_KEY_REUSED',
            'This idempotency key was used for a different request.',
          );
        case 'INVALID_PATCH':
          throw new ApiProblemException({
            status: 422,
            code: 'REPORT_PATCH_INVALID',
            title: 'Invalid approved patch',
            detail: 'The approved patch is not allowed for this report type or Place.',
          });
        case 'CONFIRMATION_WINDOW_ACTIVE':
          throw conflict(
            'CONFIRMATION_WINDOW_ACTIVE',
            'A confirmation from this user is already active for this Place.',
          );
      }
    }
  }
}

function parseId(value: string, code: string): string {
  if (isUlid(value)) return value;
  throw notFound(code, code.startsWith('PLACE') ? 'Place' : 'Report');
}

function notFound(code: string, resource: string): ApiProblemException {
  return new ApiProblemException({
    status: 404,
    code,
    title: `${resource} not found`,
    detail: `The ${resource.toLocaleLowerCase('en-US')} could not be found.`,
  });
}

function conflict(code: string, detail: string): ApiProblemException {
  return new ApiProblemException({
    status: 409,
    code,
    title: 'Report conflict',
    detail,
  });
}

function requestHash(value: Readonly<Record<string, unknown>>): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
