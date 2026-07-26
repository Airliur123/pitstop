import type {
  ApiSuccess,
  PublicPlaceListItem,
  PublicPlacesMeta,
  PublicRecommendation,
  RecommendationMeta,
  RecommendationResult,
  RequestId,
} from '@pitstop/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type LocationController, useLocation } from '../hooks/use-location';
import { getPlaces, getRecommendations } from '../lib/api/client';
import type { ActiveLocation } from '../lib/location';
import type { PlacesUrlState } from '../lib/url-state';
import { PlacesResults } from './places-results';
import type { ResultMapProps } from './result-map';

vi.mock('../hooks/use-location', () => ({ useLocation: vi.fn() }));
vi.mock('../lib/api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/api/client')>();
  return {
    ...original,
    getPlaces: vi.fn(),
    getRecommendations: vi.fn(),
  };
});
vi.mock('./result-map', () => ({
  ResultMap: (props: ResultMapProps) =>
    createElement(
      'section',
      {
        'aria-label': 'Mock peta hasil',
        'data-places': props.places.map((place) => place.name).join('|'),
        'data-selection-version': props.selectionVersion ?? 0,
      },
      createElement(
        'button',
        {
          onClick: () => props.onSelectPlace(props.places[0]?.id ?? ''),
          type: 'button',
        },
        'Pilih pin pertama',
      ),
      createElement(
        'button',
        {
          onClick: () => props.onError?.(new Error('Tile gagal')),
          type: 'button',
        },
        'Simulasikan error peta',
      ),
    ),
}));

const requestId = 'results-request' as RequestId;
const primaryCategory = {
  code: 'MAKAN_MURAH',
  id: 'makan',
  isPrimary: true,
  name: 'Makan Murah',
} as const;
const primary: PublicRecommendation = {
  address: 'Jl. Tambora',
  budgetMatch: true,
  categories: [primaryCategory],
  cheapestAvailableMainItem: { name: 'Nasi', priceAmount: 12_000 },
  cheapestQualifyingItem: { name: 'Nasi', priceAmount: 12_000 },
  dataFreshnessAt: '2026-07-26T00:00:00.000Z',
  distanceMeters: 250,
  facilitySummary: [],
  id: 'place-primary',
  landmark: null,
  latitude: -6.1468,
  longitude: 106.8061,
  name: 'Warung Utama',
  openStatus: 'OPEN',
  placeStatus: 'ACTIVE',
  primaryCategory,
  rankingReason: 'NEAREST_WITHIN_BUDGET',
  score: { budgetFit: 1, community: 0, distance: 1, freshness: 1, open: 1, total: 4 },
  shortDescription: null,
  slug: 'warung-utama',
  verificationStatus: 'ADMIN_VERIFIED',
};
const alternative: PublicRecommendation = {
  ...primary,
  distanceMeters: 700,
  id: 'place-alternative',
  name: 'Warung Alternatif',
  slug: 'warung-alternatif',
};
const response: ApiSuccess<RecommendationResult, RecommendationMeta> = {
  data: { alternatives: [alternative], primary },
  meta: {
    cache: 'MISS',
    fallback: null,
    generatedAt: '2026-07-26T00:00:00.000Z',
    query: {
      budgetAmount: 15_000,
      budgetApplied: true,
      category: 'MAKAN_MURAH',
      latitude: -6.1468,
      limit: 4,
      longitude: 106.8061,
      radiusMeters: 5_000,
    },
    requestId,
  },
  requestId,
  success: true,
};
const extraPlace: PublicPlaceListItem = {
  ...alternative,
  id: 'place-extra',
  name: 'Warung Hasil Lanjutan',
  slug: 'warung-hasil-lanjutan',
};
const placesResponse: ApiSuccess<readonly PublicPlaceListItem[], PublicPlacesMeta> = {
  data: [extraPlace],
  meta: {
    cache: 'BYPASS',
    generatedAt: '2026-07-26T00:00:00.000Z',
    pagination: { hasMore: false, nextCursor: null },
    query: {
      budgetAmount: 15_000,
      budgetApplied: true,
      category: 'MAKAN_MURAH',
      latitude: -6.1468,
      limit: 20,
      longitude: 106.8061,
      radiusMeters: 5_000,
      sort: 'NEAREST',
    },
    requestId,
  },
  requestId,
  success: true,
};
const activeLocation: ActiveLocation = {
  accuracy: 10,
  id: 'current-location',
  label: 'Lokasi saat ini',
  latitude: -6.1468,
  longitude: 106.8061,
  queryKey: ['location', 'CURRENT', -6.1468, 106.8061],
  source: 'CURRENT',
  status: 'CURRENT_LOCATION_ACTIVE',
  timestamp: 100,
};

