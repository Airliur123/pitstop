import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import type { AdminContributionSort } from '@pitstop/contracts';

import { ApiProblemException } from '../../common/errors/api-problem.exception';

export interface AdminQueueCursor {
  readonly id: string;
  readonly sort: AdminContributionSort;
  readonly submittedAt: string;
  readonly version: 1;
}

const ephemeralCursorSecret = randomBytes(32).toString('base64url');

export function encodeAdminQueueCursor(
  cursor: AdminQueueCursor,
  secret: string | undefined,
): string {
  const payload = Buffer.from(JSON.stringify(cursor)).toString('base64url');
  const signature = sign(payload, secret);
  return `${payload}.${signature}`;
}

export function decodeAdminQueueCursor(
  value: string,
  expectedSort: AdminContributionSort,
  secret: string | undefined,
): AdminQueueCursor {
  const [payload, providedSignature, extra] = value.split('.');
  if (!payload || !providedSignature || extra !== undefined) throw invalidCursor();
  const expectedSignature = sign(payload, secret);
  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw invalidCursor();
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Reflect.get(parsed, 'version') !== 1 ||
      Reflect.get(parsed, 'sort') !== expectedSort ||
      typeof Reflect.get(parsed, 'submittedAt') !== 'string' ||
      Number.isNaN(Date.parse(Reflect.get(parsed, 'submittedAt'))) ||
      typeof Reflect.get(parsed, 'id') !== 'string' ||
      Reflect.get(parsed, 'id').length !== 26
    ) {
      throw invalidCursor();
    }
    return parsed as AdminQueueCursor;
  } catch (error) {
    if (error instanceof ApiProblemException) throw error;
    throw invalidCursor();
  }
}

function sign(payload: string, secret: string | undefined): string {
  return createHmac('sha256', secret ?? ephemeralCursorSecret)
    .update(payload)
    .digest('base64url');
}

function invalidCursor(): ApiProblemException {
  return new ApiProblemException({
    status: 400,
    code: 'INVALID_CURSOR',
    title: 'Invalid moderation cursor',
    detail: 'The moderation cursor is invalid or no longer matches this sort order.',
  });
}
