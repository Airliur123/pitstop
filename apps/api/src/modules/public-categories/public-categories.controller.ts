import { Controller, Get, Inject, Req } from '@nestjs/common';
import {
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import type { ApiSuccess, CategoriesMeta, PublicCategory } from '@pitstop/contracts';
import type { FastifyRequest } from 'fastify';

import { createSuccessResponse } from '../../common/http/response';
import { categoriesResponseSchema, problemDetailsSchema } from '../../openapi/schemas';
import { PublicCategoriesService } from './public-categories.service';

@ApiTags('public-categories')
@Controller('public/categories')
export class PublicCategoriesController {
  constructor(
    @Inject(PublicCategoriesService) private readonly categories: PublicCategoriesService,
  ) {}

  @Get()
  @ApiOperation({
    operationId: 'listPublicCategories',
    summary: 'List the five public PitStop categories.',
  })
  @ApiOkResponse({
    description: 'Categories ordered by sortOrder and stable ID.',
    schema: categoriesResponseSchema,
  })
  @ApiTooManyRequestsResponse({
    description: 'Public API rate limit exceeded.',
    schema: problemDetailsSchema,
  })
  @ApiInternalServerErrorResponse({
    description: 'Unexpected safe Problem Details response.',
    schema: problemDetailsSchema,
  })
  async findAll(
    @Req() request: FastifyRequest,
  ): Promise<ApiSuccess<readonly PublicCategory[], CategoriesMeta>> {
    const result = await this.categories.findAll();
    return createSuccessResponse(request, result.value, { cache: result.status });
  }
}
