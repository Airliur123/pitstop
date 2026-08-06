import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type {
  AdminContributionDetail,
  AdminContributionQueue,
  AdminDashboard,
  ApiSuccess,
  AuthUser,
  MergeContributionResult,
  ModerationMutationResult,
} from '@pitstop/contracts';
import {
  type AdminContributionQueueInput,
  adminContributionQueueSchema,
  type ApproveContributionInput,
  approveContributionSchema,
  contributionIdempotencyKeySchema,
  type ExpectedVersionInput,
  expectedVersionSchema,
  type MergeContributionInput,
  mergeContributionSchema,
  type ModerationDecisionInput,
  moderationDecisionSchema,
} from '@pitstop/validation';
import type { FastifyRequest } from 'fastify';

import { ApiProblemException } from '../../common/errors/api-problem.exception';
import { createSuccessResponse } from '../../common/http/response';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { correlationIdForRequest } from '../../http/request-identifiers';
import {
  adminContributionDetailResponseSchema,
  adminDashboardResponseSchema,
  adminQueueResponseSchema,
  approveContributionRequestSchema,
  expectedVersionRequestSchema,
  mergeMutationResponseSchema,
  moderationDecisionRequestSchema,
  moderationMutationResponseSchema,
  problemDetailsSchema,
} from '../../openapi/schemas';
import {
  CurrentUser,
  RequireRoles,
  RoleGuard,
  SessionAuthGuard,
  SessionCsrfGuard,
} from '../auth/auth.guards';
import { AdminModerationService } from './admin-moderation.service';

@ApiTags('admin moderation')
@ApiUnauthorizedResponse({ schema: problemDetailsSchema })
@ApiForbiddenResponse({ schema: problemDetailsSchema })
@RequireRoles('ADMIN')
@UseGuards(SessionAuthGuard, RoleGuard)
@Controller('admin')
export class AdminModerationController {
  constructor(
    @Inject(AdminModerationService) private readonly moderation: AdminModerationService,
  ) {}

  @Get('dashboard')
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  @ApiOperation({ operationId: 'getAdminDashboard', summary: 'Read moderation summary counts.' })
  @ApiOkResponse({
    description: 'Private moderation dashboard summary.',
    schema: adminDashboardResponseSchema,
  })
  async dashboard(
    @CurrentUser() admin: AuthUser,
    @Req() request: FastifyRequest,
  ): Promise<ApiSuccess<AdminDashboard>> {
    return createSuccessResponse(request, await this.moderation.dashboard(admin), {});
  }

  @Get('contributions')
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  @ApiOperation({ operationId: 'listAdminContributions', summary: 'Read the moderation queue.' })
  @ApiOkResponse({
    description: 'Filtered opaque-cursor moderation queue.',
    schema: adminQueueResponseSchema,
  })
  @ApiBadRequestResponse({ schema: problemDetailsSchema })
  async list(
    @CurrentUser() admin: AuthUser,
    @Query(new ZodValidationPipe(adminContributionQueueSchema)) input: AdminContributionQueueInput,
    @Req() request: FastifyRequest,
  ): Promise<ApiSuccess<AdminContributionQueue>> {
    return createSuccessResponse(request, await this.moderation.list(admin, input), {});
  }

  @Get('contributions/:id')
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  @ApiOperation({
    operationId: 'getAdminContribution',
    summary: 'Read canonical moderation detail and history.',
  })
  @ApiParam({ name: 'id', description: 'Contribution ULID.' })
  @ApiOkResponse({
    description: 'Private contribution moderation detail.',
    schema: adminContributionDetailResponseSchema,
  })
  @ApiNotFoundResponse({ schema: problemDetailsSchema })
  async detail(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Req() request: FastifyRequest,
  ): Promise<ApiSuccess<AdminContributionDetail>> {
    return createSuccessResponse(request, await this.moderation.detail(admin, id), {});
  }

