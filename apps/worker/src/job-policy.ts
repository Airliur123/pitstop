import { GeocodingProviderError } from './geocoding.adapters';

export const integrationJobPolicy = {
  attempts: 5,
  backoff: { delay: 1_000, type: 'exponential' as const },
  removeOnComplete: true,
  removeOnFail: true,
} as const;

export type SafeErrorClassification = {
  readonly code: string;
  readonly errorClass:
    'PERMANENT_VALIDATION' | 'RETRYABLE_DATABASE' | 'RETRYABLE_PROVIDER' | 'UNKNOWN';
  readonly retryable: boolean;
};

export function classifyWorkerError(error: unknown): SafeErrorClassification {
  if (error instanceof GeocodingProviderError) {
    return {
      code: error.code,
      errorClass: error.retryable ? 'RETRYABLE_PROVIDER' : 'PERMANENT_VALIDATION',
      retryable: error.retryable,
    };
  }
  if (error instanceof PermanentWorkerError) {
    return { code: error.code, errorClass: 'PERMANENT_VALIDATION', retryable: false };
  }
  const code = externalErrorCode(error);
  if (
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'PROTOCOL_CONNECTION_LOST' ||
    code === 'ER_LOCK_DEADLOCK' ||
    code === 'ER_LOCK_WAIT_TIMEOUT'
  ) {
    return { code, errorClass: 'RETRYABLE_DATABASE', retryable: true };
  }
  return { code: code ?? 'UNEXPECTED_WORKER_ERROR', errorClass: 'UNKNOWN', retryable: true };
}

export class PermanentWorkerError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'PermanentWorkerError';
  }
}

function externalErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const code = Reflect.get(error, 'code');
  return typeof code === 'string' ? code : undefined;
}
