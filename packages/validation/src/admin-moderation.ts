import {
  adminContributionSortValues,
  type ContributionCategory,
  contributionCategoryValues,
  contributionSourceValues,
  contributionStatusValues,
} from '@pitstop/contracts';
import { z } from 'zod';

const plainPositiveInteger = /^(?:[1-9]\d*)$/;
const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
const activeMarkup = /<\s*\/?\s*(?:script|style|iframe|object|embed|form|svg|math)\b/i;

const queryLimit = z
  .string()
  .regex(plainPositiveInteger, 'limit must be a plain positive integer')
  .transform(Number)
  .pipe(z.number().int().min(1).max(50));

const normalizedSearch = z
  .string()
  .trim()
  .min(2, 'Pencarian minimal 2 karakter.')
  .max(120, 'Pencarian terlalu panjang.')
  .transform((value) => value.normalize('NFKC').toLocaleLowerCase('id-ID'));

const optionalDate = z
  .string()
  .regex(dateOnly, 'Tanggal harus berformat YYYY-MM-DD.')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), 'Tanggal tidak valid.');

export const adminContributionQueueSchema = z
  .object({
    category: z.enum(contributionCategoryValues).optional(),
    contributorId: z.string().length(26).optional(),
    cursor: z.string().trim().min(1).max(1_024).optional(),
    from: optionalDate.optional(),
    limit: queryLimit.optional().default(20),
    search: normalizedSearch.optional(),
    sort: z.enum(adminContributionSortValues).optional().default('SUBMITTED_DESC'),
    source: z.enum(contributionSourceValues).optional(),
    status: z.enum(contributionStatusValues).optional(),
    to: optionalDate.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.from && value.to && value.from > value.to) {
      context.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'Tanggal akhir tidak boleh sebelum tanggal awal.',
      });
    }
  });

export const expectedVersionSchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();

export const moderationReasonSchema = z
  .string()
  .trim()
  .min(10, 'Alasan minimal 10 karakter.')
  .max(500, 'Alasan maksimal 500 karakter.')
  .refine((value) => !activeMarkup.test(value), 'Alasan tidak boleh memuat markup aktif.');

export const moderationDecisionSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    reason: moderationReasonSchema,
  })
  .strict();

export const verifiedLocationSchema = z
  .object({
    city: z.string().trim().min(1).max(120),
    district: z.string().trim().min(1).max(120),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    postalCode: z.string().trim().max(12).nullable().default(null),
    province: z.string().trim().min(1).max(120),
  })
  .strict();

const publicationTargetSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('CREATE_NEW') }).strict(),
  z.object({ mode: z.literal('MERGE_EXISTING'), targetPlaceId: z.string().length(26) }).strict(),
]);

export const approveContributionSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    location: verifiedLocationSchema,
    publicationTarget: publicationTargetSchema,
  })
  .strict();

export const mergeContributionSchema = expectedVersionSchema;

export type AdminContributionQueueInput = z.infer<typeof adminContributionQueueSchema>;
export type ExpectedVersionInput = z.infer<typeof expectedVersionSchema>;
export type ModerationDecisionInput = z.infer<typeof moderationDecisionSchema>;
export type ApproveContributionInput = z.infer<typeof approveContributionSchema>;
export type MergeContributionInput = z.infer<typeof mergeContributionSchema>;

export function canModerateTransition(
  current: (typeof contributionStatusValues)[number],
  next: (typeof contributionStatusValues)[number],
): boolean {
  return (
    (current === 'PENDING' && next === 'IN_REVIEW') ||
    (current === 'IN_REVIEW' &&
      (next === 'NEEDS_REVISION' || next === 'REJECTED' || next === 'APPROVED')) ||
    (current === 'APPROVED' && next === 'MERGED')
  );
}

export function categoryRequiresMainMenu(category: ContributionCategory): boolean {
  return category === 'MAKAN_MURAH' || category === 'NGOPI';
}
