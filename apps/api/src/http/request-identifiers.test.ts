import { describe, expect, it } from 'vitest';

import {
  resolveCorrelationIdentifier,
  resolveRequestIdentifier,
  validRequestIdentifier,
} from './request-identifiers';

describe('request identifiers', () => {
  it('accepts bounded transport-safe identifiers', () => {
    expect(validRequestIdentifier('browser:trace-01.part')).toBe(true);
    expect(resolveRequestIdentifier('browser:trace-01.part')).toBe('browser:trace-01.part');
  });

  it('replaces empty, oversized, or injection-shaped identifiers', () => {
    for (const value of ['', `x${'a'.repeat(128)}`, 'line\r\nset-cookie: stolen', ['array']]) {
      const replacement = resolveRequestIdentifier(value);
      expect(replacement).toMatch(/^[0-9a-f-]{36}$/);
      expect(replacement).not.toEqual(value);
    }
  });

  it('bounds correlation IDs independently from legacy request IDs', () => {
    expect(resolveCorrelationIdentifier('browser-trace_01')).toBe('browser-trace_01');
    expect(resolveCorrelationIdentifier('colon:not-allowed', 'safe-request')).toBe('safe-request');
    expect(resolveCorrelationIdentifier('x'.repeat(65), 'request:legacy')).toMatch(
      /^[0-9a-f-]{36}$/,
    );
  });
});