function controller(state: LocationController['state'] = activeLocation): LocationController {
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

const listState: PlacesUrlState = {
  budgetAmount: 15_000,
  category: 'MAKAN_MURAH',
  sort: 'NEAREST',
  view: 'LIST',
};

function TestQueryProvider({ children }: Readonly<{ children: ReactNode }>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderResults(state: PlacesUrlState = listState) {
  return render(<PlacesResults state={state} />, { wrapper: TestQueryProvider });
}

describe('PlacesResults Phase 5 integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useLocation).mockReturnValue(controller());
    vi.mocked(getRecommendations).mockResolvedValue(response);
    vi.mocked(getPlaces).mockRejectedValue(new Error('not requested'));
  });

  it('does not request results without active location', () => {
    vi.mocked(useLocation).mockReturnValue(controller({ status: 'PERMISSION_NOT_REQUESTED' }));

    renderResults();

    expect(screen.getByRole('heading', { name: 'Lokasi belum aktif' })).toBeVisible();
    expect(getRecommendations).not.toHaveBeenCalled();
  });

  it('rejects invalid URL budget before the recommendation boundary', () => {
    renderResults({ ...listState, budgetAmount: null });

    expect(screen.getByRole('heading', { name: 'Pilih preset budget' })).toBeVisible();
    expect(getRecommendations).not.toHaveBeenCalled();
  });

  it('requests the active context and explains the normal radius', async () => {
    renderResults();

    expect(screen.getByText(/≤ Rp15\.000 · Radius 5 km/)).toBeVisible();
    await waitFor(() =>
      expect(getRecommendations).toHaveBeenCalledWith(
        {
          budgetAmount: 15_000,
          category: 'MAKAN_MURAH',
          latitude: -6.1468,
          limit: 4,
          longitude: 106.8061,
        },
        expect.any(AbortSignal),
      ),
    );
    expect(await screen.findByRole('heading', { name: 'Warung Utama' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Warung Alternatif' })).toBeVisible();
  });

  it('preserves safe filters through list/map links and keeps the same accessible dataset', async () => {
    const rendered = renderResults();
    const mapLink = await screen.findByRole('link', { name: 'Peta' });
    expect(mapLink).toHaveAttribute(
      'href',
      '/places?category=MAKAN_MURAH&sort=NEAREST&budget=15000&view=map',
    );
    expect(mapLink.getAttribute('href')).not.toMatch(/latitude|longitude|-6\.1468|106\.8061/);

    rendered.rerender(<PlacesResults state={{ ...listState, view: 'MAP' }} />);

    const map = await screen.findByRole('region', { name: 'Mock peta hasil' });
    expect(map).toHaveAttribute('data-places', 'Warung Utama|Warung Alternatif');
    expect(
      screen.getByRole('heading', { name: 'Daftar hasil yang ditampilkan di peta' }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Warung Utama' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Warung Alternatif' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Daftar' })).toHaveAttribute(
      'href',
      '/places?category=MAKAN_MURAH&sort=NEAREST&budget=15000',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Pilih pin pertama' }));
    expect(screen.getByRole('button', { name: 'Tampilkan Warung Utama di peta' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(map).toHaveAttribute('data-selection-version', '1');

    fireEvent.click(screen.getByRole('button', { name: 'Tampilkan Warung Utama di peta' }));
    expect(map).toHaveAttribute('data-selection-version', '2');
    fireEvent.click(screen.getByRole('button', { name: 'Tampilkan Warung Utama di peta' }));
    expect(map).toHaveAttribute('data-selection-version', '3');

    expect(screen.getAllByRole('link', { name: 'Detail' })[0]).toHaveAttribute(
      'href',
      '/places/warung-utama',
    );
  });

  it('merges loaded pages with the recommendation dataset before switching to the map', async () => {
    vi.mocked(getPlaces).mockResolvedValue(placesResponse);
    const rendered = renderResults();

    fireEvent.click(await screen.findByRole('button', { name: 'Lihat semua' }));
    expect(await screen.findByRole('heading', { name: 'Warung Hasil Lanjutan' })).toBeVisible();

    rendered.rerender(<PlacesResults state={{ ...listState, view: 'MAP' }} />);

    expect(await screen.findByRole('region', { name: 'Mock peta hasil' })).toHaveAttribute(
      'data-places',
      'Warung Utama|Warung Alternatif|Warung Hasil Lanjutan',
    );
  });

  it('keeps the accessible result list when the map reports an error', async () => {
    renderResults({ ...listState, view: 'MAP' });

    fireEvent.click(await screen.findByRole('button', { name: 'Simulasikan error peta' }));

    expect(
      screen.getByText('Peta mengalami kendala. Daftar hasil tetap dapat digunakan.'),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Warung Utama' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Warung Alternatif' })).toBeVisible();
  });

  it('never mixes an outside-radius candidate into normal list/map results', async () => {
    vi.mocked(getRecommendations).mockResolvedValue({
      ...response,
      data: { alternatives: [], primary: null },
      meta: {
        ...response.meta,
        fallback: {
          nearestDistanceMeters: 7_400,
          nearestPlace: {
            distanceMeters: 7_400,
            id: primary.id,
            name: primary.name,
            primaryCategory,
            slug: primary.slug,
          },
          reason: 'OUTSIDE_RADIUS',
        },
      },
    });

    renderResults();

    expect(
      await screen.findByRole('heading', {
        name: 'Belum ada tempat sesuai dalam radius 5 km',
      }),
    ).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Warung Utama' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Peta' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lihat kandidat di luar radius' })).toHaveAttribute(
      'href',
      '/places/warung-utama',
    );
  });
});
