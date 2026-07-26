'use client';

import type { ApiSuccess, PublicPlaceListItem, PublicPlacesMeta } from '@pitstop/contracts';
import { Button, LinkButton, Skeleton } from '@pitstop/ui';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { List, Map as MapIcon } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';

import { useLocation } from '../hooks/use-location';
import { getPlaces, getRecommendations } from '../lib/api/client';
import { formatRupiah } from '../lib/format';
import { NORMAL_RADIUS_METERS } from '../lib/location';
import { queryKeys } from '../lib/query-keys';
import { placesUrl, type PlacesUrlState } from '../lib/url-state';
import { ApiErrorState } from './api-error-state';
import { FallbackState } from './fallback-state';
import { GuestShell } from './guest-shell';
import { ActiveLocationSummary, LocationExperience } from './location-experience';
import { PlaceResultCard } from './place-result-card';
import { ResultMap } from './result-map';

function uniquePlaces(places: readonly PublicPlaceListItem[]) {
  return places.filter(
    (place, index) => places.findIndex((candidate) => candidate.id === place.id) === index,
  );
}

export function PlacesResults({ state }: Readonly<{ state: PlacesUrlState }>) {
  const { activeLocation, openManualLocation } = useLocation();
  const [showAll, setShowAll] = useState(false);
  const [mapSelection, setMapSelection] = useState<{
    readonly placeId: string;
    readonly version: number;
  }>();
  const [mapError, setMapError] = useState<string | null>(null);
  const selectPlace = useCallback((placeId: string) => {
    setMapSelection((previous) => ({
      placeId,
      version: (previous?.version ?? 0) + 1,
    }));
  }, []);
  const requiresBudget = state.category === 'MAKAN_MURAH' || state.category === 'NGOPI';
  const hasRequiredBudget = !requiresBudget || state.budgetAmount !== null;
  const input =
    activeLocation && hasRequiredBudget
      ? {
          budgetAmount: state.budgetAmount,
          category: state.category,
          latitude: activeLocation.latitude,
          limit: 4,
          longitude: activeLocation.longitude,
        }
      : null;
  const recommendations = useQuery({
    enabled: input !== null,
    queryFn: ({ signal }) => {
      if (input === null) throw new Error('Recommendation input is unavailable.');
      return getRecommendations(input, signal);
    },
    queryKey:
      input && activeLocation
        ? queryKeys.recommendations(activeLocation.queryKey, input)
        : ['public', 'recommendations', 'results-disabled'],
  });

  const placesInput = input
    ? {
        ...input,
        budgetAmount: state.budgetAmount,
        limit: 20,
        sort: state.sort,
      }
    : null;
  const allPlaces = useInfiniteQuery<
    ApiSuccess<readonly PublicPlaceListItem[], PublicPlacesMeta>,
    Error,
    { pages: ApiSuccess<readonly PublicPlaceListItem[], PublicPlacesMeta>[] },
    readonly unknown[],
    string | undefined
  >({
    enabled: showAll && placesInput !== null,
    getNextPageParam: (lastPage) => lastPage.meta.pagination.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      placesInput === null
        ? Promise.reject(new Error('Places input is unavailable.'))
        : getPlaces(
            {
              ...placesInput,
              ...(pageParam === undefined ? {} : { cursor: pageParam }),
            },
            signal,
          ),
    queryKey:
      placesInput && activeLocation
        ? queryKeys.places(activeLocation.queryKey, placesInput)
        : ['public', 'places', 'results-disabled'],
  });

  const recommendationPlaces = useMemo(
    () =>
      recommendations.data?.meta.fallback
        ? []
        : uniquePlaces([
            ...(recommendations.data?.data.primary ? [recommendations.data.data.primary] : []),
            ...(recommendations.data?.data.alternatives ?? []),
          ]),
    [recommendations.data],
  );
  const everyLoadedPlace = useMemo(
    () =>
      uniquePlaces([
        ...recommendationPlaces,
        ...(allPlaces.data?.pages.flatMap((page) => page.data) ?? []),
      ]),
    [allPlaces.data, recommendationPlaces],
  );
  const visiblePlaces = showAll ? everyLoadedPlace : recommendationPlaces;
  const selectedPlaceId = mapSelection?.placeId;

  const title = state.category
    .toLowerCase()
    .split('_')
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');

  if (!activeLocation) {
    return (
      <GuestShell backHref="/" title={title}>
        <main className="flex flex-1 flex-col gap-4 px-4 py-3" id="main-content">
          <h1 className="sr-only">Aktifkan lokasi untuk melihat rekomendasi</h1>
          <LocationExperience />
        </main>
      </GuestShell>
    );
  }

  return (
    <GuestShell backHref="/" title={title}>
      <main className="flex flex-1 flex-col gap-3 px-4 py-3" id="main-content">
        <header className="grid gap-2">
          <div>
            <h1 className="text-lg font-bold">Rekomendasi terbaik</h1>
            <p className="text-[13px] text-muted">
              {state.budgetAmount !== null ? `≤ ${formatRupiah(state.budgetAmount)} · ` : ''}
              Radius {NORMAL_RADIUS_METERS / 1_000} km
            </p>
          </div>
          <ActiveLocationSummary />
        </header>

        {!hasRequiredBudget ? (
          <section className="rounded-card border border-border bg-surface p-5 text-center">
            <h2 className="font-bold">Pilih preset budget</h2>
            <p className="mt-2 text-sm text-muted">
              Makan Murah dan Ngopi memerlukan salah satu dari empat preset budget resmi.
            </p>
            <LinkButton className="mt-4" href="/" variant="secondary">
              Ubah pencarian
            </LinkButton>
          </section>
        ) : recommendations.isPending ? (
          <section aria-busy="true" aria-live="polite" className="grid gap-3">
            <span className="sr-only">Mencari rekomendasi terbaik</span>
            <Skeleton className="h-[260px]" />
            <h2 className="text-sm font-semibold">Alternatif terdekat</h2>
            <Skeleton className="h-[140px]" />
            <Skeleton className="h-[140px]" />
          </section>
        ) : recommendations.isError ? (
          <ApiErrorState
            error={recommendations.error}
            onRetry={() => void recommendations.refetch()}
          />
        ) : recommendations.data.meta.fallback ? (
          <FallbackState
            action={
              <div className="grid w-full gap-2">
                {recommendations.data.meta.fallback.nearestPlace ? (
                  <LinkButton
                    href={`/places/${recommendations.data.meta.fallback.nearestPlace.slug}`}
                    size="full"
                    variant="secondary"
                  >
                    Lihat kandidat di luar radius
                  </LinkButton>
                ) : null}
                <Button onClick={openManualLocation} size="full" type="button" variant="ghost">
                  Ubah lokasi
                </Button>
                <LinkButton href="/" size="full" variant="ghost">
                  Ubah pencarian
                </LinkButton>
              </div>
            }
            fallback={recommendations.data.meta.fallback}
          />
        ) : (
          <>
            <p aria-live="polite" className="sr-only" role="status">
              {recommendationPlaces.length} rekomendasi ditemukan dalam radius 5 km.
            </p>

            <nav
              aria-label="Tampilan hasil"
              className="grid grid-cols-2 gap-2 rounded-button bg-app p-1"
            >
              <Button asChild size="full" variant={state.view === 'LIST' ? 'primary' : 'ghost'}>
                <Link
                  aria-current={state.view === 'LIST' ? 'page' : undefined}
                  href={placesUrl({ ...state, view: 'LIST' })}
                >
                  <List aria-hidden="true" className="size-5" />
                  Daftar
                </Link>
              </Button>
              <Button asChild size="full" variant={state.view === 'MAP' ? 'primary' : 'ghost'}>
                <Link
                  aria-current={state.view === 'MAP' ? 'page' : undefined}
                  href={placesUrl({ ...state, view: 'MAP' })}
                >
                  <MapIcon aria-hidden="true" className="size-5" />
                  Peta
                </Link>
              </Button>
            </nav>

            {state.view === 'MAP' ? (
              <>
                <ResultMap
                  center={{
                    latitude: activeLocation.latitude,
                    longitude: activeLocation.longitude,
                  }}
                  onError={(error) => setMapError(error.message)}
                  onSelectPlace={selectPlace}
                  places={visiblePlaces}
                  selectionVersion={mapSelection?.version ?? 0}
                  {...(selectedPlaceId === undefined ? {} : { selectedPlaceId })}
                />
                <noscript>
                  Peta memerlukan JavaScript. Semua hasil tetap tersedia pada daftar di bawah.
                </noscript>
                {mapError ? (
                  <p aria-live="polite" className="text-[13px] text-muted" role="status">
                    Peta mengalami kendala. Daftar hasil tetap dapat digunakan.
                  </p>
                ) : null}
                <section aria-labelledby="map-list-alternative" className="grid gap-2.5">
                  <h2 className="text-sm font-semibold" id="map-list-alternative">
                    Daftar hasil yang ditampilkan di peta
                  </h2>
                  {visiblePlaces.map((place) => (
                    <div className="grid gap-1" key={place.id}>
                      <PlaceResultCard compact place={place} />
                      <Button
                        aria-pressed={selectedPlaceId === place.id}
                        onClick={() => selectPlace(place.id)}
                        size="full"
                        type="button"
                        variant="ghost"
                      >
                        Tampilkan {place.name} di peta
                      </Button>
                    </div>
                  ))}
                </section>
              </>
            ) : (
              <>
                {recommendations.data.data.primary ? (
                  <PlaceResultCard place={recommendations.data.data.primary} />
                ) : null}
                {recommendations.data.data.alternatives.length > 0 ? (
                  <section aria-labelledby="alternatives-heading" className="grid gap-2.5">
                    <h2 className="text-sm font-semibold" id="alternatives-heading">
                      Alternatif terdekat
                    </h2>
                    {recommendations.data.data.alternatives.map((place) => (
                      <PlaceResultCard compact key={place.id} place={place} />
                    ))}
                  </section>
                ) : null}
                {!showAll ? (
                  <Button
                    className="w-full"
                    onClick={() => setShowAll(true)}
                    type="button"
                    variant="ghost"
                  >
                    Lihat semua
                  </Button>
                ) : (
                  <section aria-labelledby="all-results-heading" className="grid gap-2.5">
                    <h2 className="text-sm font-semibold" id="all-results-heading">
                      Semua hasil terverifikasi
                    </h2>
                    {allPlaces.isPending ? (
                      <Skeleton className="h-[140px]" />
                    ) : allPlaces.isError ? (
                      <ApiErrorState
                        error={allPlaces.error}
                        onRetry={() => void allPlaces.refetch()}
                      />
                    ) : (
                      <>
                        {everyLoadedPlace.map((place) => (
                          <PlaceResultCard compact key={place.id} place={place} />
                        ))}
                        {allPlaces.hasNextPage ? (
                          <Button
                            aria-busy={allPlaces.isFetchingNextPage}
                            className="w-full"
                            disabled={allPlaces.isFetchingNextPage}
                            onClick={() => void allPlaces.fetchNextPage()}
                            type="button"
                            variant="secondary"
                          >
                            {allPlaces.isFetchingNextPage ? 'Memuat hasil…' : 'Muat lebih banyak'}
                          </Button>
                        ) : (
                          <p aria-live="polite" className="text-center text-[13px] text-muted">
                            Semua hasil sudah ditampilkan.
                          </p>
                        )}
                      </>
                    )}
                  </section>
                )}
              </>
            )}
          </>
        )}
      </main>
    </GuestShell>
  );
}
