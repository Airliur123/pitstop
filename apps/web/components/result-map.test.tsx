import type { PublicPlaceListItem } from '@pitstop/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import { type ComponentType, createElement, lazy } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResultMapProps } from './result-map';
import { ResultMap } from './result-map';

const clientControl = vi.hoisted(() => ({ throwOnRender: false }));

vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<ComponentType<ResultMapProps>>) =>
    lazy(async () => ({ default: await loader() })),
}));

vi.mock('./result-map.client', () => ({
  ResultMapClient: (props: ResultMapProps) => {
    if (clientControl.throwOnRender) throw new Error('Leaflet failed to initialize.');

    return createElement(
      'section',
      {
        'aria-label': 'Mock peta hasil',
        'data-selected-place': props.selectedPlaceId,
      },
      createElement(
        'button',
        {
          onClick: () => props.onSelectPlace(props.places[0]?.id ?? ''),
          type: 'button',
        },
        `Pilih ${props.places[0]?.name ?? 'tempat'}`,
      ),
      createElement(
        'button',
        {
          onClick: () => props.onError?.(new Error('Tile gagal dimuat.')),
          type: 'button',
        },
        'Laporkan error peta',
      ),
    );
  },
}));

const place: PublicPlaceListItem = {
  address: 'Jl. Uji No. 5',
  budgetMatch: true,
  categories: [{ code: 'MAKAN_MURAH', id: 'category-1', isPrimary: true, name: 'Makan Murah' }],
  cheapestAvailableMainItem: { name: 'Nasi uji', priceAmount: 15_000 },
  dataFreshnessAt: '2026-07-26T00:00:00.000Z',
  distanceMeters: 350,
  facilitySummary: [],
  id: 'place-1',
  landmark: null,
  latitude: -6.175,
  longitude: 106.827,
  name: 'Warung Uji',
  placeStatus: 'ACTIVE',
  primaryCategory: {
    code: 'MAKAN_MURAH',
    id: 'category-1',
    isPrimary: true,
    name: 'Makan Murah',
  },
  shortDescription: null,
  slug: 'warung-uji',
  verificationStatus: 'ADMIN_VERIFIED',
};

const center = { latitude: -6.175, longitude: 106.827 } as const;

describe('ResultMap dynamic boundary', () => {
  beforeEach(() => {
    clientControl.throwOnRender = false;
    vi.restoreAllMocks();
  });

  it('forwards a pin selection without changing the result dataset', async () => {
    const onSelectPlace = vi.fn();

    render(
      createElement(ResultMap, {
        center,
        onSelectPlace,
        places: [place],
        selectedPlaceId: place.id,
      }),
    );

    const map = await screen.findByRole('region', { name: 'Mock peta hasil' });
    expect(map).toHaveAttribute('data-selected-place', place.id);

    fireEvent.click(screen.getByRole('button', { name: 'Pilih Warung Uji' }));
    expect(onSelectPlace).toHaveBeenCalledOnce();
    expect(onSelectPlace).toHaveBeenCalledWith(place.id);
  });

  it('forwards recoverable client errors to the owning results view', async () => {
    const onError = vi.fn();

    render(
      createElement(ResultMap, {
        center,
        onError,
        onSelectPlace: vi.fn(),
        places: [place],
      }),
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Laporkan error peta' }));
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ message: 'Tile gagal dimuat.' }),
    );
  });

  it('keeps an accessible fallback when the client map cannot render', async () => {
    clientControl.throwOnRender = true;
    const onError = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      createElement(ResultMap, {
        center,
        onError,
        onSelectPlace: vi.fn(),
        places: [place],
      }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Peta tidak dapat dimuat');
    expect(screen.getByRole('alert')).toHaveTextContent('Gunakan daftar hasil');
    expect(onError).toHaveBeenCalled();
  });
});
