import type { PublicPlaceListItem } from '@pitstop/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PlaceResultCard } from './place-result-card';

const place: PublicPlaceListItem = {
  address: 'Jl. Uji 1',
  budgetMatch: null,
  categories: [
    {
      code: 'TOILET',
      id: 'category-toilet',
      isPrimary: true,
      name: 'Toilet',
    },
  ],
  cheapestAvailableMainItem: null,
  dataFreshnessAt: '2026-07-26T00:00:00.000Z',
  distanceMeters: 350,
  facilitySummary: [],
  id: 'place-1',
  landmark: null,
  latitude: -6.123456,
  longitude: 106.812345,
  name: 'Tempat Uji',
  placeStatus: 'ACTIVE',
  primaryCategory: {
    code: 'TOILET',
    id: 'category-toilet',
    isPrimary: true,
    name: 'Toilet',
  },
  shortDescription: null,
  slug: 'tempat-uji',
  verificationStatus: 'ADMIN_VERIFIED',
};

function expectSafeDirectionsLink(link: HTMLElement) {
  expect(link).toHaveAttribute(
    'aria-label',
    'Arahkan ke Tempat Uji di Google Maps (buka tab baru)',
  );
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');

  const url = new URL(link.getAttribute('href') ?? '');
  expect(url.protocol).toBe('https:');
  expect(url.pathname).toBe('/maps/dir/');
  expect(url.searchParams.get('destination')).toBe('-6.123456,106.812345');
  expect(url.searchParams.has('origin')).toBe(false);
}

describe('PlaceResultCard directions', () => {
  it('offers safe external directions on the full card', () => {
    render(<PlaceResultCard place={place} />);

    expectSafeDirectionsLink(
      screen.getByRole('link', {
        name: 'Arahkan ke Tempat Uji di Google Maps (buka tab baru)',
      }),
    );
    expect(screen.getByRole('link', { name: 'Detail' })).toHaveAttribute(
      'href',
      '/places/tempat-uji',
    );
  });

  it('offers the same directions action on the compact card', () => {
    render(<PlaceResultCard compact place={place} />);

    expectSafeDirectionsLink(
      screen.getByRole('link', {
        name: 'Arahkan ke Tempat Uji di Google Maps (buka tab baru)',
      }),
    );
    expect(screen.getByRole('link', { name: 'Detail' })).toHaveAttribute(
      'href',
      '/places/tempat-uji',
    );
  });
});
