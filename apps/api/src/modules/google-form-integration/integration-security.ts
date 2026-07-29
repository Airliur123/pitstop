import { createHmac, timingSafeEqual } from 'node:crypto';

import {
  canonicalIntegrationSignatureMessage,
  integrationExternalSubmissionIdSchema,
  integrationKeyIdSchema,
  integrationSignatureSchema,
  integrationSourceIdSchema,
  integrationTimestampSchema,
  isTimestampWithinReplayWindow,
} from '@pitstop/validation';

import { ApiProblemException } from '../../common/errors/api-problem.exception';
import type { ApiEnvironmentProvider } from '../../configuration';

export const INTEGRATION_LOG_REDACTION_PATHS = [
  'req.headers.x-pitstop-signature',
  'req.headers.x-pitstop-key-id',
  'req.body.payload.submitterEmail',
  'request.headers.x-pitstop-signature',
  'request.body.payload.submitterEmail',
] as const;

export interface VerifiedIntegrationRequest {
  readonly acceptedKeyId: string;
  readonly externalSubmissionId: string;
  readonly sourceId: string;
  readonly timestamp: string;
}

export function verifyIntegrationRequest(input: {
  readonly body: unknown;
  readonly environment: ApiEnvironmentProvider;
  readonly externalSubmissionId: unknown;
  readonly keyId?: unknown;
  readonly now?: Date;
  readonly signature: unknown;
  readonly sourceId: unknown;
  readonly timestamp: unknown;
}): VerifiedIntegrationRequest {
  const sourceId = parseHeader(integrationSourceIdSchema, input.sourceId);
  const externalSubmissionId = parseHeader(
    integrationExternalSubmissionIdSchema,
    input.externalSubmissionId,
  );
  const timestamp = parseHeader(integrationTimestampSchema, input.timestamp);
  const signature = parseHeader(integrationSignatureSchema, input.signature);
  const keyId =
    input.keyId === undefined ? undefined : parseHeader(integrationKeyIdSchema, input.keyId);

  if (sourceId !== input.environment.GOOGLE_FORM_SOURCE_ID) {
    throw integrationAuthProblem('INTEGRATION_SOURCE_UNKNOWN', 'Integration source is unknown.');
  }
  if (!input.environment.GOOGLE_FORM_SOURCE_ENABLED) {
    throw new ApiProblemException({
      status: 403,
      code: 'INTEGRATION_SOURCE_DISABLED',
      title: 'Integration source disabled',
      detail: 'The configured integration source is disabled.',
    });
  }
  if (
    !isTimestampWithinReplayWindow(
      timestamp,
      input.now ?? new Date(),
      input.environment.GOOGLE_FORM_REPLAY_WINDOW_SECONDS,
    )
  ) {
    throw integrationAuthProblem(
      'INTEGRATION_REPLAY_REJECTED',
      'The integration timestamp is outside the accepted replay window.',
    );
  }

  const message = canonicalIntegrationSignatureMessage({
    body: input.body,
    externalSubmissionId,
    sourceId,
    timestamp,
  });
  const candidates = integrationKeys(input.environment).filter(
    (candidate) => keyId === undefined || candidate.keyId === keyId,
  );
  for (const candidate of candidates) {
    const expected = createHmac('sha256', candidate.secret).update(message).digest('hex');
    if (constantTimeHexEqual(expected, signature)) {
      return { acceptedKeyId: candidate.keyId, externalSubmissionId, sourceId, timestamp };
    }
  }
  throw integrationAuthProblem(
    'INTEGRATION_SIGNATURE_INVALID',
    'The integration signature could not be verified.',
  );
}

export function constantTimeHexEqual(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected, 'hex');
  const actualBytes = Buffer.from(actual, 'hex');
  const lengthMatches = expectedBytes.length === actualBytes.length;
  const comparableActual = lengthMatches ? actualBytes : Buffer.alloc(expectedBytes.length);
  return timingSafeEqual(expectedBytes, comparableActual) && lengthMatches;
}

function integrationKeys(
  environment: ApiEnvironmentProvider,
): readonly { readonly keyId: string; readonly secret: string }[] {
  const currentSecret = environment.GOOGLE_FORM_CURRENT_SECRET;
  if (!currentSecret) {
    throw new ApiProblemException({
      status: 503,
      code: 'INTEGRATION_CONFIGURATION_UNAVAILABLE',
      title: 'Integration unavailable',
      detail: 'The integration source is not configured.',
    });
  }
  const keys = [{ keyId: environment.GOOGLE_FORM_CURRENT_KEY_ID, secret: currentSecret }];
  if (environment.GOOGLE_FORM_PREVIOUS_KEY_ID && environment.GOOGLE_FORM_PREVIOUS_SECRET) {
    keys.push({
      keyId: environment.GOOGLE_FORM_PREVIOUS_KEY_ID,
      secret: environment.GOOGLE_FORM_PREVIOUS_SECRET,
    });
  }
  return keys;
}

function parseHeader<T>(
  schema: {
    readonly safeParse: (value: unknown) => { success: true; data: T } | { success: false };
  },
  value: unknown,
): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw integrationAuthProblem(
    'INTEGRATION_AUTH_HEADERS_INVALID',
    'Required integration authentication headers are missing or invalid.',
  );
}

function integrationAuthProblem(code: string, detail: string): ApiProblemException {
  return new ApiProblemException({
    status: 401,
    code,
    title: 'Integration authentication failed',
    detail,
  });
}
