import { z } from 'zod';

export const nonEmptyStringSchema = z.string().trim().min(1, 'Must not be empty');

export const portSchema = z.coerce
  .number<number>()
  .int('Port must be an integer')
  .min(1, 'Port must be at least 1')
  .max(65_535, 'Port must be at most 65535');

export const urlSchema = z.url('Must be a valid absolute URL');

export const nodeEnvironmentSchema = z.enum(['development', 'test', 'production']);

export const booleanStringSchema = z.enum(['true', 'false']).transform((value) => value === 'true');

export const commaSeparatedUrlsSchema = nonEmptyStringSchema.superRefine((value, context) => {
  for (const item of value.split(',').map((entry) => entry.trim())) {
    const result = urlSchema.safeParse(item);
    if (!result.success) {
      context.addIssue({
        code: 'custom',
        message: `Invalid URL in comma-separated list: ${item}`,
      });
    }
  }
});

export const healthStatusSchema = z.enum(['ok', 'ready', 'not_ready']);
