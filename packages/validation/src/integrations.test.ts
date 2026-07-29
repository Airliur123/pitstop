import { describe, expect, it } from 'vitest';

import {
  canonicalIntegrationSignatureMessage,
  canonicalizeGoogleFormPayload,
  canonicalJson,
  googleFormInboundSubmissionSchema,
  isTimestampWithinReplayWindow,
  maskIntegrationEmail,
  normalizeGoogleFormText,
  sanitizeSpreadsheetCell,
} from './integrations';

const validBody = {
  payload: {
    address: 'Jl. Contoh 1',
    area: 'Tambora',
    category: 'MAKAN_MURAH',
    cheapestMenuName: 'Nasi telur',
    cheapestMenuPrice: 12_000,
    maximumUsefulBudget: 15_000,
    placeName: 'Warung Contoh',
  },
  schemaVersion: 1,
  submittedAt: '2026-07-29T10:00:00.000Z',
} as const;

describe('Google Form canonical validation', () => {
  it('canonicalizes JSON recursively without depending on insertion order', () => {
    expect(canonicalJson({ z: [3, { b: true, a: 'x' }], a: 1 })).toBe(
      '{"a":1,"z":[3,{"a":"x","b":true}]}',
    );
    expect(canonicalJson({ a: 1, z: 2 })).toBe(canonicalJson({ z: 2, a: 1 }));
  });

  it('builds an unambiguous signature message', () => {
    expect(
      canonicalIntegrationSignatureMessage({
        body: validBody,
        externalSubmissionId: 'form-response-0001',
        sourceId: 'google-form-main',
        timestamp: '2026-07-29T10:01:00.000Z',
      }),
    ).toBe(
      [
        'pitstop-google-form-v1',
        'google-form-main',
        'form-response-0001',
        '2026-07-29T10:01:00.000Z',
        canonicalJson(validBody),
      ].join('\n'),
    );
  });

  it('normalizes Form whitespace and fills missing facilities as UNKNOWN', () => {
    const parsed = googleFormInboundSubmissionSchema.parse({
      ...validBody,
      payload: {
        ...validBody.payload,
        facilities: [{ code: 'TOILET', status: 'AVAILABLE' }],
        placeName: '  Warung   Contoh  ',
      },
    });
    const payload = canonicalizeGoogleFormPayload(parsed, {
      externalSubmissionId: 'form-response-0001',
      receivedAt: '2026-07-29T10:01:01.000Z',
      sourceId: 'google-form-main',
    });
    expect(payload.placeName).toBe('Warung Contoh');
    expect(payload.facilities).toHaveLength(7);
    expect(payload.facilities.find((facility) => facility.code === 'TOILET')?.status).toBe(
      'AVAILABLE',
    );
    expect(payload.facilities.find((facility) => facility.code === 'WIFI')?.status).toBe('UNKNOWN');
  });

  it('enforces category-dependent prices and rejects food fields for non-price categories', () => {
    expect(
      googleFormInboundSubmissionSchema.safeParse({
        ...validBody,
        payload: {
          address: 'Jl. A',
          area: 'Tambora',
          category: 'NGOPI',
          placeName: 'Kopi A',
        },
      }).success,
    ).toBe(false);
    expect(
      googleFormInboundSubmissionSchema.safeParse({
        ...validBody,
        payload: {
          ...validBody.payload,
          category: 'TOILET',
        },
      }).success,
    ).toBe(false);
  });

  it('normalizes blank optional fields and rejects spreadsheet formula-like input', () => {
    expect(normalizeGoogleFormText('  A\r\n B  ')).toBe('A\n B');
    expect(
      googleFormInboundSubmissionSchema.parse({
        ...validBody,
        payload: { ...validBody.payload, notes: '   ' },
      }).payload.notes,
    ).toBeUndefined();
    expect(
      googleFormInboundSubmissionSchema.safeParse({
        ...validBody,
        payload: { ...validBody.payload, placeName: '=IMPORTXML("x")' },
      }).success,
    ).toBe(false);
    expect(sanitizeSpreadsheetCell('+CMD')).toBe("'+CMD");
  });

  it('checks a symmetric replay window and masks optional email', () => {
    const now = new Date('2026-07-29T10:05:00.000Z');
    expect(isTimestampWithinReplayWindow('2026-07-29T10:00:00.000Z', now, 300)).toBe(true);
    expect(isTimestampWithinReplayWindow('2026-07-29T09:59:59.999Z', now, 300)).toBe(false);
    expect(isTimestampWithinReplayWindow('2026-07-29T10:10:00.001Z', now, 300)).toBe(false);
    expect(maskIntegrationEmail('driver@example.com')).toBe('d***@example.com');
    expect(maskIntegrationEmail(undefined)).toBeNull();
  });
});
