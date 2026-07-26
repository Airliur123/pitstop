import type { PublicPlaceListItem } from '@pitstop/contracts';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const leaflet = vi.hoisted(() => {
  const maps: Array<{
    readonly container: HTMLElement;
    readonly off: ReturnType<typeof vi.fn>;
    readonly options: unknown;
    readonly remove: ReturnType<typeof vi.fn>;
    readonly setView: ReturnType<typeof vi.fn>;
  }> = [];
  const circles: Array<{
    readonly addTo: ReturnType<typeof vi.fn>;
    readonly remove: ReturnType<typeof vi.fn>;
  }> = [];
  const tileLayers: Array<{
    readonly addTo: ReturnType<typeof vi.fn>;
    readonly handlers: Map<string, () => void>;
    readonly off: ReturnType<typeof vi.fn>;
    readonly on: ReturnType<typeof vi.fn>;
    readonly remove: ReturnType<typeof vi.fn>;
  }> = [];
  const layerGroups: Array<{
    readonly addTo: ReturnType<typeof vi.fn>;
    readonly clearLayers: ReturnType<typeof vi.fn>;
    readonly remove: ReturnType<typeof vi.fn>;
  }> = [];
  const markers: Array<{
    readonly addTo: ReturnType<typeof vi.fn>;
    readonly bindPopup: ReturnType<typeof vi.fn>;
    readonly element: HTMLElement;
    readonly handlers: Map<string, () => void>;
    readonly off: ReturnType<typeof vi.fn>;
    readonly on: ReturnType<typeof vi.fn>;
    readonly openPopup: ReturnType<typeof vi.fn>;
    readonly remove: ReturnType<typeof vi.fn>;
    readonly setIcon: ReturnType<typeof vi.fn>;
    readonly setZIndexOffset: ReturnType<typeof vi.fn>;
    readonly unbindPopup: ReturnType<typeof vi.fn>;
  }> = [];

  function makeMap(container: HTMLElement, options: unknown) {
    const instance = {
      container,
      off: vi.fn(),
      options,
      remove: vi.fn(),
      setView: vi.fn(),
    };
    instance.setView.mockReturnValue(instance);
    maps.push(instance);
    return instance;
  }

  function makeCircle() {
    const instance = {
      addTo: vi.fn(),
      remove: vi.fn(),
    };
    instance.addTo.mockReturnValue(instance);
    circles.push(instance);
    return instance;
  }

  function makeTileLayer() {
    const handlers = new Map<string, () => void>();
    const instance = {
      addTo: vi.fn(),
      handlers,
      off: vi.fn(),
      on: vi.fn(),
      remove: vi.fn(),
    };
    instance.addTo.mockReturnValue(instance);
    instance.on.mockImplementation((event: string, handler: () => void) => {
      handlers.set(event, handler);
      return instance;
    });
    instance.off.mockImplementation((event: string, handler: () => void) => {
      if (handlers.get(event) === handler) handlers.delete(event);
      return instance;
    });
    tileLayers.push(instance);
    return instance;
  }

  function makeLayerGroup() {
    const instance = {
      addTo: vi.fn(),
      clearLayers: vi.fn(),
      remove: vi.fn(),
    };
    instance.addTo.mockReturnValue(instance);
    layerGroups.push(instance);
    return instance;
  }

  function makeMarker() {
    const element = document.createElement('div');
    const handlers = new Map<string, () => void>();
    const instance = {
      addTo: vi.fn(),
      bindPopup: vi.fn(),
      element,
      getElement: vi.fn(() => element),
      handlers,
      off: vi.fn(),
      on: vi.fn(),
      openPopup: vi.fn(),
      remove: vi.fn(),
      setIcon: vi.fn(),
      setZIndexOffset: vi.fn(),
      unbindPopup: vi.fn(),
    };
    instance.addTo.mockReturnValue(instance);
    instance.bindPopup.mockReturnValue(instance);
    instance.on.mockImplementation((event: string, handler: () => void) => {
      handlers.set(event, handler);
      return instance;
    });
    instance.off.mockImplementation((event: string, handler: () => void) => {
      if (handlers.get(event) === handler) handlers.delete(event);
      return instance;
    });
    instance.setIcon.mockReturnValue(instance);
    instance.setZIndexOffset.mockReturnValue(instance);
    markers.push(instance);
    return instance;
  }

  const map = vi.fn(makeMap);
  const circle = vi.fn(makeCircle);
  const tileLayer = vi.fn(makeTileLayer);
  const layerGroup = vi.fn(makeLayerGroup);
  const marker = vi.fn(makeMarker);
  const divIcon = vi.fn((options: unknown) => options);

  return {
    circle,
    circles,
    divIcon,
    layerGroup,
    layerGroups,
    map,
    maps,
    marker,
    markers,
    makeTileLayer,
    reset() {
      maps.length = 0;
      circles.length = 0;
      tileLayers.length = 0;
      layerGroups.length = 0;
      markers.length = 0;
      map.mockReset().mockImplementation(makeMap);
      circle.mockReset().mockImplementation(makeCircle);
      tileLayer.mockReset().mockImplementation(makeTileLayer);
      layerGroup.mockReset().mockImplementation(makeLayerGroup);
      marker.mockReset().mockImplementation(makeMarker);
    },
    tileLayer,
    tileLayers,
  };
});

