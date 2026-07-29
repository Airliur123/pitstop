import {
  type ContributionFacility,
  contributionFacilityCodeValues,
  contributionFacilityStatusValues,
  type GoogleFormCanonicalPayload,
  type GoogleFormInboundPayload,
  googleFormPayloadSchemaVersion,
  googleFormSubmissionStatusValues,
  integrationStageStatusValues,
} from '@pitstop/contracts';
import { z } from 'zod';

import {
  contributionCategorySchema,
  contributionMapsUrlSchema,
  contributionOperatingHourSchema,
} from './contributions';

const externalSubmissionIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{7,254}$/;
const sourceIdPattern = /^[a-z][a-z0-9-]{2,79}$/;
const keyIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/;
const signaturePattern = /^[a-f0-9]{64}$/i;
const formulaPrefixPattern = /^[=+\-@]/;
const rupiahTextPattern = /^(?:Rp\s*)?(\d+|\d{1,3}(?:\.\d{3})+)$/i;
const maximumSupportedRupiah = 10_000_000;

function normalizedText(maximum: number, label: string) {
  return z
    .string()
    .transform(normalizeGoogleFormText)
    .pipe(
      z
        .string()
        .min(1, `${label} wajib diisi.`)
        .max(maximum, `${label} terlalu panjang.`)
        .refine((value) => !hasUnsafeControlCharacter(value), {
          message: `${label} mengandung karakter kontrol yang tidak diizinkan.`,
        })
        .refine((value) => !formulaPrefixPattern.test(value), {
          message: `${label} tidak boleh diawali operator formula spreadsheet.`,
        }),
    );
}

const optionalNormalizedText = (maximum: number, label: string) =>
  z.preprocess(
    (value) =>
      typeof value === 'string' && normalizeGoogleFormText(value) === '' ? undefined : value,
    normalizedText(maximum, label).optional(),
  );

const rupiahSchema = z
  .number()
  .int('Nilai rupiah harus berupa integer.')
  .min(1, 'Nilai rupiah harus lebih besar dari nol.')
  .max(10_000_000, 'Nilai rupiah melebihi batas yang didukung.');

const facilitySchema = z
  .object({
    code: z.enum(contributionFacilityCodeValues),
    status: z.enum(contributionFacilityStatusValues),
  })
  .strict();

