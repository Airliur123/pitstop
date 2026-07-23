import { publicCategoryCodes, publicPlaceSorts } from '@pitstop/contracts';
import { z } from 'zod';

const decimalString = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const nonNegativeIntegerString = /^(?:0|[1-9]\d*)$/;
const positiveIntegerString = /^(?:[1-9]\d*)$/;

function strictDecimal(name: string, minimum: number, maximum: number) {
  return z
    .string()
    .regex(decimalString, `${name} must be a plain decimal number`)
    .transform(Number)
    .pipe(z.number().finite().min(minimum).max(maximum));
}

function strictInteger(name: string, minimum: number, maximum: number, allowZero = false) {
  return z
    .string()
    .regex(
      allowZero ? nonNegativeIntegerString : positiveIntegerString,
      `${name} must be a plain integer`,
    )
    .transform(Number)
    .pipe(z.number().int().min(minimum).max(maximum));
}

export const latitudeQuerySchema = strictDecimal('latitude', -90, 90);
export const longitudeQuerySchema = strictDecimal('longitude', -180, 180);
export const radiusMetersQuerySchema = strictInteger('radiusMeters', 100, 5_000);
export const budgetAmountQuerySchema = strictInteger('budgetAmount', 0, 10_000_000, true);
export const placeLimitQuerySchema = strictInteger('limit', 1, 50);
export const recommendationLimitQuerySchema = strictInteger('limit', 1, 4);

export const publicCategoryCodeSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.enum(publicCategoryCodes));

export const publicPlaceSortSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.enum(publicPlaceSorts));

export const publicPlacesQuerySchema = z
  .object({
    latitude: latitudeQuerySchema,
    longitude: longitudeQuerySchema,
    radiusMeters: radiusMetersQuerySchema.optional().default(5_000),
    category: publicCategoryCodeSchema.optional(),
    budgetAmount: budgetAmountQuerySchema.optional(),
    limit: placeLimitQuerySchema.optional().default(20),
    cursor: z.string().trim().min(1).max(1_024).optional(),
    sort: publicPlaceSortSchema.optional().default('NEAREST'),
  })
  .strict();

export const recommendationsQuerySchema = z
  .object({
    latitude: latitudeQuerySchema,
    longitude: longitudeQuerySchema,
    radiusMeters: radiusMetersQuerySchema.optional().default(5_000),
    category: publicCategoryCodeSchema.optional().default('MAKAN_MURAH'),
    budgetAmount: budgetAmountQuerySchema.optional(),
    limit: recommendationLimitQuerySchema.optional().default(4),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.category === 'MAKAN_MURAH' || value.category === 'NGOPI') &&
      value.budgetAmount === undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['budgetAmount'],
        message: `budgetAmount is required for ${value.category}`,
      });
    }
  });

export const publicPlaceSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must use lowercase letters, numbers, and hyphens');

export type PublicPlacesQuery = z.infer<typeof publicPlacesQuerySchema>;
export type RecommendationsQuery = z.infer<typeof recommendationsQuerySchema>;