  @Post('contributions/:id/claim')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  @UseGuards(SessionCsrfGuard)
  @ApiOperation({ operationId: 'claimAdminContribution', summary: 'Claim or recover a review.' })
  @ApiParam({ name: 'id', description: 'Contribution ULID.' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: expectedVersionRequestSchema })
  @ApiOkResponse({
    description: 'Contribution transitioned to IN_REVIEW.',
    schema: moderationMutationResponseSchema,
  })
  @ApiConflictResponse({ schema: problemDetailsSchema })
  async claim(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(expectedVersionSchema)) input: ExpectedVersionInput,
    @Headers('idempotency-key') idempotencyKey: unknown,
    @Req() request: FastifyRequest,
  ): Promise<ApiSuccess<ModerationMutationResult>> {
    return createSuccessResponse(
      request,
      await this.moderation.claim(admin, id, input, parseIdempotencyKey(idempotencyKey)),
      {},
    );
  }

  @Post('contributions/:id/needs-revision')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  @UseGuards(SessionCsrfGuard)
  @ApiOperation({
    operationId: 'requestAdminContributionRevision',
    summary: 'Request a contributor revision with a bounded reason.',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: moderationDecisionRequestSchema })
  @ApiOkResponse({ schema: moderationMutationResponseSchema })
  async needsRevision(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(moderationDecisionSchema)) input: ModerationDecisionInput,
    @Headers('idempotency-key') idempotencyKey: unknown,
    @Req() request: FastifyRequest,
  ): Promise<ApiSuccess<ModerationMutationResult>> {
    return createSuccessResponse(
      request,
      await this.moderation.needsRevision(admin, id, input, parseIdempotencyKey(idempotencyKey)),
      {},
    );
  }

  @Post('contributions/:id/reject')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  @UseGuards(SessionCsrfGuard)
  @ApiOperation({
    operationId: 'rejectAdminContribution',
    summary: 'Reject a contribution with a bounded reason.',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: moderationDecisionRequestSchema })
  @ApiOkResponse({ schema: moderationMutationResponseSchema })
  async reject(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(moderationDecisionSchema)) input: ModerationDecisionInput,
    @Headers('idempotency-key') idempotencyKey: unknown,
    @Req() request: FastifyRequest,
  ): Promise<ApiSuccess<ModerationMutationResult>> {
    return createSuccessResponse(
      request,
      await this.moderation.reject(admin, id, input, parseIdempotencyKey(idempotencyKey)),
      {},
    );
  }

  @Post('contributions/:id/approve')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  @UseGuards(SessionCsrfGuard)
  @ApiOperation({
    operationId: 'approveAdminContribution',
    summary: 'Approve canonical data and a verified publication location without publishing it.',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: approveContributionRequestSchema })
  @ApiOkResponse({ schema: moderationMutationResponseSchema })
  @ApiUnprocessableEntityResponse({ schema: problemDetailsSchema })
  async approve(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(approveContributionSchema)) input: ApproveContributionInput,
    @Headers('idempotency-key') idempotencyKey: unknown,
    @Req() request: FastifyRequest,
  ): Promise<ApiSuccess<ModerationMutationResult>> {
    return createSuccessResponse(
      request,
      await this.moderation.approve(admin, id, input, parseIdempotencyKey(idempotencyKey)),
      {},
    );
  }

  @Post('contributions/:id/merge')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  @UseGuards(SessionCsrfGuard)
  @ApiOperation({
    operationId: 'mergeAdminContribution',
    summary: 'Transactionally publish an approved contribution as an active verified Place.',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: expectedVersionRequestSchema })
  @ApiOkResponse({ schema: mergeMutationResponseSchema })
  @ApiConflictResponse({ schema: problemDetailsSchema })
  async merge(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(mergeContributionSchema)) input: MergeContributionInput,
    @Headers('idempotency-key') idempotencyKey: unknown,
    @Req() request: FastifyRequest,
  ): Promise<ApiSuccess<MergeContributionResult>> {
    return createSuccessResponse(
      request,
      await this.moderation.merge(
        admin,
        id,
        input,
        parseIdempotencyKey(idempotencyKey),
        correlationIdForRequest(request),
      ),
      {},
    );
  }
}

function parseIdempotencyKey(value: unknown): string {
  const result = contributionIdempotencyKeySchema.safeParse(value);
  if (result.success) return result.data;
  throw new ApiProblemException({
    status: 400,
    code: 'IDEMPOTENCY_KEY_INVALID',
    title: 'Invalid idempotency key',
    detail: 'A valid Idempotency-Key header is required for this operation.',
  });
}
