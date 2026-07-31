import { describe, expect, it } from 'vitest';

import { ApiProblemException } from '../../common/errors/api-problem.exception';
import { decodeReportsCursor, encodeReportsCursor } from './reports.cursor';

describe('Phase 10 signed cursors', () => {
  it('round-trips the stable activity cursor and rejects tampering or kind reuse', () => {
    const secret = 'phase-10-cursor-secret';
    const encoded = encodeReportsCursor(
      {
        id: '01K00000000000000000000000',
        kind: 'ACTIVITY',
        timestamp: '2026-07-30T00:00:00.000Z',
        type: 'REPORT',
        version: 1,
      },
      secret,
    );
    expect(decodeReportsCursor(encoded, { kind: 'ACTIVITY' }, secret)).toMatchObject({
      kind: 'ACTIVITY',
      type: 'REPORT',
    });
    expect(() => decodeReportsCursor(`${encoded}x`, { kind: 'ACTIVITY' }, secret)).toThrow(
      ApiProblemException,
    );
    expect(() => decodeReportsCursor(encoded, { kind: 'ADMIN_AUDIT' }, secret)).toThrow(
      ApiProblemException,
    );
  });
});
