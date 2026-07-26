import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useLocation } from '../hooks/use-location';
import { ApiClientValidationError, ApiProblem } from '../lib/api/client';
import { Providers, shouldRetry } from './providers';

function LocationStatusProbe() {
  const location = useLocation();
  return <output>{location.state.status}</output>;
}

describe('Providers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('provides the memory-only location controller below TanStack Query', () => {
    vi.stubEnv('NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_ENABLED', 'false');

    render(
      <Providers>
        <LocationStatusProbe />
      </Providers>,
    );

    expect(screen.getByText('PERMISSION_NOT_REQUESTED')).toBeVisible();
    expect(window.localStorage).toHaveLength(0);
    expect(window.sessionStorage).toHaveLength(0);
  });

  it('never retries client validation errors', () => {
    expect(shouldRetry(0, new ApiClientValidationError('MAKAN_MURAH'))).toBe(false);
    expect(shouldRetry(0, new ApiProblem('Invalid request', 400, 'INVALID', null))).toBe(false);
    expect(shouldRetry(0, new ApiProblem('Server error', 500, 'SERVER', null))).toBe(true);
    expect(shouldRetry(2, new TypeError('offline'))).toBe(false);
  });
});
