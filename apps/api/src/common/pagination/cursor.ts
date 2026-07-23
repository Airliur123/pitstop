import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import type { CursorPayload, PublicPlaceSort } from '@pitstop/contracts';

import { ApiProblemException } from '../errors/api-problem.exception';

const ulidPattern = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const base64UrlPattern = /^[A-Za-z0-9_-]+$/;
const queryHashPattern = /^[A-Za-z0-9_-]{43}$/;
const signatureLength = 43;
let developmentSigningSecret: Buffer | undefined;

export interface CursorQueryFingerprintInput {
  readonly latitude: number;
  readonly longitude: number;
  readonly radiusMeters: number;
  readonly category: string | null;
  readonly budgetAmount: number | null;
  readonly budgetApplied: boolean;
  readonly sort: PublicPlaceSort;
}

export function createCursorQueryHash(input: CursorQueryFingerprintInput): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        latitude: normalizeNumber(input.latitude),
        longitude: normalizeNumber(input.longitude),
        radiusMeters: normalizeNumber(input.radiusMeters),
        category: input.category,
        budgetAmount: input.budgetAmount === null ? null : normalizeNumber(input.budgetAmount),
        budgetApplied: input.budgetApplied,
        sort: input.sort,
      }),
    )
    .digest('base64url');
}

export function encodeCursor(payload: CursorPayload, signingSecret: string | undefined): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = sign(encodedPayload, signingSecret).toString('base64url');
  return `${encodedPayload}.${signature}`;
}

export function decodeCursor(
  cursor: string,
  expectedSort: PublicPlaceSort,
  expectedQueryHash: string,
  signingSecret: string | undefined,
): CursorPayload {
  try {
    const [encodedPayload, encodedSignature, extra] = cursor.split('.');
    if (
      !encodedPayload ||
      !encodedSignature ||
      extra !== undefined ||
      cursor.length > 1_024 ||
      !base64UrlPattern.test(encodedPayload) ||
      !base64UrlPattern.test(encodedSignature) ||
      encodedSignature.length !== signatureLength
    ) {
      throw new Error('invalid cursor encoding');
    }
    const signature = Buffer.from(encodedSignature, 'base64url');
    const expectedSignature = sign(encodedPayload, signingSecret);
    if (
      signature.length !== expectedSignature.length ||
      !timingSafeEqual(signature, expectedSignature)
    ) {
      throw new Error('invalid cursor signature');
    }
    const value = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as unknown;
    if (
      !isCursorPayload(value) ||
      value.sort !== expectedSort ||
      value.queryHash !== expectedQueryHash
    ) {
      throw new Error('invalid cursor payload');
    }
    return value;
  } catch {
    throw new ApiProblemException({
      status: 400,
      code: 'INVALID_CURSOR',
      title: 'Invalid cursor',
      detail: 'The pagination cursor is malformed or does not match the selected sort.',
    });
  }
}

function isCursorPayload(value: unknown): value is CursorPayload {
  if (typeof value !== 'object' || value === null) return false;
  const cursor = value as Record<string, unknown>;
  return (
    cursor.version === 2 &&
    typeof cursor.queryHash === 'string' &&
    queryHashPattern.test(cursor.queryHash) &&
    (cursor.sort === 'NEAREST' || cursor.sort === 'CHEAPEST' || cursor.sort === 'FRESHEST') &&
    typeof cursor.id === 'string' &&
    ulidPattern.test(cursor.id) &&
    typeof cursor.distanceMeters === 'number' &&
    Number.isFinite(cursor.distanceMeters) &&
    cursor.distanceMeters >= 0 &&
    (cursor.priceAmount === null ||
      (typeof cursor.priceAmount === 'number' &&
        Number.isInteger(cursor.priceAmount) &&
        cursor.priceAmount >= 0)) &&
    typeof cursor.dataFreshnessAt === 'string' &&
    !Number.isNaN(Date.parse(cursor.dataFreshnessAt))
  );
}

function sign(encodedPayload: string, signingSecret: string | undefined): Buffer {
  return createHmac('sha256', resolveSigningSecret(signingSecret)).update(encodedPayload).digest();
}

function resolveSigningSecret(signingSecret: string | undefined): Buffer {
  if (signingSecret !== undefined) return Buffer.from(signingSecret, 'utf8');
  developmentSigningSecret ??= randomBytes(32);
  return developmentSigningSecret;
}

function normalizeNumber(value: number): number {
  if (!Number.isFinite(value)) throw new TypeError('Cursor query contains a non-finite number');
  return Object.is(value, -0) ? 0 : value;
}
