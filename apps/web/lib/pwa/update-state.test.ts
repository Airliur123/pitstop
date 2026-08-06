import { describe, expect, it } from 'vitest';

import { reducePwaUpdateStatus, shouldReloadForControllerChange } from './update-state';

describe('service-worker update state', () => {
  it('requires an available update before applying it', () => {
    expect(reducePwaUpdateStatus('idle', { type: 'APPLY' })).toBe('idle');
    expect(reducePwaUpdateStatus('idle', { type: 'AVAILABLE' })).toBe('available');
    expect(reducePwaUpdateStatus('available', { type: 'APPLY' })).toBe('applying');
    expect(reducePwaUpdateStatus('applying', { type: 'FAILED' })).toBe('failed');
    expect(reducePwaUpdateStatus('failed', { type: 'APPLY' })).toBe('applying');
  });

  it('reloads only after user-requested activation and never loops', () => {
    expect(shouldReloadForControllerChange(false, false)).toBe(false);
    expect(shouldReloadForControllerChange(true, false)).toBe(true);
    expect(shouldReloadForControllerChange(true, true)).toBe(false);
  });
});
