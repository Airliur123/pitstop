import {
  type ContributionCategory,
  contributionCategoryValues,
  type ContributionDraftPayload,
  type ContributionFacility,
  type ContributionFacilityCode,
  contributionFacilityCodeValues,
  contributionFacilityStatusValues,
  contributionStatusValues,
} from '@pitstop/contracts';
import { z } from 'zod';

const clockPattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const idempotencyKeyPattern = /^[A-Za-z0-9._:-]{8,128}$/;
const mapsHosts = new Set([
  'google.com',
  'www.google.com',
  'maps.google.com',
  'maps.app.goo.gl',
  'goo.gl',
]);

function safeText(maximum: number, fieldLabel: string) {
  return z
    .string()
    .trim()
    .min(1, `${fieldLabel} wajib diisi.`)
    .max(maximum, `${fieldLabel} terlalu panjang.`)
    .refine((value) => !hasUnsafeControlCharacter(value), {
      message: `${fieldLabel} mengandung karakter yang tidak diizinkan.`,
    });
}

const optionalText = (maximum: number, fieldLabel: string) =>
  safeText(maximum, fieldLabel).optional();

function hasUnsafeControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return (code <= 31 && code !== 9 && code !== 10 && code !== 13) || code === 127;
  });
}

export const contributionCategorySchema = z.enum(contributionCategoryValues);
export const contributionStatusSchema = z.enum(contributionStatusValues);
export const contributionFacilityCodeSchema = z.enum(contributionFacilityCodeValues);
export const contributionFacilityStatusSchema = z.enum(contributionFacilityStatusValues);

export const contributionMapsUrlSchema = z
  .url('Tautan Google Maps tidak valid.')
  .max(1_000, 'Tautan Google Maps terlalu panjang.')
  .refine((value) => {
    const parsed = new URL(value);
    return (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      mapsHosts.has(parsed.hostname.toLowerCase()) &&
      parsed.username === '' &&
      parsed.password === ''
    );
  }, 'Gunakan tautan Google Maps http/https yang aman.');

export const contributionMainMenuSchema = z
  .object({
    name: safeText(180, 'Nama menu termurah'),
    priceAmount: z
      .number()
      .int('Harga harus berupa rupiah bulat.')
      .min(1, 'Harga harus lebih dari Rp0.')
      .max(10_000_000, 'Harga melebihi batas yang didukung.'),
  })
  .strict();

const contributionDraftMainMenuSchema = z
  .object({
    name: safeText(180, 'Nama menu termurah').optional(),
    priceAmount: z
      .number()
      .int('Harga harus berupa rupiah bulat.')
      .min(1, 'Harga harus lebih dari Rp0.')
      .max(10_000_000, 'Harga melebihi batas yang didukung.')
      .optional(),
  })
  .strict();

export const contributionFacilitySchema = z
  .object({
    code: contributionFacilityCodeSchema,
    status: contributionFacilityStatusSchema,
  })
  .strict();

export const contributionOperatingHourSchema = z
  .object({
    closesAt: z.string().regex(clockPattern, 'Jam tutup harus berformat HH:mm.').nullable(),
    dayOfWeek: z.number().int().min(0).max(6),
    is24Hours: z.boolean(),
    isClosed: z.boolean(),
    opensAt: z.string().regex(clockPattern, 'Jam buka harus berformat HH:mm.').nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.isClosed) {
      if (value.is24Hours || value.opensAt !== null || value.closesAt !== null) {
        context.addIssue({
          code: 'custom',
          message: 'Hari tutup tidak boleh memiliki jam buka atau status 24 jam.',
        });
      }
      return;
    }
    if (value.is24Hours) {
      if (value.opensAt !== null || value.closesAt !== null) {
        context.addIssue({
          code: 'custom',
          message: 'Jadwal 24 jam tidak boleh memiliki rentang waktu.',
        });
      }
      return;
    }
    if (value.opensAt === null || value.closesAt === null) {
      context.addIssue({
        code: 'custom',
        message: 'Jam buka dan tutup wajib diisi untuk hari yang beroperasi.',
      });
      return;
    }
    if (value.opensAt === value.closesAt) {
      context.addIssue({
        code: 'custom',
        message: 'Jam buka dan tutup tidak boleh sama.',
      });
    }
  });

const facilitiesSchema = z
  .array(contributionFacilitySchema)
  .max(contributionFacilityCodeValues.length)
  .superRefine((facilities, context) => {
    const seen = new Set<ContributionFacilityCode>();
    for (const [index, facility] of facilities.entries()) {
      if (seen.has(facility.code)) {
        context.addIssue({
          code: 'custom',
          path: [index, 'code'],
          message: 'Fasilitas yang sama tidak boleh diulang.',
        });
      }
      seen.add(facility.code);
    }
  });

const operatingHoursSchema = z
  .array(contributionOperatingHourSchema)
  .max(7)
  .superRefine((hours, context) => {
    const seen = new Set<number>();
    for (const [index, hour] of hours.entries()) {
      if (seen.has(hour.dayOfWeek)) {
        context.addIssue({
          code: 'custom',
          path: [index, 'dayOfWeek'],
          message: 'Hari yang sama tidak boleh diulang.',
        });
      }
      seen.add(hour.dayOfWeek);
    }
  });