const facilitiesSchema = z
  .array(facilitySchema)
  .max(contributionFacilityCodeValues.length)
  .superRefine((facilities, context) => {
    const seen = new Set<string>();
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

const openingHoursSchema = z
  .array(contributionOperatingHourSchema)
  .max(7)
  .superRefine((hours, context) => {
    const seen = new Set<number>();
    for (const [index, item] of hours.entries()) {
      if (seen.has(item.dayOfWeek)) {
        context.addIssue({
          code: 'custom',
          path: [index, 'dayOfWeek'],
          message: 'Hari operasional yang sama tidak boleh diulang.',
        });
      }
      seen.add(item.dayOfWeek);
    }
  });

const priceRangeSchema = z
  .object({ maximum: rupiahSchema, minimum: rupiahSchema })
  .strict()
  .refine((value) => value.minimum <= value.maximum, {
    message: 'Batas minimum kisaran harga tidak boleh melebihi batas maksimum.',
  });

export const googleFormInboundPayloadSchema = z
  .object({
    address: normalizedText(500, 'Alamat'),
    area: normalizedText(180, 'Wilayah'),
    category: contributionCategorySchema,
    cheapestMenuName: optionalNormalizedText(180, 'Nama menu termurah'),
    cheapestMenuPrice: rupiahSchema.optional(),
    facilities: facilitiesSchema.optional(),
    landmark: optionalNormalizedText(255, 'Patokan'),
    mapUrl: contributionMapsUrlSchema.optional(),
    maximumUsefulBudget: rupiahSchema.optional(),
    notes: optionalNormalizedText(1_000, 'Catatan'),
    openingHours: openingHoursSchema.optional(),
    placeName: normalizedText(180, 'Nama tempat'),
    priceRange: priceRangeSchema.optional(),
    submitterEmail: z.preprocess(
      (value) =>
        typeof value === 'string' && normalizeGoogleFormText(value) === '' ? undefined : value,
      z
        .email('Email pengisi tidak valid.')
        .max(254)
        .transform((value) => value.trim().toLocaleLowerCase('en-US'))
        .optional(),
    ),
  })
  .strict()
  .superRefine(validateCategoryPricing) satisfies z.ZodType<GoogleFormInboundPayload>;

export const googleFormInboundSubmissionSchema = z
  .object({
    payload: googleFormInboundPayloadSchema,
    schemaVersion: z.literal(googleFormPayloadSchemaVersion),
    submittedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const googleFormSourceMetadataSchema = z
  .object({
    externalSubmissionId: z.string().regex(externalSubmissionIdPattern),
    receivedAt: z.iso.datetime({ offset: true }),
    sourceId: z.string().regex(sourceIdPattern),
    submittedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const googleFormCanonicalPayloadSchema = googleFormInboundPayloadSchema
  .safeExtend({
    facilities: facilitiesSchema,
    openingHours: openingHoursSchema,
    sourceMetadata: googleFormSourceMetadataSchema,
  })
  .strict() satisfies z.ZodType<GoogleFormCanonicalPayload>;

export const googleFormSubmissionStatusSchema = z.enum(googleFormSubmissionStatusValues);
export const integrationStageStatusSchema = z.enum(integrationStageStatusValues);
export const integrationSourceIdSchema = z.string().regex(sourceIdPattern);
export const integrationExternalSubmissionIdSchema = z.string().regex(externalSubmissionIdPattern);
export const integrationKeyIdSchema = z.string().regex(keyIdPattern);
export const integrationSignatureSchema = z.string().regex(signaturePattern);
export const integrationTimestampSchema = z.iso.datetime({ offset: true });
const jobBaseSchema = z
  .object({
    attempt: z.number().int().nonnegative(),
    correlationId: z.string().min(1).max(128),
    enqueuedAt: z.iso.datetime({ offset: true }),
    idempotencyKey: z.string().min(8).max(180),
    inboxId: z.string().length(26),
    requestId: z.string().min(1).max(128),
  })
  .strict();
export const processGoogleFormSubmissionJobSchema = jobBaseSchema;
export const geocodeContributionJobSchema = jobBaseSchema
  .extend({ contributionId: z.string().length(26) })
  .strict();
export const detectDuplicatePlaceJobSchema = geocodeContributionJobSchema;

export const adminGoogleFormSubmissionListQuerySchema = z
  .object({
    page: z.coerce.number<number>().int().min(1).max(10_000).optional().default(1),
    pageSize: z.coerce.number<number>().int().min(1).max(50).optional().default(20),
    status: googleFormSubmissionStatusSchema.optional(),
  })
  .strict();

export type GoogleFormInboundSubmissionInput = z.infer<typeof googleFormInboundSubmissionSchema>;
export type AdminGoogleFormSubmissionListQuery = z.infer<
  typeof adminGoogleFormSubmissionListQuerySchema
>;

export function normalizeGoogleFormText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export function canonicalizeGoogleFormPayload(
  input: GoogleFormInboundSubmissionInput,
  metadata: {
    readonly externalSubmissionId: string;
    readonly receivedAt: string;
    readonly sourceId: string;
  },
): GoogleFormCanonicalPayload {
  const payload = googleFormInboundPayloadSchema.parse(input.payload);
  const provided = new Map(
    payload.facilities?.map((facility) => [facility.code, facility.status]) ?? [],
  );
  const facilities: ContributionFacility[] = contributionFacilityCodeValues.map((code) => ({
    code,
    status: provided.get(code) ?? 'UNKNOWN',
  }));
  return googleFormCanonicalPayloadSchema.parse({
    ...payload,
    facilities,
    openingHours: payload.openingHours ?? [],
    sourceMetadata: {
      ...metadata,
      submittedAt: new Date(input.submittedAt).toISOString(),
    },
  });
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  throw new TypeError('Canonical JSON supports JSON values only.');
}

export function canonicalIntegrationSignatureMessage(input: {
  readonly body: unknown;
  readonly externalSubmissionId: string;
  readonly sourceId: string;
  readonly timestamp: string;
}): string {
  return [
    'pitstop-google-form-v1',
    input.sourceId,
    input.externalSubmissionId,
    input.timestamp,
    canonicalJson(input.body),
  ].join('\n');
}

export function isTimestampWithinReplayWindow(
  timestamp: string,
  now: Date,
  replayWindowSeconds: number,
): boolean {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return false;
  return Math.abs(now.getTime() - parsed) <= replayWindowSeconds * 1_000;
}

export function sanitizeSpreadsheetCell(value: string): string {
  const normalized = [...value]
    .filter((character) => !isUnsafeControlCharacter(character))
    .join('')
    .trim();
  return formulaPrefixPattern.test(normalized) ? `'${normalized}` : normalized;
}

export function maskIntegrationEmail(value: string | undefined): string | null {
  if (!value) return null;
  const [local = '', domain = ''] = value.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}

export function parseGoogleFormRupiah(value: unknown): number {
  if (typeof value === 'number') return assertSupportedRupiah(value);
  if (typeof value !== 'string') throw new TypeError('Nilai rupiah tidak valid.');
  const normalized = value.trim();
  if (formulaPrefixPattern.test(normalized)) {
    throw new TypeError('Nilai rupiah tidak boleh berupa formula spreadsheet.');
  }
  const match = rupiahTextPattern.exec(normalized);
  const amountText = match?.[1];
  if (!amountText) throw new TypeError('Format rupiah tidak valid.');
  return assertSupportedRupiah(Number(amountText.replaceAll('.', '')));
}

function validateCategoryPricing(
  payload: GoogleFormInboundPayload,
  context: z.RefinementCtx,
): void {
  const requiresPrice = payload.category === 'MAKAN_MURAH' || payload.category === 'NGOPI';
  if (requiresPrice) {
    for (const field of [
      ['cheapestMenuName', payload.cheapestMenuName],
      ['cheapestMenuPrice', payload.cheapestMenuPrice],
      ['maximumUsefulBudget', payload.maximumUsefulBudget],
    ] as const) {
      if (field[1] === undefined) {
        context.addIssue({
          code: 'custom',
          path: [field[0]],
          message: 'Field ini wajib untuk kategori Makan Murah dan Ngopi.',
        });
      }
    }
    return;
  }
  for (const field of [
    ['cheapestMenuName', payload.cheapestMenuName],
    ['cheapestMenuPrice', payload.cheapestMenuPrice],
    ['priceRange', payload.priceRange],
    ['maximumUsefulBudget', payload.maximumUsefulBudget],
  ] as const) {
    if (field[1] !== undefined) {
      context.addIssue({
        code: 'custom',
        path: [field[0]],
        message: 'Data harga tidak berlaku untuk kategori ini.',
      });
    }
  }
}

function hasUnsafeControlCharacter(value: string): boolean {
  return [...value].some(isUnsafeControlCharacter);
}

function isUnsafeControlCharacter(character: string): boolean {
  const code = character.charCodeAt(0);
  return (code <= 31 && code !== 9 && code !== 10 && code !== 13) || code === 127;
}

function assertSupportedRupiah(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximumSupportedRupiah) {
    throw new TypeError('Nilai rupiah berada di luar batas yang didukung.');
  }
  return value;
}
