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
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type {
  ApiSuccess,
  AuthUser,
  PlaceConfirmationDetail,
  PlaceReportDetail,
  UserActivity,
} from '@pitstop/contracts';
import {
  type ActivityQueryInput,
  activityQuerySchema,
  type ConfirmationInput,
  confirmationSchema,
  type CreateReportInput,
  createReportSchema,
  reportIdempotencyKeySchema,
} from '@pitstop/validation';
import type { FastifyRequest } from 'fastify';

import { ApiProblemException } from '../../common/errors/api-problem.exception';
import { createSuccessResponse } from '../../common/http/response';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { correlationIdForRequest } from '../../http/request-identifiers';
import {
  activityResponseSchema,
  confirmationRequestSchema,
  confirmationResponseSchema,
  createReportRequestSchema,
  problemDetailsSchema,
  reportResponseSchema,
} from '../../openapi/schemas';
import { CurrentUser, SessionAuthGuard, SessionCsrfGuard } from '../auth/auth.guards';
import { ReportsService } from './reports.service';

@ApiTags('reports and confirmations')
@ApiUnauthorizedResponse({ schema: problemDetailsSchema })
@UseGuards(SessionAuthGuard)
@Controller()
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}

  @Post('places/:id/reports')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  @UseGuards(SessionCsrfGuard)
  @ApiOperation({ operationId: 'createPlaceReport', summary: 'Create an owned pending report.' })
  @ApiParam({ name: 'id', description: 'Place ULID.' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: createReportRequestSchema })
  @ApiCreatedResponse({ schema: reportResponseSchema })
  @ApiBadRequestResponse({ schema: problemDetailsSchema })
  @ApiConflictResponse({ schema: problemDetailsSchema })
  async create(
    @CurrentUser() user: AuthUser,
    @Param('id') placeId: string,
    @Body(new ZodValidationPipe(createReportSchema)) input: CreateReportInput,
    @Headers('idempotency-key') idempotencyKey: unknown,
    @Req() request: FastifyRequest,
  ): Promise<ApiSuccess<PlaceReportDetail>> {
    return createSuccessResponse(
      request,
      await this.reports.createReport(
        user,
        placeId,
        input,
        parseIdempotencyKey(idempotencyKey),
        correlationIdForRequest(request),
      ),
      {},
    );
  }

  @Get('reports/:id')
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  @ApiOperation({ operationId: 'getOwnedPlaceReport', summary: 'Read an owned report.' })
  @ApiOkResponse({ schema: reportResponseSchema })
  @ApiNotFoundResponse({ schema: problemDetailsSchema })
  async detail(
    @CurrentUser() user: AuthUser,
    @Param('id') reportId: string,
    @Req() request: FastifyRequest,
  ): Promise<ApiSuccess<PlaceReportDetail>> {
    return createSuccessResponse(request, await this.reports.reportDetail(user, reportId), {});
  }

  @Post('places/:id/confirmations')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  @UseGuards(SessionCsrfGuard)
  @ApiOperation({
    operationId: 'confirmPlaceInformation',
    summary: 'Create or safely refresh one user confirmation for a Place.',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: confirmationRequestSchema })
  @ApiOkResponse({ schema: confirmationResponseSchema })
  @ApiConflictResponse({ schema: problemDetailsSchema })
  async confirm(
    @CurrentUser() user: AuthUser,
    @Param('id') placeId: string,
    @Body(new ZodValidationPipe(confirmationSchema)) input: ConfirmationInput,
    @Headers('idempotency-key') idempotencyKey: unknown,
    @Req() request: FastifyRequest,
  ): Promise<ApiSuccess<PlaceConfirmationDetail>> {
    return createSuccessResponse(
      request,
      await this.reports.confirmPlace(
        user,
        placeId,
        input,
        parseIdempotencyKey(idempotencyKey),
        correlationIdForRequest(request),
      ),
      {},
    );
  }

  @Get('activity')
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  @ApiOperation({ operationId: 'getUserActivity', summary: 'Read private owned activity.' })
  @ApiOkResponse({ schema: activityResponseSchema })
  async activity(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(activityQuerySchema)) input: ActivityQueryInput,
    @Req() request: FastifyRequest,
  ): Promise<ApiSuccess<UserActivity>> {
    return createSuccessResponse(request, await this.reports.activity(user, input), {});
  }
}

export function parseIdempotencyKey(value: unknown): string {
  const result = reportIdempotencyKeySchema.safeParse(value);
  if (result.success) return result.data;
  throw new ApiProblemException({
    status: 400,
    code: 'IDEMPOTENCY_KEY_INVALID',
    title: 'Invalid idempotency key',
    detail: 'A valid Idempotency-Key header is required for this operation.',
  });
}