export const contributionDraftSchema = z
  .object({
    address: optionalText(500, 'Alamat'),
    category: contributionCategorySchema.optional(),
    facilities: facilitiesSchema.optional(),
    landmark: optionalText(255, 'Patokan'),
    mainMenu: contributionDraftMainMenuSchema.optional(),
    mapsUrl: contributionMapsUrlSchema.optional(),
    notes: optionalText(1_000, 'Catatan'),
    operatingHours: operatingHoursSchema.optional(),
    placeName: optionalText(180, 'Nama tempat'),
  })
  .strict() satisfies z.ZodType<ContributionDraftPayload>;

function validateStepOne(payload: ContributionDraftPayload, context: z.RefinementCtx) {
  if (!payload.placeName) {
    context.addIssue({ code: 'custom', path: ['placeName'], message: 'Nama tempat wajib diisi.' });
  }
  if (!payload.category) {
    context.addIssue({ code: 'custom', path: ['category'], message: 'Kategori wajib dipilih.' });
  }
  if (!payload.address) {
    context.addIssue({
      code: 'custom',
      path: ['address'],
      message: 'Alamat atau deskripsi lokasi wajib diisi.',
    });
  }
}

function validateStepTwo(payload: ContributionDraftPayload, context: z.RefinementCtx) {
  if (payload.category === 'MAKAN_MURAH' || payload.category === 'NGOPI') {
    const menuResult = contributionMainMenuSchema.safeParse(payload.mainMenu);
    if (!menuResult.success) {
      context.addIssue({
        code: 'custom',
        path: ['mainMenu'],
        message: 'Menu termurah dan harganya wajib diisi untuk kategori ini.',
      });
    }
  } else if (payload.mainMenu) {
    context.addIssue({
      code: 'custom',
      path: ['mainMenu'],
      message: 'Data menu tidak berlaku untuk kategori ini.',
    });
  }
}

export const contributionStepOneSchema = contributionDraftSchema.superRefine(validateStepOne);
export const contributionStepTwoSchema = contributionDraftSchema.superRefine(validateStepTwo);
export const contributionSubmissionSchema = contributionDraftSchema.superRefine(
  (payload, context) => {
    validateStepOne(payload, context);
    validateStepTwo(payload, context);
  },
);

export const createContributionSchema = z
  .object({ payload: contributionDraftSchema.optional() })
  .strict();

export const updateContributionSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    payload: contributionDraftSchema,
  })
  .strict();

export const submitContributionSchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();

export const contributionIdempotencyKeySchema = z
  .string()
  .regex(idempotencyKeyPattern, 'Idempotency-Key tidak valid.');

export type CreateContributionInput = z.infer<typeof createContributionSchema>;
export type UpdateContributionInput = z.infer<typeof updateContributionSchema>;
export type SubmitContributionInput = z.infer<typeof submitContributionSchema>;

export function normalizeContributionFacilities(
  facilities: readonly ContributionFacility[] | undefined,
): readonly ContributionFacility[] {
  const provided = new Map(facilities?.map((facility) => [facility.code, facility.status]) ?? []);
  return contributionFacilityCodeValues.map((code) => ({
    code,
    status: provided.get(code) ?? 'UNKNOWN',
  }));
}

export function canonicalizeContributionDraft(
  payload: ContributionDraftPayload,
): ContributionDraftPayload {
  const categoryUsesPrice = payload.category === 'MAKAN_MURAH' || payload.category === 'NGOPI';
  return {
    ...payload,
    facilities: normalizeContributionFacilities(payload.facilities),
    ...(categoryUsesPrice ? {} : { mainMenu: undefined }),
  };
}

export const contributionFacilitiesByCategory: Readonly<
  Record<ContributionCategory, readonly ContributionFacilityCode[]>
> = {
  MAKAN_MURAH: ['PARKING', 'TOILET', 'MUSALA', 'SEATING', 'SHADE'],
  NGOPI: ['PARKING', 'TOILET', 'MUSALA', 'POWER_OUTLET', 'SEATING', 'WIFI'],
  TOILET: ['PARKING', 'TOILET', 'SEATING'],
  MUSALA: ['PARKING', 'TOILET', 'MUSALA'],
  ISTIRAHAT: [...contributionFacilityCodeValues],
};

export function canContributorTransition(
  current: (typeof contributionStatusValues)[number],
  next: (typeof contributionStatusValues)[number],
): boolean {
  return current === 'DRAFT' && (next === 'DRAFT' || next === 'PENDING');
}

export function redactContributionPayload(
  payload: ContributionDraftPayload,
): Readonly<Record<string, unknown>> {
  return {
    category: payload.category,
    address: payload.address ? '[REDACTED]' : undefined,
    landmark: payload.landmark ? '[REDACTED]' : undefined,
    mapsUrl: payload.mapsUrl ? '[REDACTED]' : undefined,
    notes: payload.notes ? '[REDACTED]' : undefined,
    placeName: payload.placeName ? '[REDACTED]' : undefined,
    mainMenu: payload.mainMenu
      ? { name: '[REDACTED]', priceAmount: payload.mainMenu.priceAmount }
      : undefined,
    facilityCount: payload.facilities?.length ?? 0,
    operatingHourCount: payload.operatingHours?.length ?? 0,
  };
}
