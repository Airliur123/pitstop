import type {
  ApiSuccess,
  CategoriesMeta,
  PublicCategory,
  PublicRecommendation,
  RecommendationMeta,
  RecommendationResult,
  RequestId,
} from '@pitstop/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type LocationController, useLocation } from '../hooks/use-location';
import { getCategories, getRecommendations } from '../lib/api/client';
import type { ActiveLocation } from '../lib/location';
import { GUEST_PREFERENCES_STORAGE_KEY } from '../lib/preferences';
import { GuestHome } from './guest-home';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('../lib/api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/api/client')>();
  return { ...original, getCategories: vi.fn(), getRecommendations: vi.fn() };
});
vi.mock('../hooks/use-location', () => ({ useLocation: vi.fn() }));

const requestId = 'component-request' as RequestId;
const categories: readonly PublicCategory[] = [
  {
    code: 'MAKAN_MURAH',
    description: null,
    id: 'makan',
    isPrimary: true,
    name: 'Makan Murah',
    sortOrder: 1,
    supportsBudget: true,
  },
  {
    code: 'NGOPI',
    description: null,
    id: 'ngopi',
    isPrimary: false,
    name: 'Ngopi',
    sortOrder: 2,
    supportsBudget: true,
  },
  {
    code: 'TOILET',
    description: null,
    id: 'toilet',
    isPrimary: false,
    name: 'Toilet',
    sortOrder: 3,
    supportsBudget: false,
  },
  {
    code: 'MUSALA',
    description: null,
    id: 'musala',
    isPrimary: false,
    name: 'Musala',
    sortOrder: 4,
    supportsBudget: false,
  },
  {
    code: 'ISTIRAHAT',
    description: null,
    id: 'istirahat',
    isPrimary: false,
    name: 'Istirahat',
    sortOrder: 5,
    supportsBudget: false,
  },
];
const categoriesResponse: ApiSuccess<readonly PublicCategory[], CategoriesMeta> = {
  data: categories,
  meta: {
    cache: 'MISS',
    generatedAt: '2026-07-24T00:00:00.000Z',
    requestId,
  },
  requestId,
  success: true,
};
const primaryCategory = {
  code: 'MAKAN_MURAH',
  id: 'makan',
  isPrimary: true,
  name: 'Makan Murah',
} as const;
const recommendation: PublicRecommendation = {
  address: 'Jl. Uji',
  budgetMatch: true,
  categories: [primaryCategory],
  cheapestAvailableMainItem: { name: 'Nasi', priceAmount: 12_000 },
  cheapestQualifyingItem: { name: 'Nasi', priceAmount: 12_000 },
  dataFreshnessAt: '2026-07-24T00:00:00.000Z',
  distanceMeters: 250,
  facilitySummary: [],
  id: 'place-primary',
  landmark: null,
  latitude: -6.1,
  longitude: 106.8,
  name: 'Tempat Utama',
  openStatus: 'OPEN',
  placeStatus: 'ACTIVE',
  primaryCategory,
  rankingReason: 'NEAREST_WITHIN_BUDGET',
  score: { budgetFit: 1, community: 0, distance: 1, freshness: 1, open: 1, total: 4 },
  shortDescription: null,
  slug: 'tempat-utama',
  verificationStatus: 'ADMIN_VERIFIED',
};
const recommendationResponse: ApiSuccess<RecommendationResult, RecommendationMeta> = {
  data: {
    alternatives: [
      { ...recommendation, id: 'alternative', name: 'Alternatif', slug: 'alternatif' },
    ],
    primary: recommendation,
  },
  meta: {
    cache: 'MISS',
    fallback: null,
    generatedAt: '2026-07-24T00:00:00.000Z',
    query: {
      budgetAmount: 15_000,
      budgetApplied: true,
      category: 'MAKAN_MURAH',
      latitude: -6.1,
      limit: 1,
      longitude: 106.8,
      radiusMeters: 5_000,
    },
    requestId,
  },
  requestId,
  success: true,
};

