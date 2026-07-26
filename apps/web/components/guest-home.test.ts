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

import { getCategories, getRecommendations } from '../lib/api/client';
import { getLocationContext } from '../lib/location';
import { GuestHome } from './guest-home';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('../lib/api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/api/client')>();
  return { ...original, getCategories: vi.fn(), getRecommendations: vi.fn() };
});
vi.mock('../lib/location', () => ({ getLocationContext: vi.fn() }));

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
    code: 'TOILET',
    description: null,
    id: 'toilet',
    isPrimary: false,
    name: 'Toilet',
    sortOrder: 2,
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

function TestQueryProvider({ children }: Readonly<{ children: ReactNode }>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

function renderHome() {
  return render(createElement(GuestHome), { wrapper: TestQueryProvider });
}

describe('GuestHome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(getLocationContext).mockReturnValue({
      label: 'Lokasi Uji',
      latitude: -6.1,
      longitude: 106.8,
      source: 'DEVELOPMENT_PREVIEW',
      status: 'READY',
    });
    vi.mocked(getCategories).mockResolvedValue(categoriesResponse);
    vi.mocked(getRecommendations).mockResolvedValue(recommendationResponse);
  });

  it('uses API categories, requires budget only when supported, and shows one preview', async () => {
    renderHome();

    expect(await screen.findByRole('button', { name: 'Makan Murah' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: '≤ Rp15.000' })).toBeVisible();
    expect(await screen.findByRole('heading', { name: 'Tempat Utama' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Alternatif' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Toilet' }));
    await waitFor(() =>
      expect(getRecommendations).toHaveBeenLastCalledWith(
        expect.objectContaining({ budgetAmount: null, category: 'TOILET' }),
        expect.any(AbortSignal),
      ),
    );
    expect(screen.queryByRole('button', { name: '≤ Rp15.000' })).not.toBeInTheDocument();
  });

  it('does not request a preview while location is unavailable', async () => {
    vi.mocked(getLocationContext).mockReturnValue({ status: 'UNAVAILABLE' });
    renderHome();

    expect(await screen.findByRole('button', { name: 'Makan Murah' })).toBeVisible();
    expect(getRecommendations).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Cari Sekarang' })).toBeDisabled();
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