vi.mock('leaflet', () => ({
  circle: leaflet.circle,
  divIcon: leaflet.divIcon,
  layerGroup: leaflet.layerGroup,
  map: leaflet.map,
  marker: leaflet.marker,
  tileLayer: leaflet.tileLayer,
}));

import { NORMAL_RADIUS_METERS } from '../lib/location';
import { ResultMapClient } from './result-map.client';

const primaryCategory = {
  code: 'MAKAN_MURAH',
  id: 'category-1',
  isPrimary: true,
  name: 'Makan Murah',
} as const;
const place: PublicPlaceListItem = {
  address: 'Jl. Uji No. 5',
  budgetMatch: true,
  categories: [primaryCategory],
  cheapestAvailableMainItem: { name: 'Nasi uji', priceAmount: 15_000 },
  dataFreshnessAt: '2026-07-26T00:00:00.000Z',
  distanceMeters: 350,
  facilitySummary: [],
  id: 'place-1',
  landmark: null,
  latitude: -6.175,
  longitude: 106.827,
  name: 'Warung <Uji>',
  placeStatus: 'ACTIVE',
  primaryCategory,
  shortDescription: null,
  slug: 'warung-uji',
  verificationStatus: 'ADMIN_VERIFIED',
};
const secondPlace: PublicPlaceListItem = {
  ...place,
  id: 'place-2',
  name: 'Warung Kedua',
  slug: 'warung-kedua',
};
const initialCenter = { latitude: -6.175, longitude: 106.827 } as const;
const initialPlaces = [place] as const;

