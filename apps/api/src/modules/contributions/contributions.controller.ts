import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
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
  ContributionDetail,
  SubmitContributionResult,
} from '@pitstop/contracts';
import { isUlid } from '@pitstop/database';
import {
  contributionIdempotencyKeySchema,
  type CreateContributionInput,
  createContributionSchema,
  type SubmitContributionInput,
  submitContributionSchema,
  type UpdateContributionInput,
  updateContributionSchema,
} from '@pitstop/validation';
import type { FastifyRequest } from 'fastify';

import { ApiProblemException } from '../../common/errors/api-problem.exception';
import { createSuccessResponse } from '../../common/http/response';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { contributionResponseSchema, problemDetailsSchema } from '../../openapi/schemas';
import { CurrentUser, SessionAuthGuard, SessionCsrfGuard } from '../auth/auth.guards';
import { ContributionsService } from './contributions.service';

@ApiTags('contributions')
@ApiUnauthorizedResponse({
  description: 'A valid session is required.',
  schema: problemDetailsSchema,
})
@UseGuards(SessionAuthGuard)
@Controller('contributions')
export class ContributionsController {
  constructor(@Inject(ContributionsService) private readonly contributions: ContributionsService) {}

  @Post()
  @HttpCode(201)
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  @UseGuards(SessionCsrfGuard)
  @ApiOperation({ operationId: 'createContributionDraft', summary: 'Create an owned draft.' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({
    description: 'Owned DRAFT contribution.',
    schema: contributionResponseSchema,
  })
  @ApiBadRequestResponse({ schema: problemDetailsSchema })
  async create(
    @Body(new ZodValidationPipe(createContributionSchema)) input: CreateContributionInput,
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: unknown,
    @Req() request: FastifyRequest,
  ): Promise<ApiSuccess<ContributionDetail>> {
    const result = await this.contributions.createDraft(
      user,
      input,
      parseIdempotencyKey(idempotencyKey),
    );
    return createSuccessResponse(request, result, {});
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  @ApiOperation({ operationId: 'getOwnedContribution', summary: 'Read an owned contribution.' })
  @ApiParam({ name: 'id', description: 'Contribution ULID.' })
  @ApiOkResponse({ schema: contributionResponseSchema })
  @ApiNotFoundResponse({ schema: problemDetailsSchema })
  async detail(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Req() request: FastifyRequest,
  ): Promise<ApiSuccess<ContributionDetail>> {
    const result = await this.contributions.detail(user, parseContributionId(id));
    return createSuccessResponse(request, result, {});
  }

  @Patch(':id')
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  @UseGuards(SessionCsrfGuard)
  @ApiOperation({ operationId: 'updateContributionDraft', summary: 'Update an owned DRAFT.' })
  @ApiParam({ name: 'id', description: 'Contribution ULID.' })
  @ApiOkResponse({ schema: contributionResponseSchema })
  @ApiConflictResponse({ schema: problemDetailsSchema })
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateContributionSchema)) input: UpdateContributionInput,
    @CurrentUser() user: AuthUser,
    @Req() request: FastifyRequest,
  ): Promise<ApiSuccess<ContributionDetail>> {
    const result = await this.contributions.updateDraft(user, parseContributionId(id), input);
    return createSuccessResponse(request, result, {});
  }

  @Post(':id/submit')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  @UseGuards(SessionCsrfGuard)
  @ApiOperation({
    operationId: 'submitContributionDraft',
    summary: 'Idempotently transition an owned DRAFT to PENDING.',
  })
  @ApiParam({ name: 'id', description: 'Contribution ULID.' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ schema: contributionResponseSchema })
  @ApiBadRequestResponse({ schema: problemDetailsSchema })
  @ApiConflictResponse({ schema: problemDetailsSchema })
  async submit(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(submitContributionSchema)) input: SubmitContributionInput,
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: unknown,
    @Req() request: FastifyRequest,
  ): Promise<ApiSuccess<SubmitContributionResult>> {
    const result = await this.contributions.submitDraft(
      user,
      parseContributionId(id),
      input,
      parseIdempotencyKey(idempotencyKey),
    );
    return createSuccessResponse(request, result, {});
  }
}

function parseContributionId(value: string): string {
  if (isUlid(value)) return value;
  throw new ApiProblemException({
    status: 404,
    code: 'CONTRIBUTION_NOT_FOUND',
    title: 'Contribution not found',
    detail: 'The contribution could not be found.',
  });
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
