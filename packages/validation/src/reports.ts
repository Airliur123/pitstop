import {
  confirmationTypeValues,
  contributionCategoryValues,
  contributionFacilityCodeValues,
  contributionFacilityStatusValues,
  contributionStatusValues,
  reportStatusValues,
  reportTypeValues,
} from '@pitstop/contracts';
import { z } from 'zod';

const activeMarkup = /<\s*\/?\s*[a-z][^>]*>/i;
const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
const idempotencyKeyPattern = /^[A-Za-z0-9._:-]{8,128}$/;
const plainPositiveInteger = /^(?:[1-9]\d*)$/;
const privateOrLocalHostname =
  /^(?:localhost|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|\[?::1\]?)$/i;

function safeText(minimum: number, maximum: number, label: string) {
  return z
    .string()
    .trim()
    .min(minimum, `${label} minimal ${minimum} karakter.`)
    .max(maximum, `${label} maksimal ${maximum} karakter.`)
    .refine((value) => !activeMarkup.test(value), `${label} tidak boleh memuat markup HTML.`);
}

const ulidSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'ID tidak valid.');
const expectedVersion = z.number().int().positive();
const reportExplanation = safeText(20, 1_000, 'Penjelasan');
const resolution = safeText(10, 500, 'Resolusi');
const optionalEvidenceReference = safeText(3, 500, 'Referensi bukti').optional();

export const evidenceUrlSchema = z
  .url('URL bukti tidak valid.')
  .max(1_000, 'URL bukti terlalu panjang.')
  .refine((value) => {
    const parsed = new URL(value);
    return (
      parsed.protocol === 'https:' &&
      parsed.username === '' &&
      parsed.password === '' &&
      !privateOrLocalHostname.test(parsed.hostname)
    );
  }, 'URL bukti harus memakai HTTPS publik tanpa kredensial.');

const rupiahSchema = z.number().int().min(0).max(10_000_000);
const clockPattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const operatingHourSchema = z
  .object({
    closesAt: z.string().regex(clockPattern).nullable(),
    dayOfWeek: z.number().int().min(0).max(6),
    is24Hours: z.boolean(),
    isClosed: z.boolean(),
    opensAt: z.string().regex(clockPattern).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.isClosed || value.is24Hours) {
      if (value.opensAt !== null || value.closesAt !== null) {
        context.addIssue({
          code: 'custom',
          message: 'Hari tutup/24 jam tidak boleh memiliki rentang waktu.',
        });
      }
      return;
    }
    if (value.opensAt === null || value.closesAt === null || value.opensAt === value.closesAt) {
      context.addIssue({
        code: 'custom',
        message: 'Jam buka dan tutup yang berbeda wajib diisi.',
      });
    }
  });

const operatingHoursSchema = z
  .array(operatingHourSchema)
  .min(1)
  .max(21)
  .superRefine((hours, context) => {
    const hoursByDay = new Map<number, Array<(typeof hours)[number]>>();
    for (const [index, hour] of hours.entries()) {
      const dayHours = hoursByDay.get(hour.dayOfWeek) ?? [];
      dayHours.push(hour);
      hoursByDay.set(hour.dayOfWeek, dayHours);

      if (
        dayHours.length > 1 &&
        dayHours.some((candidate) => candidate.isClosed || candidate.is24Hours)
      ) {
        context.addIssue({
          code: 'custom',
          path: [index, 'dayOfWeek'],
          message: 'Hari tutup atau 24 jam tidak boleh digabung dengan interval lain.',
        });
      }
    }
  });

const pricePatchSchema = z
  .object({
    kind: z.literal('PRICE_CHANGED'),
    menuId: ulidSchema.optional(),
    menuName: safeText(1, 180, 'Nama menu').optional(),
    priceAmount: rupiahSchema.optional(),
  })
  .strict()
  .refine((value) => value.menuName !== undefined || value.priceAmount !== undefined, {
    message: 'Nama menu atau harga baru wajib diisi.',
  });

