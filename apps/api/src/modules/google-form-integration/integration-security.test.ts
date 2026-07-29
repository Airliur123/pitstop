import { createHmac } from 'node:crypto';

import { canonicalIntegrationSignatureMessage } from '@pitstop/validation';
import { describe, expect, it } from 'vitest';

import type { ApiProblemException } from '../../common/errors/api-problem.exception';
import type { ApiEnvironmentProvider } from '../../configuration';
import {
  constantTimeHexEqual,
  INTEGRATION_LOG_REDACTION_PATHS,
  verifyIntegrationRequest,
} from './integration-security';

const body = {
  payload: {
    address: 'Jl. Contoh',
    area: 'Tambora',
    category: 'TOILET',
    placeName: 'Toilet Contoh',
  },
  schemaVersion: 1,
  submittedAt: '2026-07-29T10:00:00.000Z',
};
const headers = {
  externalSubmissionId: 'form-response-0001',
  sourceId: 'google-form-main',
  timestamp: '2026-07-29T10:01:00.000Z',
};

describe('Google Form integration HMAC', () => {
  it('accepts current and previous rotation keys', () => {
    const environment = integrationEnvironment();
    for (const [keyId, secret] of [
      ['current-v2', environment.GOOGLE_FORM_CURRENT_SECRET],
      ['previous-v1', environment.GOOGLE_FORM_PREVIOUS_SECRET],
    ] as const) {
      const signature = sign(secret ?? '', headers, body);
      expect(
        verifyIntegrationRequest({
          ...headers,
          body,
          environment,
          keyId,
          now: new Date('2026-07-29T10:02:00.000Z'),
          signature,
        }).acceptedKeyId,
      ).toBe(keyId);
    }
  });

  it('matches the public Apps Script HMAC interoperability vector', () => {
    expect(
      sign('fixture-google-form-secret-0123456789012345', headers, {
        ...body,
        payload: {
          address: 'Jl. Contoh 1',
          area: 'Tambora',
          category: 'MAKAN_MURAH',
          cheapestMenuName: 'Nasi telur',
          cheapestMenuPrice: 12_000,
          maximumUsefulBudget: 15_000,
          placeName: 'Warung Contoh',
        },
      }),
    ).toBe('913a34dba5e97cc858b65280d703482df98296e435ced66bdf25c911a44805d0');
  });

  it('rejects invalid signatures, stale timestamps, disabled and unknown sources', () => {
    const environment = integrationEnvironment();
    expectProblemCode(
      () =>
        verifyIntegrationRequest({
          ...headers,
          body,
          environment,
          now: new Date('2026-07-29T10:02:00.000Z'),
          signature: '0'.repeat(64),
        }),
      'INTEGRATION_SIGNATURE_INVALID',
    );
    expectProblemCode(
      () =>
        verifyIntegrationRequest({
          ...headers,
          body,
          environment,
          now: new Date('2026-07-29T11:00:00.000Z'),
          signature: sign(environment.GOOGLE_FORM_CURRENT_SECRET ?? '', headers, body),
        }),
      'INTEGRATION_REPLAY_REJECTED',
    );
    expectProblemCode(
      () =>
        verifyIntegrationRequest({
          ...headers,
          body,
          environment: { ...environment, GOOGLE_FORM_SOURCE_ENABLED: false },
          now: new Date('2026-07-29T10:02:00.000Z'),
          signature: sign(environment.GOOGLE_FORM_CURRENT_SECRET ?? '', headers, body),
        }),
      'INTEGRATION_SOURCE_DISABLED',
    );
    expectProblemCode(
      () =>
        verifyIntegrationRequest({
          ...headers,
          body,
          environment,
          now: new Date('2026-07-29T10:02:00.000Z'),
          signature: '0'.repeat(64),
          sourceId: 'unknown-source',
        }),
      'INTEGRATION_SOURCE_UNKNOWN',
    );
  });

  it('uses a constant-time comparison wrapper and redacts integration secrets/email', () => {
    expect(constantTimeHexEqual('ab'.repeat(32), 'ab'.repeat(32))).toBe(true);
    expect(constantTimeHexEqual('ab'.repeat(32), 'ac'.repeat(32))).toBe(false);
    expect(constantTimeHexEqual('ab'.repeat(32), 'ab')).toBe(false);
    expect(INTEGRATION_LOG_REDACTION_PATHS).toContain('req.headers.x-pitstop-signature');
    expect(INTEGRATION_LOG_REDACTION_PATHS).toContain('req.body.payload.submitterEmail');
  });
});

function sign(secret: string, request: typeof headers, requestBody: unknown): string {
  return createHmac('sha256', secret)
    .update(
      canonicalIntegrationSignatureMessage({
        body: requestBody,
        externalSubmissionId: request.externalSubmissionId,
        sourceId: request.sourceId,
        timestamp: request.timestamp,
      }),
    )
    .digest('hex');
}

function expectProblemCode(action: () => unknown, expectedCode: string): void {
  try {
    action();
    throw new Error('Expected integration request verification to fail.');
  } catch (error) {
    const response = (error as ApiProblemException).getResponse();
    expect(response).toMatchObject({ code: expectedCode });
  }
}

function integrationEnvironment(): ApiEnvironmentProvider {
  return {
    GOOGLE_FORM_BODY_LIMIT_BYTES: 131_072,
    GOOGLE_FORM_CURRENT_KEY_ID: 'current-v2',
    GOOGLE_FORM_CURRENT_SECRET: 'current-google-form-secret-0123456789012345',
    GOOGLE_FORM_PREVIOUS_KEY_ID: 'previous-v1',
    GOOGLE_FORM_PREVIOUS_SECRET: 'previous-google-form-secret-01234567890123',
    GOOGLE_FORM_RATE_LIMIT_MAX: 120,
    GOOGLE_FORM_RATE_LIMIT_WINDOW_SECONDS: 60,
    GOOGLE_FORM_REPLAY_WINDOW_SECONDS: 300,
    GOOGLE_FORM_SOURCE_ENABLED: true,
    GOOGLE_FORM_SOURCE_ID: 'google-form-main',
  } as ApiEnvironmentProvider;
}
