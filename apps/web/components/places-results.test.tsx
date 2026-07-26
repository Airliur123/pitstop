import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PlacesPage from '../app/places/page';
import { getLocationContext } from '../lib/location';

vi.mock('../lib/location', () => ({ getLocationContext: vi.fn() }));

const originalBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

function TestQueryProvider({ children }: Readonly<{ children: ReactNode }>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

async function renderPlacesUrl(searchParams: Record<string, string>) {
  const page = await PlacesPage({ searchParams: Promise.resolve(searchParams) });
  render(page, { wrapper: TestQueryProvider });
}

describe('Places page URL integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.test/api/v1';
    vi.mocked(getLocationContext).mockReturnValue({
      label: 'Lokasi Uji',
      latitude: -6.1,
      longitude: 106.8,
      source: 'DEVELOPMENT_PREVIEW',
      status: 'READY',
    });
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_BASE_URL = originalBaseUrl;
    vi.unstubAllGlobals();
  });

  it('rejects an invalid URL budget before the network boundary', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await renderPlacesUrl({ budget: '12000', category: 'MAKAN_MURAH' });

    expect(screen.getByRole('heading', { name: 'Pilih preset budget' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Ubah pencarian' })).toHaveAttribute('href', '/');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes a valid URL preset to the recommendation transport', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('offline'));
    vi.stubGlobal('fetch', fetchMock);

    await renderPlacesUrl({ budget: '15000', category: 'MAKAN_MURAH' });

    expect(screen.getByText(/≤ Rp15\.000 · Radius 5 km/)).toBeVisible();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe('/api/v1/public/recommendations');
    expect(requestUrl.searchParams.get('category')).toBe('MAKAN_MURAH');
    expect(requestUrl.searchParams.get('budgetAmount')).toBe('15000');
  });
});
