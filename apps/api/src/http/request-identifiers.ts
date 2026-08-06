import { randomUUID } from 'node:crypto';

import { isValidCorrelationId } from '@pitstop/config/security';
import type { FastifyRequest } from 'fastify';

const REQUEST_IDENTIFIER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._:-]{0,127})$/;

export function validRequestIdentifier(value: unknown): value is string {
  return typeof value === 'string' && REQUEST_IDENTIFIER_PATTERN.test(value);
}

export function resolveRequestIdentifier(value: unknown): string {
  return validRequestIdentifier(value) ? value : randomUUID();
}

export function resolveCorrelationIdentifier(value: unknown, requestId?: string): string {
  if (isValidCorrelationId(value)) return value;
  if (isValidCorrelationId(requestId)) return requestId;
  return randomUUID();
}

export function correlationIdForRequest(request: FastifyRequest): string {
  return resolveCorrelationIdentifier(request.headers['x-correlation-id'], request.id);
}
