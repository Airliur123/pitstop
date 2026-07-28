import { authRoleValues } from '@pitstop/contracts';
import { z } from 'zod';

export const authReturnToValues = ['/', '/activity', '/contribute'] as const;
const contributionReturnToPattern = /^\/contributions\/[0-9A-HJKMNP-TV-Z]{26}(?:\/success)?$/;

export function normalizeEmail(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase();
}

export const authEmailSchema = z.preprocess(
  (value) => (typeof value === 'string' ? normalizeEmail(value) : value),
  z.email('Masukkan alamat email yang valid.').max(320, 'Alamat email terlalu panjang.'),
);

export const authReturnToSchema = z.union([
  z.enum(authReturnToValues),
  z.string().regex(contributionReturnToPattern, 'Tujuan masuk tidak diizinkan.'),
]);

export function safeAuthReturnTo(value: unknown, fallback = '/'): string {
  const parsed = authReturnToSchema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

export const authRoleSchema = z.enum(authRoleValues);

export const magicLinkRequestSchema = z
  .object({
    email: authEmailSchema,
    returnTo: authReturnToSchema.optional().default('/'),
  })
  .strict();

export const magicLinkVerifySchema = z
  .object({
    token: z
      .string()
      .min(40)
      .max(128)
      .regex(/^[A-Za-z0-9_-]+$/, 'Token masuk tidak valid.'),
  })
  .strict();

export type MagicLinkRequestInput = z.infer<typeof magicLinkRequestSchema>;
export type MagicLinkVerifyInput = z.infer<typeof magicLinkVerifySchema>;
