import { Inject, Injectable } from '@nestjs/common';
import type { PublicCategory, PublicCategoryCode } from '@pitstop/contracts';
import { publicCategoryCodes } from '@pitstop/contracts';
import { findPublicCategories, type Pool } from '@pitstop/database';

import {
  type PublicCacheResult,
  PublicCacheService,
} from '../../common/cache/public-cache.service';
import { DATABASE_POOL } from '../../common/database/database.module';
import { API_ENVIRONMENT, type ApiEnvironmentProvider } from '../../configuration';

const budgetCategories = new Set<PublicCategoryCode>(['MAKAN_MURAH', 'NGOPI']);

@Injectable()
export class PublicCategoriesService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironmentProvider,
    @Inject(PublicCacheService) private readonly cache: PublicCacheService,
  ) {}

  async findAll(): Promise<PublicCacheResult<readonly PublicCategory[]>> {
    return this.cache.remember(
      'categories',
      { active: true },
      this.environment.CACHE_CATEGORIES_TTL_SECONDS,
      async () => {
        const rows = await findPublicCategories(this.pool);
        return rows.map((row) => {
          const code = toCategoryCode(row.code);
          return {
            ...row,
            code,
            supportsBudget: budgetCategories.has(code),
          };
        });
      },
      isPublicCategoryList,
    );
  }
}

function isPublicCategoryList(value: unknown): value is readonly PublicCategory[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof entry.id === 'string' &&
        typeof entry.code === 'string' &&
        typeof entry.name === 'string' &&
        (typeof entry.description === 'string' || entry.description === null) &&
        typeof entry.isPrimary === 'boolean' &&
        typeof entry.sortOrder === 'number' &&
        typeof entry.supportsBudget === 'boolean',
    )
  );
}

function toCategoryCode(value: string): PublicCategoryCode {
  if (publicCategoryCodes.some((code) => code === value)) return value as PublicCategoryCode;
  throw new TypeError(`Unsupported public category code: ${value}`);
}
