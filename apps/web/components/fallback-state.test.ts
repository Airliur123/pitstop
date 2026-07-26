import type { RecommendationFallbackReason } from '@pitstop/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ApiProblem } from '../lib/api/client';
import { ApiErrorState } from './api-error-state';
import { FallbackState } from './fallback-state';

const titles: Record<RecommendationFallbackReason, string> = {
  ALL_PLACES_CLOSED: 'Semua tempat sedang tutup',
  BUDGET_TOO_LOW: 'Belum ada yang sesuai budget',
  NO_CATEGORY_MATCH: 'Kategori belum tersedia',
  NO_VERIFIED_MATCH: 'Belum ada data terverifikasi',
  OUTSIDE_RADIUS: 'Belum ada tempat sesuai dalam radius 5 km',
};

describe('recommendation states', () => {
  it.each(Object.entries(titles) as [RecommendationFallbackReason, string][])(
    'renders the typed %s state',
    (reason, title) => {
      render(createElement(FallbackState, { fallback: { reason } }));
      expect(screen.getByRole('heading', { name: title })).toBeVisible();
      expect(screen.getByRole('link', { name: 'Ubah pencarian' })).toHaveAttribute('href', '/');
    },
  );

  it('keeps an outside-radius candidate separate until an explicit action is supplied', () => {
    render(
      createElement(FallbackState, {
        action: createElement('a', { href: '/places/kandidat' }, 'Lihat tempat'),
        fallback: {
          nearestDistanceMeters: 7_400,
          reason: 'OUTSIDE_RADIUS',
        },
      }),
    );

    expect(screen.getByText(/7,4 km.*di luar radius normal 5 km/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Lihat tempat' })).toHaveAttribute(
      'href',
      '/places/kandidat',
    );
    expect(screen.queryByRole('heading', { name: /kandidat/i })).not.toBeInTheDocument();
  });

  it('renders a recoverable network error', () => {
    const onRetry = vi.fn();
    render(createElement(ApiErrorState, { error: new Error('offline'), onRetry }));
    expect(screen.getByRole('alert')).toHaveTextContent('Koneksi sedang bermasalah');
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('shows rate-limit timing and request ID without leaking a stack', () => {
    render(
      createElement(ApiErrorState, {
        error: new ApiProblem('limited', 429, 'RATE_LIMITED', 'request-429', 3),
        onRetry: vi.fn(),
      }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Terlalu banyak permintaan');
    expect(screen.getByRole('alert')).toHaveTextContent('sekitar 3 detik');
    expect(screen.getByRole('alert')).toHaveTextContent('request-429');
    expect(screen.getByRole('alert')).not.toHaveTextContent('ApiProblem');
  });
});
