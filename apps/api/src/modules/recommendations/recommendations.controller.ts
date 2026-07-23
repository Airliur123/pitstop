import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import type { ApiSuccess, RecommendationMeta, RecommendationResult } from '@pitstop/contracts';
import { type RecommendationsQuery, recommendationsQuerySchema } from '@pitstop/validation';
import type { FastifyRequest } from 'fastify';

import { createSuccessResponse } from '../../common/http/response';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { problemDetailsSchema, recommendationsResponseSchema } from '../../openapi/schemas';
import { RecommendationsService } from './recommendations.service';

@ApiTags('public-recommendations')
@Controller('public/recommendations')
export class RecommendationsController {
  constructor(
    @Inject(RecommendationsService) private readonly recommendations: RecommendationsService,
  ) {}

  @Get()
  @ApiOperation({
    operationId: 'getPublicRecommendations',
    summary: 'Return one primary recommendation and at most three alternatives.',
  })
  @ApiQuery({ name: 'latitude', required: true, type: Number, minimum: -90, maximum: 90 })
  @ApiQuery({ name: 'longitude', required: true, type: Number, minimum: -180, maximum: 180 })
  @ApiQuery({ name: 'radiusMeters', required: false, type: Number, minimum: 100, maximum: 5000 })
  @ApiQuery({
    name: 'category',
    required: false,
    enum: ['MAKAN_MURAH', 'NGOPI', 'TOILET', 'MUSALA', 'ISTIRAHAT'],
  })
  @ApiQuery({ name: 'budgetAmount', required: false, type: Number, minimum: 0 })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 4 })
  @ApiOkResponse({
    description:
      'Deterministically ranked recommendation result with typed fallback metadata when empty.',
    schema: recommendationsResponseSchema,
  })
  @ApiBadRequestResponse({
    description: 'Problem Details validation error.',
    schema: problemDetailsSchema,
  })
  @ApiTooManyRequestsResponse({
    description: 'Recommendation rate limit exceeded.',
    schema: problemDetailsSchema,
  })
  @ApiInternalServerErrorResponse({
    description: 'Unexpected safe Problem Details response.',
    schema: problemDetailsSchema,
  })
  async find(
    @Req() request: FastifyRequest,
    @Query(new ZodValidationPipe(recommendationsQuerySchema)) query: RecommendationsQuery,
  ): Promise<ApiSuccess<RecommendationResult, RecommendationMeta>> {
    const result = await this.recommendations.find(query);
    return createSuccessResponse(request, result.data, result.meta);
  }
}