const hoursPatchSchema = z
  .object({ kind: z.literal('HOURS_CHANGED'), operatingHours: operatingHoursSchema })
  .strict();

const locationPatchSchema = z
  .object({
    address: safeText(5, 500, 'Alamat').optional(),
    city: safeText(1, 120, 'Kota').optional(),
    district: safeText(1, 120, 'Kecamatan').optional(),
    kind: z.literal('LOCATION_INCORRECT'),
    latitude: z.number().finite().min(-90).max(90).optional(),
    longitude: z.number().finite().min(-180).max(180).optional(),
    postalCode: z.string().trim().max(12).nullable().optional(),
    province: safeText(1, 120, 'Provinsi').optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.latitude === undefined) !== (value.longitude === undefined)) {
      context.addIssue({
        code: 'custom',
        path: ['latitude'],
        message: 'Latitude dan longitude harus dikirim berpasangan.',
      });
    }
    if (
      value.address === undefined &&
      value.latitude === undefined &&
      value.city === undefined &&
      value.district === undefined &&
      value.province === undefined
    ) {
      context.addIssue({ code: 'custom', message: 'Perubahan lokasi/alamat wajib diisi.' });
    }
  });

const categoryPatchSchema = z
  .object({
    categoryCode: z.enum(contributionCategoryValues),
    kind: z.literal('CATEGORY_INCORRECT'),
  })
  .strict();

const facilityPatchSchema = z
  .object({
    facilityCode: z.enum(contributionFacilityCodeValues),
    kind: z.literal('FACILITY_CHANGED'),
    status: z.enum(contributionFacilityStatusValues),
  })
  .strict();

const temporaryClosurePatchSchema = z
  .object({
    kind: z.literal('TEMPORARILY_CLOSED'),
    placeStatus: z.literal('TEMPORARILY_CLOSED'),
  })
  .strict();

const permanentClosurePatchSchema = z
  .object({
    kind: z.literal('PERMANENTLY_CLOSED'),
    placeStatus: z.literal('PERMANENTLY_CLOSED'),
  })
  .strict();

const duplicatePatchSchema = z
  .object({
    duplicatePlaceId: ulidSchema,
    kind: z.literal('DUPLICATE_PLACE'),
    placeStatus: z.literal('ARCHIVED'),
  })
  .strict();

const otherPatchSchema = z
  .object({
    description: safeText(1, 2_000, 'Deskripsi').nullable().optional(),
    kind: z.literal('OTHER'),
    landmark: safeText(1, 255, 'Patokan').nullable().optional(),
    name: safeText(1, 180, 'Nama').optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.description !== undefined || value.landmark !== undefined || value.name !== undefined,
    { message: 'Minimal satu perubahan faktual wajib diisi.' },
  );

export const approvedPlacePatchSchema = z.discriminatedUnion('kind', [
  pricePatchSchema,
  hoursPatchSchema,
  locationPatchSchema,
  categoryPatchSchema,
  facilityPatchSchema,
  temporaryClosurePatchSchema,
  permanentClosurePatchSchema,
  duplicatePatchSchema,
  otherPatchSchema,
]);

export const createReportSchema = z
  .object({
    evidenceReference: optionalEvidenceReference,
    evidenceUrl: evidenceUrlSchema.optional(),
    expectedPlaceVersion: expectedVersion,
    explanation: reportExplanation,
    proposedChange: approvedPlacePatchSchema,
    reportType: z.enum(reportTypeValues),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.reportType !== value.proposedChange.kind) {
      context.addIssue({
        code: 'custom',
        path: ['proposedChange', 'kind'],
        message: 'Jenis proposal harus sama dengan jenis laporan.',
      });
    }
  });

export const confirmationSchema = z
  .object({
    confirmationType: z.enum(confirmationTypeValues),
    confirmedAt: z.iso.datetime({ offset: true }),
    expectedPlaceVersion: expectedVersion,
    note: safeText(3, 300, 'Catatan').optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const observed = Date.parse(value.confirmedAt);
    const now = Date.now();
    if (observed > now + 5 * 60_000) {
      context.addIssue({
        code: 'custom',
        path: ['confirmedAt'],
        message: 'Waktu konfirmasi tidak boleh berada di masa depan.',
      });
    }
    if (observed < now - 30 * 24 * 60 * 60_000) {
      context.addIssue({
        code: 'custom',
        path: ['confirmedAt'],
        message: 'Konfirmasi harus berasal dari 30 hari terakhir.',
      });
    }
  });

