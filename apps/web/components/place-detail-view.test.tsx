import type { ApiSuccess, PlaceDetailMeta, PublicPlaceDetail, RequestId } from '@pitstop/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getPlaceDetail } from '../lib/api/client';
import { PlaceDetailView } from './place-detail-view';

vi.mock('../lib/api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/api/client')>();
  return { ...original, getPlaceDetail: vi.fn() };
});
vi.mock('./auth-provider', () => ({
  useAuth: () => ({
    error: null,
    isLoggingOut: false,
    logout: vi.fn(),
    refresh: vi.fn(),
    session: { authenticated: false },
    status: 'unauthenticated',
  }),
}));

const requestId = 'detail-component-request' as RequestId;
const place: PublicPlaceDetail = {
  address: 'Jl. Uji 1',
  categories: [
    {
      code: 'TOILET',
      id: 'category-toilet',
      isPrimary: true,
      name: 'Toilet',
    },
  ],
  city: 'Jakarta',
  dataFreshnessAt: '2026-07-26T00:00:00.000Z',
  description: null,
  district: 'Menteng',
  facilities: [],
  id: 'place-1',
  version: 1,
  landmark: null,
  latitude: -6.123456,
  longitude: 106.812345,
  menus: [],
  name: 'Tempat Uji',
  operatingHourExceptions: [],
  operatingHours: [],
  photos: { available: false, count: 0 },
  placeStatus: 'ACTIVE',
  postalCode: null,
  province: 'DKI Jakarta',
  slug: 'tempat-uji',
  verificationStatus: 'ADMIN_VERIFIED',
  verifiedAt: '2026-07-25T00:00:00.000Z',
};
const response: ApiSuccess<PublicPlaceDetail, PlaceDetailMeta> = {
  data: place,
  meta: {
    cache: 'MISS',
    generatedAt: '2026-07-26T00:00:00.000Z',
    requestId,
  },
  requestId,
  success: true,
};

function TestQueryProvider({ children }: Readonly<{ children: ReactNode }>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

describe('PlaceDetailView directions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPlaceDetail).mockResolvedValue(response);
  });

  it('opens verified destination directions in a safe external tab', async () => {
    render(<PlaceDetailView slug="tempat-uji" />, { wrapper: TestQueryProvider });

    const link = await screen.findByRole(
      'link',
      {
        name: 'Arahkan ke Tempat Uji di Google Maps (buka tab baru)',
      },
      { timeout: 3_000 },
    );
    expect(link).toHaveTextContent('Arahkan Sekarang');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');

    const url = new URL(link.getAttribute('href') ?? '');
    expect(url.protocol).toBe('https:');
    expect(url.pathname).toBe('/maps/dir/');
    expect(url.searchParams.get('destination')).toBe('-6.123456,106.812345');
    expect(url.searchParams.has('origin')).toBe(false);
  });
});
