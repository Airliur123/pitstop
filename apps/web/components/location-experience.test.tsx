import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type LocationController, useLocation } from '../hooks/use-location';
import type { LocationState } from '../lib/location';
import { LocationExperience } from './location-experience';

vi.mock('../hooks/use-location', () => ({ useLocation: vi.fn() }));

function controller(state: LocationState): LocationController {
  return {
    activeLocation:
      state.status === 'CURRENT_LOCATION_ACTIVE' || state.status === 'MANUAL_LOCATION_ACTIVE'
        ? state
        : null,
    activateManualLocation: vi.fn(),
    openManualLocation: vi.fn(),
    requestCurrentLocation: vi.fn(),
    resetLocation: vi.fn(),
    retryCurrentLocation: vi.fn(),
    setManualLocationInvalid: vi.fn(),
    state,
  };
}

describe('LocationExperience', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    [
      'location unavailable',
      { attemptId: 1, occurredAt: 100, status: 'LOCATION_UNAVAILABLE' } as const,
      'Lokasi tidak tersedia',
      /Perangkat tidak dapat menentukan lokasi/,
    ],
    [
      'location timeout',
      { attemptId: 1, occurredAt: 100, status: 'LOCATION_TIMEOUT' } as const,
      'Pencarian lokasi terlalu lama',
      /batas waktu/,
    ],
  ])('renders a distinct terminal state for %s', (_label, state, heading, description) => {
    vi.mocked(useLocation).mockReturnValue(controller(state));

    render(<LocationExperience />);

    expect(screen.getByRole('heading', { name: heading })).toBeVisible();
    expect(screen.getByText(description)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Coba lagi' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Pilih area manual' })).toBeVisible();
  });

  it('supports keyboard-friendly deterministic manual selection', () => {
    const location = controller({ status: 'MANUAL_LOCATION' });
    vi.mocked(useLocation).mockReturnValue(location);

    render(<LocationExperience />);

    const input = screen.getByRole('searchbox', { name: 'Cari area atau kecamatan' });
    expect(input).toHaveFocus();
    expect(screen.getByRole('button', { name: /Tambora.*Jakarta Barat/ })).toBeVisible();
    const kalideres = screen.getByRole('button', { name: /Kalideres.*Jakarta Barat/ });
    fireEvent.click(kalideres);
    expect(kalideres).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Gunakan area ini' }));

    expect(location.activateManualLocation).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'kalideres-jakarta-barat',
        latitude: -6.138,
        longitude: 106.703,
      }),
    );
  });

  it('does not resolve empty input and routes explicit invalid search to the typed invalid state', async () => {
    const location = controller({ status: 'MANUAL_LOCATION' });
    vi.mocked(useLocation).mockReturnValue(location);

    render(<LocationExperience />);

    const search = screen.getByRole('searchbox', { name: 'Cari area atau kecamatan' });
    const submit = screen.getByRole('button', { name: 'Cari area' });
    expect(submit).toBeDisabled();
    expect(location.setManualLocationInvalid).not.toHaveBeenCalled();

    fireEvent.change(search, { target: { value: 'Jakarta' } });
    fireEvent.click(submit);

    await waitFor(() =>
      expect(location.setManualLocationInvalid).toHaveBeenCalledWith('TOO_BROAD', 'Jakarta'),
    );
    expect(location.activateManualLocation).not.toHaveBeenCalled();
  });

  it('focuses the official invalid heading and returns both actions to manual location', () => {
    const location = controller({
      query: 'Jakarta',
      reason: 'TOO_BROAD',
      status: 'MANUAL_LOCATION_INVALID',
    });
    vi.mocked(useLocation).mockReturnValue(location);

    render(<LocationExperience />);

    const heading = screen.getByRole('heading', { name: 'Lokasi tidak ditemukan.' });
    expect(heading).toHaveFocus();
    expect(
      screen.getByText('Alamat terlalu umum atau tidak valid. Periksa kembali lalu coba lagi.'),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Ubah lokasi' }));
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(location.openManualLocation).toHaveBeenCalledTimes(2);
    expect(location.activeLocation).toBeNull();
  });
});
