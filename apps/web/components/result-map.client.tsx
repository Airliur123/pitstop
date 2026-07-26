'use client';

import type { PublicPlaceListItem } from '@pitstop/contracts';
import {
  circle as createCircle,
  divIcon,
  type LayerGroup as LeafletLayerGroup,
  layerGroup as createLayerGroup,
  type Map as LeafletMap,
  map as createMap,
  type Marker as LeafletMarker,
  marker as createMarker,
  type TileLayer as LeafletTileLayer,
  tileLayer as createTileLayer,
} from 'leaflet';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { formatDistance } from '../lib/format';
import { NORMAL_RADIUS_METERS } from '../lib/location';
import type { ResultMapCenter, ResultMapProps } from './result-map';

const RESULT_MAP_ZOOM = 13;
const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const defaultPinIcon = divIcon({
  className: 'pitstop-map-pin',
  html: '<span aria-hidden="true" class="pitstop-map-pin__glyph"></span>',
  iconAnchor: [24, 48],
  iconSize: [48, 48],
  popupAnchor: [0, -44],
});

const selectedPinIcon = divIcon({
  className: 'pitstop-map-pin pitstop-map-pin--selected',
  html: '<span aria-hidden="true" class="pitstop-map-pin__glyph"></span>',
  iconAnchor: [24, 48],
  iconSize: [48, 48],
  popupAnchor: [0, -44],
});

interface MarkerRegistration {
  readonly ariaLabel: string;
  readonly clickHandler: () => void;
  readonly marker: LeafletMarker;
}

