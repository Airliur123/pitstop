'use client';

import type { PublicPlaceListItem } from '@pitstop/contracts';
import dynamic from 'next/dynamic';
import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface ResultMapCenter {
  readonly latitude: number;
  readonly longitude: number;
}

export interface ResultMapProps {
  readonly center: ResultMapCenter;
  readonly onError?: ((error: Error) => void) | undefined;
  readonly onSelectPlace: (placeId: string) => void;
  readonly places: readonly PublicPlaceListItem[];
  readonly selectedPlaceId?: string;
  readonly selectionVersion?: number;
}

function MapLoading() {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      className="grid min-h-80 place-items-center rounded-card border border-border bg-surface p-6 text-center"
      role="status"
    >
      <div>
        <p className="font-semibold">Memuat peta hasil...</p>
        <p className="mt-1 text-[13px] text-muted">Daftar hasil tetap dapat digunakan.</p>
      </div>
    </section>
  );
}

const DynamicResultMap = dynamic(
  () => import('./result-map.client').then((module) => module.ResultMapClient),
  {
    loading: MapLoading,
    ssr: false,
  },
);

interface MapErrorBoundaryProps {
  readonly children: ReactNode;
  readonly onError?: ((error: Error) => void) | undefined;
}

interface MapErrorBoundaryState {
  readonly failed: boolean;
}

class MapErrorBoundary extends Component<MapErrorBoundaryProps, MapErrorBoundaryState> {
  public override state: MapErrorBoundaryState = { failed: false };

  public static getDerivedStateFromError(): MapErrorBoundaryState {
    return { failed: true };
  }

  public override componentDidCatch(error: Error, _errorInfo: ErrorInfo) {
    this.props.onError?.(error);
  }

  public override render() {
    if (this.state.failed) {
      return (
        <section
          className="rounded-card border border-border bg-surface p-5 text-center"
          role="alert"
        >
          <h2 className="font-bold">Peta tidak dapat dimuat</h2>
          <p className="mt-2 text-sm text-muted">
            Gunakan daftar hasil untuk memilih tempat atau membuka detail.
          </p>
        </section>
      );
    }

    return this.props.children;
  }
}

export function ResultMap(props: Readonly<ResultMapProps>) {
  const resetKey = [
    props.center.latitude,
    props.center.longitude,
    ...props.places.map((place) => place.id),
  ].join(':');

  return (
    <MapErrorBoundary key={resetKey} onError={props.onError}>
      <DynamicResultMap {...props} />
    </MapErrorBoundary>
  );
}
