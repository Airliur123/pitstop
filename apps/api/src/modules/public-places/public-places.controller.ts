import { Controller, Get, Inject, Param, Query, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import type {
  ApiSuccess,
  PlaceDetailMeta,
  PublicPlaceDetail,
  PublicPlaceListItem,
  PublicPlacesMeta,
} from '@pitstop/contracts';
import {
  publicPlaceSlugSchema,
  type PublicPlacesQuery,
  publicPlacesQuerySchema,
} from '@pitstop/validation';
import type { FastifyRequest } from 'fastify';

import { createSuccessResponse } from '../../common/http/response';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import {
  placeDetailResponseSchema,
  placesResponseSchema,
  problemDetailsSchema,
} from '../../openapi/schemas';
import { PublicPlacesService } from './public-places.service';

@ApiTags('public-places')
@Controller('public/places')
export class PublicPlacesController {
  constructor(@Inject(PublicPlacesService) private readonly places: PublicPlacesService) {}

  @Get()
  @ApiOperation({
    operationId: 'searchPublicPlaces',
    summary: 'Search verified active places within at most five kilometres.',
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
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 50 })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'sort', required: false, enum: ['NEAREST', 'CHEAPEST', 'FRESHEST'] })
  @ApiOkResponse({
    description: 'Stable cursor-paginated public place collection.',
    schema: placesResponseSchema,
  })
  @ApiBadRequestResponse({
    description: 'Problem Details validation error.',
    schema: problemDetailsSchema,
  })
  @ApiTooManyRequestsResponse({
    description: 'Public API rate limit exceeded.',
    schema: problemDetailsSchema,
  })
  @ApiInternalServerErrorResponse({
    description: 'Unexpected safe Problem Details response.',
    schema: problemDetailsSchema,
  })
  async search(
    @Req() request: FastifyRequest,
    @Query(new ZodValidationPipe(publicPlacesQuerySchema)) query: PublicPlacesQuery,
  ): Promise<ApiSuccess<readonly PublicPlaceListItem[], PublicPlacesMeta>> {
    const result = await this.places.search(query);
    return createSuccessResponse(request, result.data, result.meta);
  }

  @Get(':slug')
  @ApiOperation({
    operationId: 'getPublicPlaceBySlug',
    summary: 'Get a verified active place using its canonical public slug.',
  })
  @ApiParam({ name: 'slug', example: 'data-simulasi-warung-bu-ani' })
  @ApiOkResponse({
    description: 'Public place detail without storage object keys.',
    schema: placeDetailResponseSchema,
  })
  @ApiBadRequestResponse({
    description: 'The slug format is invalid.',
    schema: problemDetailsSchema,
  })
  @ApiNotFoundResponse({
    description: 'No eligible public place has this slug.',
    schema: problemDetailsSchema,
  })
  @ApiInternalServerErrorResponse({
    description: 'Unexpected safe Problem Details response.',
    schema: problemDetailsSchema,
  })
  async findBySlug(
    @Req() request: FastifyRequest,
    @Param('slug', new ZodValidationPipe(publicPlaceSlugSchema)) slug: string,
  ): Promise<ApiSuccess<PublicPlaceDetail, PlaceDetailMeta>> {
    const result = await this.places.findBySlug(slug);
    return createSuccessResponse(request, result.data, result.meta);
  }
}