function isValidCoordinate({ latitude, longitude }: ResultMapCenter) {
  return (
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function asError(value: unknown, fallbackMessage: string) {
  return value instanceof Error ? value : new Error(fallbackMessage);
}

function createPlaceSummary(place: PublicPlaceListItem) {
  const article = document.createElement('article');
  article.className = 'pitstop-map-summary';

  const heading = document.createElement('h3');
  heading.textContent = place.name;
  article.append(heading);

  const distance = document.createElement('p');
  distance.textContent = formatDistance(place.distanceMeters);
  article.append(distance);

  const address = document.createElement('p');
  address.textContent = place.address;
  article.append(address);

  const detailLink = document.createElement('a');
  detailLink.href = `/places/${encodeURIComponent(place.slug)}`;
  detailLink.textContent = 'Buka detail';
  article.append(detailLink);

  return article;
}

function MapErrorState({ invalidCenter = false }: Readonly<{ invalidCenter?: boolean }>) {
  return (
    <section className="rounded-card border border-border bg-surface p-5 text-center" role="alert">
      <h2 className="font-bold">
        {invalidCenter ? 'Peta tidak dapat ditampilkan' : 'Peta tidak dapat dimuat'}
      </h2>
      <p className="mt-2 text-sm text-muted">
        {invalidCenter
          ? 'Titik pusat peta tidak valid. Daftar hasil tetap dapat digunakan.'
          : 'Gunakan daftar hasil untuk memilih tempat atau membuka detail.'}
      </p>
    </section>
  );
}

export function ResultMapClient({
  center,
  onError,
  onSelectPlace,
  places,
  selectedPlaceId,
  selectionVersion = 0,
}: Readonly<ResultMapProps>) {
  const descriptionId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef(new Map<string, MarkerRegistration>());
  const onErrorRef = useRef(onError);
  const onSelectPlaceRef = useRef(onSelectPlace);
  const reportedInvalidCenter = useRef(false);
  const reportedInvalidPlaces = useRef('');
  const reportedMapFailure = useRef(false);
  const reportedTileError = useRef(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [tileLayerFailed, setTileLayerFailed] = useState(false);
  const tilesDisabled = process.env.NEXT_PUBLIC_MAP_TILES_DISABLED === 'true';
  const centerIsValid = isValidCoordinate(center);
  const invalidPlaceIds = useMemo(
    () => places.filter((place) => !isValidCoordinate(place)).map((place) => place.id),
    [places],
  );
  const validPlaces = useMemo(() => places.filter((place) => isValidCoordinate(place)), [places]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onSelectPlaceRef.current = onSelectPlace;
  }, [onSelectPlace]);

  const reportMapFailure = useCallback((error: Error) => {
    if (reportedMapFailure.current) return;
    reportedMapFailure.current = true;
    setMapFailed(true);
    onErrorRef.current?.(error);
  }, []);

  const handleTileError = useCallback(() => {
    if (reportedTileError.current) return;
    reportedTileError.current = true;
    setTileLayerFailed(true);
    onErrorRef.current?.(new Error('The OpenStreetMap tile layer failed to load.'));
  }, []);

  useEffect(() => {
    if (centerIsValid || reportedInvalidCenter.current) return;
    reportedInvalidCenter.current = true;
    onErrorRef.current?.(new Error('The map center is invalid.'));
  }, [centerIsValid]);

  useEffect(() => {
    const fingerprint = invalidPlaceIds.join(':');
    if (fingerprint === '' || fingerprint === reportedInvalidPlaces.current) return;
    reportedInvalidPlaces.current = fingerprint;
    onErrorRef.current?.(new Error('One or more map results have invalid coordinates.'));
  }, [invalidPlaceIds]);

  useEffect(() => {
    if (!centerIsValid || mapFailed || containerRef.current === null) return;

    let map: LeafletMap | null = null;
    try {
      map = createMap(containerRef.current, {
        scrollWheelZoom: false,
        zoomControl: true,
      });
      mapRef.current = map;
    } catch (error) {
      map?.off();
      map?.remove();
      mapRef.current = null;
      reportMapFailure(asError(error, 'Leaflet failed to initialize.'));
      return;
    }

    return () => {
      map?.off();
      map?.remove();
      if (mapRef.current === map) mapRef.current = null;
    };
  }, [centerIsValid, mapFailed, reportMapFailure]);

  useEffect(() => {
    const map = mapRef.current;
    if (!centerIsValid || mapFailed || map === null) return;

    try {
      map.setView([center.latitude, center.longitude], RESULT_MAP_ZOOM, { animate: false });
      const radius = createCircle([center.latitude, center.longitude], {
        color: '#166534',
        fillColor: '#16a34a',
        fillOpacity: 0.08,
        interactive: false,
        opacity: 0.8,
        radius: NORMAL_RADIUS_METERS,
        weight: 2,
      }).addTo(map);

      return () => {
        radius.remove();
      };
    } catch (error) {
      reportMapFailure(asError(error, 'Leaflet failed to render the search radius.'));
    }
  }, [center.latitude, center.longitude, centerIsValid, mapFailed, reportMapFailure]);

  useEffect(() => {
    const map = mapRef.current;
    if (!centerIsValid || mapFailed || tilesDisabled || tileLayerFailed || map === null) {
      return;
    }

    let disposed = false;
    let tiles: LeafletTileLayer | null = null;
    const tileErrorHandler = () => {
      if (!disposed) handleTileError();
    };
    const cleanup = () => {
      disposed = true;
      tiles?.off('tileerror', tileErrorHandler);
      tiles?.remove();
    };

    try {
      tiles = createTileLayer(OSM_TILE_URL, {
        attribution: OSM_ATTRIBUTION,
        maxZoom: 19,
      });
      tiles.on('tileerror', tileErrorHandler);
      tiles.addTo(map);
    } catch (error) {
      cleanup();
      reportMapFailure(asError(error, 'Leaflet failed to initialize the base map.'));
      return;
    }

    return cleanup;
  }, [centerIsValid, handleTileError, mapFailed, reportMapFailure, tileLayerFailed, tilesDisabled]);

  useEffect(() => {
    const map = mapRef.current;
    if (!centerIsValid || mapFailed || map === null) return;

    let markerLayer: LeafletLayerGroup | null = null;
    const registrations = new Map<string, MarkerRegistration>();

    const cleanup = () => {
      for (const { clickHandler, marker } of registrations.values()) {
        const element = marker.getElement();
        element?.removeAttribute('aria-label');
        element?.removeAttribute('role');
        marker.off('click', clickHandler);
        marker.unbindPopup();
        marker.remove();
      }
      markerLayer?.clearLayers();
      markerLayer?.remove();
      if (markersRef.current === registrations) markersRef.current = new Map();
    };

    try {
      markerLayer = createLayerGroup().addTo(map);
      for (const place of validPlaces) {
        const clickHandler = () => onSelectPlaceRef.current(place.id);
        const marker = createMarker([place.latitude, place.longitude], {
          alt: `Lokasi ${place.name}`,
          icon: defaultPinIcon,
          keyboard: true,
          riseOnHover: true,
          title: place.name,
          zIndexOffset: 0,
        });
        marker.bindPopup(createPlaceSummary(place), {
          closeButton: false,
          minWidth: 190,
        });
        marker.on('click', clickHandler);
        marker.addTo(markerLayer);

        const ariaLabel = `Pin peta: ${place.name}`;
        const element = marker.getElement();
        element?.setAttribute('aria-label', ariaLabel);
        element?.setAttribute('role', 'button');
        registrations.set(place.id, { ariaLabel, clickHandler, marker });
      }
      markersRef.current = registrations;
    } catch (error) {
      cleanup();
      reportMapFailure(asError(error, 'Leaflet failed to render result markers.'));
      return;
    }

    return cleanup;
  }, [centerIsValid, mapFailed, reportMapFailure, validPlaces]);

  useEffect(() => {
    if (mapFailed) return;

    try {
      for (const [placeId, { ariaLabel, marker }] of markersRef.current) {
        const selected = placeId === selectedPlaceId;
        marker.setIcon(selected ? selectedPinIcon : defaultPinIcon);
        marker.setZIndexOffset(selected ? 1000 : 0);
        const element = marker.getElement();
        element?.setAttribute('aria-label', ariaLabel);
        element?.setAttribute('role', 'button');
        if (selected) marker.openPopup();
      }
    } catch (error) {
      reportMapFailure(asError(error, 'Leaflet failed to select the requested place.'));
    }
  }, [mapFailed, reportMapFailure, selectedPlaceId, selectionVersion, validPlaces]);

  if (!centerIsValid) {
    return <MapErrorState invalidCenter />;
  }

  if (mapFailed) {
    return <MapErrorState />;
  }

  return (
    <section aria-label="Peta hasil rekomendasi" className="pitstop-result-map-frame" role="region">
      <p className="sr-only" id={descriptionId}>
        Peta menampilkan lokasi dalam radius normal 5 kilometer. Gunakan daftar hasil sebagai
        alternatif yang dapat diakses dengan keyboard.
      </p>
      {tilesDisabled ? (
        <p className="pitstop-map-notice" role="status">
          Peta dasar dinonaktifkan. Pin hasil dan radius tetap tersedia.
        </p>
      ) : tileLayerFailed ? (
        <p className="pitstop-map-notice" role="status">
          Peta dasar gagal dimuat. Pin hasil dan radius tetap tersedia.
        </p>
      ) : null}
      {validPlaces.length === 0 ? (
        <p className="pitstop-map-empty" role="status">
          Belum ada pin hasil untuk ditampilkan.
        </p>
      ) : null}
      <div
        aria-describedby={descriptionId}
        aria-label="Peta interaktif hasil rekomendasi"
        className="pitstop-result-map"
        ref={containerRef}
        role="group"
      />
    </section>
  );
}
