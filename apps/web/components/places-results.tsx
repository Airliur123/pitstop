'use client';

import type { ApiSuccess, PublicPlaceListItem, PublicPlacesMeta } from '@pitstop/contracts';
import { Button, LinkButton, Skeleton } from '@pitstop/ui';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { getPlaces, getRecommendations } from '../lib/api/client';
import { formatRupiah } from '../lib/format';
import { getLocationContext } from '../lib/location';
import { queryKeys } from '../lib/query-keys';
import type { PlacesUrlState } from '../lib/url-state';
import { ApiErrorState } from './api-error-state';
import { FallbackState } from './fallback-state';
import { GuestShell } from './guest-shell';
import { PlaceResultCard } from './place-result-card';

export function PlacesResults({ state }: Readonly<{ state: PlacesUrlState }>) {
  const location = useMemo(() => getLocationContext(), []);
  const [showAll, setShowAll] = useState(false);
  const requiresBudget = state.category === 'MAKAN_MURAH' || state.category === 'NGOPI';
  const hasRequiredBudget = !requiresBudget || state.budgetAmount !== null;
  const input =
    location.status === 'READY' && hasRequiredBudget
      ? {
          budgetAmount: state.budgetAmount,
          category: state.category,
          latitude: location.latitude,
          limit: 4,
          longitude: location.longitude,
          radiusMeters: 5_000,
        }
      : null;
  const recommendations = useQuery({
    enabled: input !== null,
    queryFn: ({ signal }) => {
      if (input === null) throw new Error('Recommendation input is unavailable.');
      return getRecommendations(input, signal);
    },
    queryKey: input
      ? queryKeys.recommendations(input)
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
    queryKey: placesInput
      ? queryKeys.places(placesInput)
      : ['public', 'places', 'results-disabled'],
  });

  const title = state.category
    .toLowerCase()
    .split('_')
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');

  return (
    <GuestShell backHref="/" title={title}>
      <main className="flex flex-1 flex-col gap-3 px-4 py-3" id="main-content">
        <header>
          <h1 className="text-lg font-bold">Rekomendasi terbaik</h1>
          <p className="text-[13px] text-muted">
            {state.budgetAmount !== null ? `≤ ${formatRupiah(state.budgetAmount)} · ` : ''}
            Radius 5 km
          </p>
          {location.status === 'READY' ? (
            <p className="mt-1 text-[13px] text-muted">Data Simulasi · {location.label}</p>
          ) : null}
        </header>

        {location.status !== 'READY' ? (
          <section className="rounded-card border border-border bg-surface p-5 text-center">
            <h2 className="font-bold">Konteks lokasi belum tersedia</h2>
            <p className="mt-2 text-sm text-muted">
              Aktifkan fixture development untuk menguji Recommendations pada Phase 4.
            </p>
            <LinkButton className="mt-4" href="/" variant="secondary">
              Kembali
            </LinkButton>
          </section>
        ) : !hasRequiredBudget ? (
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
              recommendations.data.meta.fallback.nearestPlace ? (
                <LinkButton
                  href={`/places/${recommendations.data.meta.fallback.nearestPlace.slug}`}
                  variant="ghost"
                >
                  Lihat tempat terdekat
                </LinkButton>
              ) : (
                <LinkButton href="/" variant="ghost">
                  Ubah pencarian
                </LinkButton>
              )
            }
            fallback={recommendations.data.meta.fallback}
          />
        ) : (
          <>
            <p aria-live="polite" className="sr-only" role="status">
              {(recommendations.data.data.primary ? 1 : 0) +
                recommendations.data.data.alternatives.length}{' '}
              rekomendasi ditemukan.
            </p>
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
                  <ApiErrorState error={allPlaces.error} onRetry={() => void allPlaces.refetch()} />
                ) : (
                  <>
                    {allPlaces.data.pages
                      .flatMap((page) => page.data)
                      .filter(
                        (place, index, places) =>
                          places.findIndex((candidate) => candidate.id === place.id) === index,
                      )
                      .map((place) => (
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
      </main>
    </GuestShell>
  );
}