export const reportIdempotencyKeySchema = z
  .string()
  .regex(idempotencyKeyPattern, 'Idempotency-Key tidak valid.');

export const reportDecisionSchema = z.object({ expectedVersion, resolution }).strict();

export const applyReportSchema = z
  .object({
    approvedPatch: approvedPlacePatchSchema,
    expectedPlaceVersion: expectedVersion,
    expectedReportVersion: expectedVersion,
    resolution,
  })
  .strict();

const queryLimit = z
  .string()
  .regex(plainPositiveInteger, 'limit harus berupa integer positif.')
  .transform(Number)
  .pipe(z.number().int().min(1).max(50));
const optionalDate = z
  .string()
  .regex(dateOnly, 'Tanggal harus berformat YYYY-MM-DD.')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), 'Tanggal tidak valid.');

export const activityQuerySchema = z
  .object({
    cursor: z.string().trim().min(1).max(1_024).optional(),
    limit: queryLimit.optional().default(20),
    status: z
      .union([
        z.enum(contributionStatusValues),
        z.enum(reportStatusValues),
        z.enum(['ACTIVE', 'EXPIRED']),
      ])
      .optional(),
    type: z.enum(['CONTRIBUTION', 'REPORT', 'CONFIRMATION']).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === undefined || value.type === undefined) return;

    const allowedStatuses: Record<NonNullable<typeof value.type>, readonly string[]> = {
      CONFIRMATION: ['ACTIVE', 'EXPIRED'],
      CONTRIBUTION: contributionStatusValues,
      REPORT: reportStatusValues,
    };
    if (!allowedStatuses[value.type].includes(value.status)) {
      context.addIssue({
        code: 'custom',
        path: ['status'],
        message: `Status ${value.status} tidak valid untuk activity ${value.type}.`,
      });
    }
  });

export const adminReportQueueSchema = z
  .object({
    category: z.enum(contributionCategoryValues).optional(),
    cursor: z.string().trim().min(1).max(1_024).optional(),
    from: optionalDate.optional(),
    limit: queryLimit.optional().default(20),
    reportType: z.enum(reportTypeValues).optional(),
    reviewer: z.enum(['CLAIMED', 'UNCLAIMED', 'EXPIRED']).optional(),
    search: z.string().trim().min(2).max(120).optional(),
    sort: z.enum(['SUBMITTED_DESC', 'SUBMITTED_ASC']).optional().default('SUBMITTED_DESC'),
    status: z.enum(reportStatusValues).optional(),
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

export const auditLogQuerySchema = z
  .object({
    action: z.string().trim().min(1).max(120).optional(),
    cursor: z.string().trim().min(1).max(1_024).optional(),
    limit: queryLimit.optional().default(20),
    resourceId: ulidSchema.optional(),
    resourceType: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

export type CreateReportInput = z.infer<typeof createReportSchema>;
export type ConfirmationInput = z.infer<typeof confirmationSchema>;
export type ApplyReportInput = z.infer<typeof applyReportSchema>;
export type ReportDecisionInput = z.infer<typeof reportDecisionSchema>;
export type ActivityQueryInput = z.infer<typeof activityQuerySchema>;
export type AdminReportQueueInput = z.infer<typeof adminReportQueueSchema>;
export type AuditLogQueryInput = z.infer<typeof auditLogQuerySchema>;

export function canTransitionReport(
  current: (typeof reportStatusValues)[number],
  next: (typeof reportStatusValues)[number],
): boolean {
  return (
    (current === 'PENDING' && next === 'IN_REVIEW') ||
    (current === 'IN_REVIEW' && (next === 'APPLIED' || next === 'REJECTED'))
  );
}
