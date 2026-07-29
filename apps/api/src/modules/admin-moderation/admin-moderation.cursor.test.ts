import { describe, expect, it } from 'vitest';

import type { ApiProblemException } from '../../common/errors/api-problem.exception';
import { decodeAdminQueueCursor, encodeAdminQueueCursor } from './admin-moderation.cursor';

const secret = 'phase-eight-cursor-secret-with-at-least-32-bytes';
const cursor = {
  id: '01K00000000000000000000001',
  sort: 'SUBMITTED_DESC' as const,
  submittedAt: '2026-07-29T01:00:00.000Z',
  version: 1 as const,
};

describe('admin moderation cursor', () => {
  it('round-trips a signed cursor bound to its sort order', () => {
    const encoded = encodeAdminQueueCursor(cursor, secret);
    expect(decodeAdminQueueCursor(encoded, 'SUBMITTED_DESC', secret)).toEqual(cursor);
  });

  it('rejects tampering, a different secret, and a different sort order', () => {
    const encoded = encodeAdminQueueCursor(cursor, secret);
    const candidates = [
      `${encoded.slice(0, -1)}x`,
      encodeAdminQueueCursor(cursor, `${secret}-different`),
    ];
    for (const candidate of candidates) {
      expect(() => decodeAdminQueueCursor(candidate, 'SUBMITTED_DESC', secret)).toThrow();
    }
    try {
      decodeAdminQueueCursor(encoded, 'SUBMITTED_ASC', secret);
      throw new Error('Expected the cursor sort mismatch to fail');
    } catch (error) {
      expect((error as ApiProblemException).getStatus()).toBe(400);
    }
  });
});
