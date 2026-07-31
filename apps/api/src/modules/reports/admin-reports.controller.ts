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
  ApiBody,
  ApiConflictResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type {
  AdminReportDetail,
  AdminReportQueue,
  ApiSuccess,
  AuditLogPage,
  AuthUser,
  ReportMutationResult,
} from '@pitstop/contracts';
import {
  type AdminReportQueueInput,
  adminReportQueueSchema,
  type ApplyReportInput,
  applyReportSchema,
  type AuditLogQueryInput,
  auditLogQuerySchema,
  type ExpectedVersionInput,
  expectedVersionSchema,
  type ReportDecisionInput,
  reportDecisionSchema,
} from '@pitstop/validation';
import type { FastifyRequest } from 'fastify';

import { createSuccessResponse } from '../../common/http/response';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import {
  adminReportDetailResponseSchema,
  adminReportQueueResponseSchema,
  applyReportRequestSchema,
  auditLogResponseSchema,
  expectedVersionRequestSchema,
  problemDetailsSchema,
  rejectReportRequestSchema,
  reportMutationResponseSchema,
} from '../../openapi/schemas';
import {
  CurrentUser,
  RequireRoles,
  RoleGuard,
  SessionAuthGuard,
  SessionCsrfGuard,
} from '../auth/auth.guards';
import { parseIdempotencyKey } from './reports.controller';
import { ReportsService } from './reports.service';

@ApiTags('admin reports and audit')
@ApiUnauthorizedResponse({ schema: problemDetailsSchema })
@RequireRoles('ADMIN')
@UseGuards(SessionAuthGuard, RoleGuard)
@Controller('admin')
export class AdminReportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}

  @Get('reports')
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  @ApiOperation({ operationId: 'listAdminReports', summary: 'Read the private report queue.' })
  @ApiOkResponse({ schema: adminReportQueueResponseSchema })
  async list(
    @CurrentUser() admin: AuthUser,
    @Query(new ZodValidationPipe(adminReportQueueSchema)) input: AdminReportQueueInput,
    @Req() request: FastifyRequest,
  ): Promise<ApiSuccess<AdminReportQueue>> {
    return createSuccessResponse(request, await this.reports.listAdminReports(admin, input), {});
  }

  @Get('reports/:id')
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  @ApiOperation({ operationId: 'getAdminReport', summary: 'Read report comparison and history.' })
  @ApiOkResponse({ schema: adminReportDetailResponseSchema })
  @ApiNotFoundResponse({ schema: problemDetailsSchema })
  async detail(
    @CurrentUser() admin: AuthUser,
    @Param('id') reportId: string,
    @Req() request: FastifyRequest,
  ): Promise<ApiSuccess<AdminReportDetail>> {
    return createSuccessResponse(
      request,
      await this.reports.adminReportDetail(admin, reportId),
      {},
    );
  }

  @Post('reports/:id/claim')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  @UseGuards(SessionCsrfGuard)
  @ApiOperation({ operationId: 'claimAdminReport', summary: 'Claim or recover a report review.' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: expectedVersionRequestSchema })
  @ApiOkResponse({ schema: reportMutationResponseSchema })
  @ApiConflictResponse({ schema: problemDetailsSchema })
  async claim(
    @CurrentUser() admin: AuthUser,
    @Param('id') reportId: string,
    @Body(new ZodValidationPipe(expectedVersionSchema)) input: ExpectedVersionInput,
    @Headers('idempotency-key') idempotencyKey: unknown,
    @Req() request: FastifyRequest,
  ): Promise<ApiSuccess<ReportMutationResult>> {
    return createSuccessResponse(
      request,
      await this.reports.claim(
        admin,
        reportId,
        input.expectedVersion,
        parseIdempotencyKey(idempotencyKey),
        request.id,
      ),
      {},
    );
  }

  @Post('reports/:id/apply')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  @UseGuards(SessionCsrfGuard)
  @ApiOperation({ operationId: 'applyAdminReport', summary: 'Apply a report transactionally.' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: applyReportRequestSchema })
  @ApiOkResponse({ schema: reportMutationResponseSchema })
  async apply(
    @CurrentUser() admin: AuthUser,
    @Param('id') reportId: string,
    @Body(new ZodValidationPipe(applyReportSchema)) input: ApplyReportInput,
    @Headers('idempotency-key') idempotencyKey: unknown,
    @Req() request: FastifyRequest,
  ): Promise<ApiSuccess<ReportMutationResult>> {
    return createSuccessResponse(
      request,
      await this.reports.apply(
        admin,
        reportId,
        input,
        parseIdempotencyKey(idempotencyKey),
        request.id,
      ),
      {},
    );
  }

  @Post('reports/:id/reject')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  @UseGuards(SessionCsrfGuard)
  @ApiOperation({ operationId: 'rejectAdminReport', summary: 'Reject a claimed report.' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: rejectReportRequestSchema })
  @ApiOkResponse({ schema: reportMutationResponseSchema })
  async reject(
    @CurrentUser() admin: AuthUser,
    @Param('id') reportId: string,
    @Body(new ZodValidationPipe(reportDecisionSchema)) input: ReportDecisionInput,
    @Headers('idempotency-key') idempotencyKey: unknown,
    @Req() request: FastifyRequest,
  ): Promise<ApiSuccess<ReportMutationResult>> {
    return createSuccessResponse(
      request,
      await this.reports.reject(
        admin,
        reportId,
        input,
        parseIdempotencyKey(idempotencyKey),
        request.id,
      ),
      {},
    );
  }

  @Get('audit')
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  @ApiOperation({
    operationId: 'listGovernanceAudit',
    summary: 'Read append-only governance audit.',
  })
  @ApiOkResponse({ schema: auditLogResponseSchema })
  async audit(
    @CurrentUser() admin: AuthUser,
    @Query(new ZodValidationPipe(auditLogQuerySchema)) input: AuditLogQueryInput,
    @Req() request: FastifyRequest,
  ): Promise<ApiSuccess<AuditLogPage>> {
    return createSuccessResponse(request, await this.reports.audit(admin, input), {});
  }
}