const currentLocation: ActiveLocation = {
  accuracy: 12,
  id: 'current-location',
  label: 'Lokasi saat ini',
  latitude: -6.1,
  longitude: 106.8,
  queryKey: ['location', 'CURRENT', -6.1, 106.8],
  source: 'CURRENT',
  status: 'CURRENT_LOCATION_ACTIVE',
  timestamp: 100,
};

function locationController(
  state: LocationController['state'] = currentLocation,
): LocationController {
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

function TestQueryProvider({ children }: Readonly<{ children: ReactNode }>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

function renderHome() {
  return render(createElement(GuestHome), { wrapper: TestQueryProvider });
}

describe('GuestHome Phase 5 location integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(useLocation).mockReturnValue(locationController());
    vi.mocked(getCategories).mockResolvedValue(categoriesResponse);
    vi.mocked(getRecommendations).mockResolvedValue(recommendationResponse);
  });

  it('does not request a recommendation or permission before explicit location action', async () => {
    const controller = locationController({ status: 'PERMISSION_NOT_REQUESTED' });
    vi.mocked(useLocation).mockReturnValue(controller);

    renderHome();

    expect(await screen.findByRole('heading', { name: 'Lokasi belum aktif' })).toBeVisible();
    expect(getRecommendations).not.toHaveBeenCalled();
    expect(controller.requestCurrentLocation).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Gunakan lokasi saya' }));
    expect(controller.requestCurrentLocation).toHaveBeenCalledOnce();
  });

  it('shows a stopped denied state with retry and manual actions', () => {
    const controller = locationController({
      attemptId: 1,
      occurredAt: 100,
      status: 'PERMISSION_DENIED',
    });
    vi.mocked(useLocation).mockReturnValue(controller);

    renderHome();

    expect(screen.getByText(/Izin lokasi ditolak/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pilih area manual' }));
    expect(controller.retryCurrentLocation).toHaveBeenCalledOnce();
    expect(controller.openManualLocation).toHaveBeenCalledOnce();
    expect(getRecommendations).not.toHaveBeenCalled();
  });

  it('uses active browser coordinates, fixed radius copy, and only one preview card', async () => {
    renderHome();

    expect(await screen.findByText('Pencarian normal selalu dibatasi radius 5 km.')).toBeVisible();
    await waitFor(() =>
      expect(getRecommendations).toHaveBeenCalledWith(
        expect.objectContaining({
          budgetAmount: 15_000,
          category: 'MAKAN_MURAH',
          latitude: -6.1,
          longitude: 106.8,
        }),
        expect.any(AbortSignal),
      ),
    );
    expect(await screen.findByRole('heading', { name: 'Tempat Utama' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Alternatif' })).not.toBeInTheDocument();
  });

  it('keeps exactly four official budget presets and serializes only safe public state', async () => {
    renderHome();

    fireEvent.click(await screen.findByRole('button', { name: /Ubah budget/ }));
    expect(
      screen.getAllByRole('button', { name: /^≤ Rp/ }).map((button) => button.textContent),
    ).toEqual(['≤ Rp10.000', '≤ Rp15.000', '≤ Rp20.000', '≤ Rp25.000']);

    fireEvent.click(screen.getByRole('button', { name: '≤ Rp20.000' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tutup lembar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cari Sekarang' }));

    expect(push).toHaveBeenLastCalledWith('/places?category=MAKAN_MURAH&sort=NEAREST&budget=20000');
    expect(String(push.mock.calls.at(-1)?.[0])).not.toMatch(/latitude|longitude|-6\.1|106\.8/);
  });

  it('keeps a budget stored but excludes it for a non-budget category', async () => {
    window.localStorage.setItem(
      GUEST_PREFERENCES_STORAGE_KEY,
      '{"budgetAmount":25000,"version":1}',
    );
    renderHome();

    fireEvent.click(await screen.findByRole('button', { name: 'Toilet' }));
    await waitFor(() =>
      expect(getRecommendations).toHaveBeenLastCalledWith(
        expect.objectContaining({ budgetAmount: null, category: 'TOILET' }),
        expect.any(AbortSignal),
      ),
    );
    expect(screen.queryByRole('button', { name: /Ubah budget/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cari Sekarang' }));
    expect(push).toHaveBeenLastCalledWith('/places?category=TOILET&sort=NEAREST');
    expect(window.localStorage.getItem(GUEST_PREFERENCES_STORAGE_KEY)).toBe(
      '{"budgetAmount":25000,"version":1}',
    );
  });

  it('does not activate an invalid budget restored from storage', async () => {
    window.localStorage.setItem(
      GUEST_PREFERENCES_STORAGE_KEY,
      '{"budgetAmount":12000,"version":1}',
    );
    renderHome();

    expect(await screen.findByRole('button', { name: 'Makan Murah' })).toBeVisible();
    expect(screen.getByRole('button', { name: /Ubah budget.*Belum dipilih/ })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cari Sekarang' })).toBeDisabled();
    expect(getRecommendations).not.toHaveBeenCalled();
  });

  it('labels manual context and refreshes location without losing category or budget', async () => {
    const rendered = renderHome();
    fireEvent.click(await screen.findByRole('button', { name: 'Ngopi' }));
    fireEvent.click(screen.getByRole('button', { name: /Ubah budget/ }));
    fireEvent.click(screen.getByRole('button', { name: '≤ Rp20.000' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tutup lembar' }));

    const manualLocation: ActiveLocation = {
      id: 'kalideres-jakarta-barat',
      label: 'Kalideres, Jakarta Barat',
      latitude: -6.138,
      longitude: 106.703,
      queryKey: ['location', 'MANUAL', 'kalideres-jakarta-barat', -6.138, 106.703],
      source: 'MANUAL',
      status: 'MANUAL_LOCATION_ACTIVE',
      timestamp: 200,
    };
    vi.mocked(useLocation).mockReturnValue(locationController(manualLocation));
    rendered.rerender(createElement(GuestHome));

    expect(await screen.findByText('Area manual')).toBeVisible();
    expect(screen.getByText('Kalideres, Jakarta Barat')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Ngopi' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Ubah budget.*≤ Rp20.000/ })).toBeVisible();
    await waitFor(() =>
      expect(getRecommendations).toHaveBeenLastCalledWith(
        expect.objectContaining({
          budgetAmount: 20_000,
          category: 'NGOPI',
          latitude: -6.138,
          longitude: 106.703,
        }),
        expect.any(AbortSignal),
      ),
    );
  });

  it('keeps an outside-radius candidate separate behind an explicit action', async () => {
    vi.mocked(getRecommendations).mockResolvedValue({
      ...recommendationResponse,
      data: { alternatives: [], primary: null },
      meta: {
        ...recommendationResponse.meta,
        fallback: {
          nearestDistanceMeters: 7_400,
          nearestPlace: {
            distanceMeters: 7_400,
            id: recommendation.id,
            name: recommendation.name,
            primaryCategory,
            slug: recommendation.slug,
          },
          reason: 'OUTSIDE_RADIUS',
        },
      },
    });

    renderHome();

    expect(
      await screen.findByRole('heading', {
        name: 'Belum ada tempat sesuai dalam radius 5 km',
      }),
    ).toBeVisible();
    expect(screen.getByText(/7,4 km.*di luar radius normal 5 km/)).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Tempat Utama' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lihat kandidat di luar radius' })).toHaveAttribute(
      'href',
      '/places/tempat-utama',
    );
  });

  it('offers retry when category loading fails', async () => {
    vi.mocked(getCategories)
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(categoriesResponse);
    renderHome();

    expect(await screen.findByRole('alert')).toHaveTextContent('Koneksi sedang bermasalah');
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(await screen.findByRole('button', { name: 'Makan Murah' })).toBeVisible();
  });
});
