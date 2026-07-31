import type { ApiSuccess, PlaceConfirmationDetail, PublicPlaceDetail } from '@pitstop/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { confirmPlace } from '../lib/api/client';
import { PlaceGovernanceActions } from './place-governance-actions';

const mocks = vi.hoisted(() => ({
  auth: {
    error: null,
    isLoggingOut: false,
    logout: vi.fn(),
    refresh: vi.fn(),
    session: {
      authenticated: true as const,
      user: {
        email: 'us***@example.test',
        id: '01K00000000000000000000001',
        role: 'USER' as const,
      },
    },
    status: 'authenticated' as const,
  },
}));

vi.mock('./auth-provider', () => ({ useAuth: () => mocks.auth }));
vi.mock('../lib/api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/api/client')>();
  return { ...original, confirmPlace: vi.fn() };
});

const place: PublicPlaceDetail = {
  address: 'Jl. Data Simulasi',
  categories: [],
  city: 'Jakarta',
  dataFreshnessAt: '2026-07-30T00:00:00.000Z',
  description: null,
  district: 'Menteng',
  facilities: [],
  id: '01K00000000000000000000002',
  landmark: null,
  latitude: -6.2,
  longitude: 106.8,
  menus: [],
  name: 'Place Uji',
  operatingHourExceptions: [],
  operatingHours: [],
  photos: { available: false, count: 0 },
  placeStatus: 'ACTIVE',
  postalCode: null,
  province: 'DKI Jakarta',
  slug: 'place-uji',
  verificationStatus: 'ADMIN_VERIFIED',
  verifiedAt: '2026-07-29T00:00:00.000Z',
  version: 7,
};

function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe('PlaceGovernanceActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const detail: PlaceConfirmationDetail = {
      confirmedAt: '2026-07-30T00:00:00.000Z',
      confirmationType: 'STILL_VALID',
      expiresAt: '2026-10-28T00:00:00.000Z',
      id: '01K00000000000000000000003',
      note: null,
      place: {
        address: place.address,
        id: place.id,
        name: place.name,
        slug: place.slug,
        verificationStatus: 'ADMIN_VERIFIED',
        version: 7,
      },
      replayed: false,
      verificationStatus: 'ADMIN_VERIFIED',
    };
    vi.mocked(confirmPlace).mockResolvedValue({
      data: detail,
      meta: { generatedAt: detail.confirmedAt, requestId: 'request-confirm' },
      requestId: 'request-confirm',
      success: true,
    } as ApiSuccess<PlaceConfirmationDetail>);
  });

  it('sends an idempotent confirmation without GPS and links the structured report flow', async () => {
    render(<PlaceGovernanceActions place={place} />, { wrapper: Wrapper });
    expect(screen.getByRole('link', { name: 'Laporkan perubahan' })).toHaveAttribute(
      'href',
      '/places/place-uji/report',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Informasi masih akurat' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Simpan konfirmasi' }));
    await waitFor(() => expect(confirmPlace).toHaveBeenCalledOnce());
    expect(confirmPlace).toHaveBeenCalledWith(
      place.id,
      expect.objectContaining({
        confirmationType: 'STILL_VALID',
        expectedPlaceVersion: 7,
      }),
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
    expect(vi.mocked(confirmPlace).mock.calls[0]?.[1]).not.toHaveProperty('latitude');
    expect(await screen.findByText('Konfirmasi tersimpan')).toBeVisible();
  });
});
