import { describe, expect, it } from 'vitest';

import type { ApiSuccess, LiveHealthResponse, RequestId } from './index';

describe('shared contracts', () => {
  it('supports a typed live-health success envelope', () => {
    const health: LiveHealthResponse = { status: 'ok', service: 'pitstop-api' };
    const envelope: ApiSuccess<LiveHealthResponse> = {
      success: true,
      data: health,
      requestId: 'test-request' as RequestId,
      meta: {
        generatedAt: '2026-07-23T00:00:00.000Z',
        requestId: 'test-request' as RequestId,
      },
    };

    expect(envelope.data).toEqual(health);
    expect(envelope.success).toBe(true);
  });
});
