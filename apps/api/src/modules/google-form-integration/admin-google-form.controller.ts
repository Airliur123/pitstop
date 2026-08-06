import {
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type {
  AdminGoogleFormIntegrationStatus,
  AdminGoogleFormSubmissionDetail,
  AdminGoogleFormSubmissionList,
  ApiSuccess,
  AuthUser,
  ReplayGoogleFormSubmissionResult,
} from '@pitstop/contracts';
import {
  type AdminGoogleFormSubmissionListQuery,
  adminGoogleFormSubmissionListQuerySchema,
} from '@pitstop/validation';
import type { FastifyRequest } from 'fastify';

import { createSuccessResponse } from '../../common/http/response';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { correlationIdForRequest } from '../../http/request-identifiers';
import {
  googleFormIntegrationStatusResponseSchema,
  googleFormReplayResponseSchema,
  googleFormSubmissionDetailResponseSchema,
  googleFormSubmissionListResponseSchema,
  problemDetailsSchema,
} from '../../openapi/schemas';
import {
  CurrentUser,
  RequireRoles,
  RoleGuard,
  SessionAuthGuard,
  SessionCsrfGuard,
} from '../auth/auth.guards';
import { GoogleFormService } from './google-form.service';

@ApiTags('admin Google Form integration')
@ApiUnauthorizedResponse({ schema: problemDetailsSchema })
@ApiForbiddenResponse({ schema: problemDetailsSchema })
@RequireRoles('ADMIN')
@UseGuards(SessionAuthGuard, RoleGuard)
@Controller('admin/integrations/google-form')
export class AdminGoogleFormController {
  constructor(@Inject(GoogleFormService) private readonly integration: GoogleFormService) {}

  @Get('status')
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  @ApiOperation({ operationId: 'getGoogleFormIntegrationStatus' })
  @ApiOkResponse({
    description: 'Private durable inbox status summary.',
    schema: googleFormIntegrationStatusResponseSchema,
  })
  async status(
    @CurrentUser() admin: AuthUser,
    @Req() request: FastifyRequest,
  ): Promise<ApiSuccess<AdminGoogleFormIntegrationStatus>> {
    return createSuccessResponse(request, await this.integration.status(admin), {});
  }

  @Get('submissions')
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  @ApiOperation({ operationId: 'listGoogleFormSubmissions' })
  @ApiOkResponse({
    description: 'Private paginated integration submission list.',
    schema: googleFormSubmissionListResponseSchema,
  })
  async list(
    @CurrentUser() admin: AuthUser,
    @Query(new ZodValidationPipe(adminGoogleFormSubmissionListQuerySchema))
    input: AdminGoogleFormSubmissionListQuery,
    @Req() request: FastifyRequest,
  ): Promise<ApiSuccess<AdminGoogleFormSubmissionList>> {
    return createSuccessResponse(request, await this.integration.list(admin, input), {});
  }

  @Get('submissions/:id')
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  @ApiOperation({ operationId: 'getGoogleFormSubmission' })
  @ApiOkResponse({
    description: 'Private redacted integration submission detail.',
    schema: googleFormSubmissionDetailResponseSchema,
  })
  async detail(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Req() request: FastifyRequest,
  ): Promise<ApiSuccess<AdminGoogleFormSubmissionDetail>> {
    return createSuccessResponse(request, await this.integration.detail(admin, id), {});
  }

  @Post('submissions/:id/replay')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  @UseGuards(SessionCsrfGuard)
  @ApiOperation({ operationId: 'replayGoogleFormSubmission' })
  @ApiOkResponse({
    description: 'Idempotent replay request accepted.',
    schema: googleFormReplayResponseSchema,
  })
  async replay(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Req() request: FastifyRequest,
  ): Promise<ApiSuccess<ReplayGoogleFormSubmissionResult>> {
    return createSuccessResponse(
      request,
      await this.integration.replay(admin, id, correlationIdForRequest(request)),
      {},
    );
  }
}