describe('ResultMapClient imperative Leaflet lifecycle', () => {
  beforeEach(() => {
    leaflet.reset();
    vi.stubEnv('NEXT_PUBLIC_MAP_TILES_DISABLED', 'true');
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it('renders radius, accessible markers, safe summaries, selection, and full cleanup', async () => {
    const onSelectPlace = vi.fn();
    const nextCenter = { latitude: -6.18, longitude: 106.83 } as const;
    const rendered = render(
      <ResultMapClient
        center={initialCenter}
        onSelectPlace={onSelectPlace}
        places={initialPlaces}
      />,
    );

    await waitFor(() => expect(leaflet.maps).toHaveLength(1));
    expect(
      screen.getByRole('group', { name: 'Peta interaktif hasil rekomendasi' }),
    ).toHaveAttribute('aria-describedby');
    const map = leaflet.maps[0];
    const marker = leaflet.markers[0];
    expect(map?.setView).toHaveBeenCalledWith(
      [initialCenter.latitude, initialCenter.longitude],
      13,
      { animate: false },
    );
    expect(leaflet.circle).toHaveBeenCalledWith(
      [initialCenter.latitude, initialCenter.longitude],
      expect.objectContaining({ interactive: false, radius: NORMAL_RADIUS_METERS }),
    );
    expect(leaflet.tileLayer).not.toHaveBeenCalled();
    expect(leaflet.marker).toHaveBeenCalledWith(
      [place.latitude, place.longitude],
      expect.objectContaining({
        alt: `Lokasi ${place.name}`,
        keyboard: true,
        title: place.name,
      }),
    );
    expect(marker?.element).toHaveAttribute('aria-label', `Pin peta: ${place.name}`);
    expect(marker?.element).toHaveAttribute('role', 'button');

    const popup = marker?.bindPopup.mock.calls[0]?.[0];
    expect(popup).toBeInstanceOf(HTMLElement);
    expect(
      within(popup as HTMLElement).getByRole('heading', { name: place.name }),
    ).toHaveTextContent(place.name);
    expect(within(popup as HTMLElement).getByText(place.address)).toHaveTextContent(place.address);
    expect(within(popup as HTMLElement).getByRole('link', { name: 'Buka detail' })).toHaveAttribute(
      'href',
      '/places/warung-uji',
    );
    expect((popup as HTMLElement).innerHTML).toContain('&lt;Uji&gt;');

    act(() => marker?.handlers.get('click')?.());
    expect(onSelectPlace).toHaveBeenCalledWith(place.id);

    rendered.rerender(
      <ResultMapClient
        center={initialCenter}
        onSelectPlace={onSelectPlace}
        places={initialPlaces}
        selectedPlaceId={place.id}
        selectionVersion={1}
      />,
    );
    expect(marker?.openPopup).toHaveBeenCalledOnce();

    rendered.rerender(
      <ResultMapClient
        center={initialCenter}
        onSelectPlace={onSelectPlace}
        places={initialPlaces}
        selectedPlaceId={place.id}
        selectionVersion={2}
      />,
    );
    expect(marker?.openPopup).toHaveBeenCalledTimes(2);

    rendered.rerender(
      <ResultMapClient
        center={nextCenter}
        onSelectPlace={onSelectPlace}
        places={initialPlaces}
        selectedPlaceId={place.id}
        selectionVersion={2}
      />,
    );
    expect(leaflet.maps).toHaveLength(1);
    expect(map?.setView).toHaveBeenLastCalledWith([nextCenter.latitude, nextCenter.longitude], 13, {
      animate: false,
    });
    expect(leaflet.circles).toHaveLength(2);
    expect(leaflet.circles[0]?.remove).toHaveBeenCalledOnce();

    rendered.unmount();
    expect(marker?.off).toHaveBeenCalledWith('click', expect.any(Function));
    expect(marker?.unbindPopup).toHaveBeenCalledOnce();
    expect(marker?.remove).toHaveBeenCalledOnce();
    expect(leaflet.layerGroups[0]?.clearLayers).toHaveBeenCalledOnce();
    expect(leaflet.layerGroups[0]?.remove).toHaveBeenCalledOnce();
    expect(leaflet.circles[1]?.remove).toHaveBeenCalledOnce();
    expect(map?.off).toHaveBeenCalledOnce();
    expect(map?.remove).toHaveBeenCalledOnce();
  });

  it('removes stale marker layers when the result dataset changes', async () => {
    const rendered = render(
      <ResultMapClient center={initialCenter} onSelectPlace={vi.fn()} places={initialPlaces} />,
    );
    await waitFor(() => expect(leaflet.markers).toHaveLength(1));
    const staleMarker = leaflet.markers[0];
    const staleLayer = leaflet.layerGroups[0];

    rendered.rerender(
      <ResultMapClient center={initialCenter} onSelectPlace={vi.fn()} places={[secondPlace]} />,
    );

    expect(staleMarker?.off).toHaveBeenCalledWith('click', expect.any(Function));
    expect(staleMarker?.remove).toHaveBeenCalledOnce();
    expect(staleLayer?.clearLayers).toHaveBeenCalledOnce();
    expect(staleLayer?.remove).toHaveBeenCalledOnce();
    expect(leaflet.markers).toHaveLength(2);
  });

  it('removes a failed tile layer and reports repeated tile errors only once', async () => {
    vi.stubEnv('NEXT_PUBLIC_MAP_TILES_DISABLED', 'false');
    const onError = vi.fn();
    render(
      <ResultMapClient
        center={initialCenter}
        onError={onError}
        onSelectPlace={vi.fn()}
        places={initialPlaces}
      />,
    );

    await waitFor(() => expect(leaflet.tileLayers).toHaveLength(1));
    const tiles = leaflet.tileLayers[0];
    const tileError = tiles?.handlers.get('tileerror');
    expect(tileError).toBeTypeOf('function');

    act(() => {
      tileError?.();
      tileError?.();
    });

    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'The OpenStreetMap tile layer failed to load.' }),
    );
    expect(
      screen.getByText('Peta dasar gagal dimuat. Pin hasil dan radius tetap tersedia.'),
    ).toBeVisible();
    expect(tiles?.off).toHaveBeenCalledWith('tileerror', tileError);
    expect(tiles?.remove).toHaveBeenCalledOnce();

    act(() => tileError?.());
    expect(onError).toHaveBeenCalledOnce();
  });

  it('cleans a tile listener when adding the layer fails partway through setup', async () => {
    vi.stubEnv('NEXT_PUBLIC_MAP_TILES_DISABLED', 'false');
    const tiles = leaflet.makeTileLayer();
    tiles.addTo.mockImplementationOnce(() => {
      throw new Error('Mock tile add failure.');
    });
    leaflet.tileLayer.mockReturnValueOnce(tiles);
    const onError = vi.fn();

    render(
      <ResultMapClient
        center={initialCenter}
        onError={onError}
        onSelectPlace={vi.fn()}
        places={initialPlaces}
      />,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Peta tidak dapat dimuat');
    const tileError = tiles.on.mock.calls[0]?.[1] as (() => void) | undefined;
    expect(tiles.off).toHaveBeenCalledWith('tileerror', tileError);
    expect(tiles.remove).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Mock tile add failure.' }),
    );

    act(() => tileError?.());
    expect(onError).toHaveBeenCalledOnce();
  });

  it('does not initialize Leaflet for an invalid center', async () => {
    const onError = vi.fn();
    render(
      <ResultMapClient
        center={{ latitude: Number.NaN, longitude: 106.827 }}
        onError={onError}
        onSelectPlace={vi.fn()}
        places={initialPlaces}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Peta tidak dapat ditampilkan');
    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'The map center is invalid.' }),
      ),
    );
    expect(leaflet.map).not.toHaveBeenCalled();
  });

  it('turns an imperative initialization exception into an accessible map error', async () => {
    leaflet.map.mockImplementationOnce(() => {
      throw new Error('Mock Leaflet initialization failure.');
    });
    const onError = vi.fn();
    render(
      <ResultMapClient
        center={initialCenter}
        onError={onError}
        onSelectPlace={vi.fn()}
        places={initialPlaces}
      />,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Peta tidak dapat dimuat');
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Mock Leaflet initialization failure.' }),
    );
  });

  it('removes every development Strict Mode map instance', async () => {
    const rendered = render(
      <StrictMode>
        <ResultMapClient center={initialCenter} onSelectPlace={vi.fn()} places={initialPlaces} />
      </StrictMode>,
    );

    await waitFor(() => expect(leaflet.maps).toHaveLength(2));
    expect(leaflet.maps[0]?.remove).toHaveBeenCalledOnce();

    rendered.unmount();
    expect(leaflet.maps[1]?.remove).toHaveBeenCalledOnce();
  });
});
