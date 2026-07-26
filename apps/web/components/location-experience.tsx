'use client';

import { Button, Card, SearchField } from '@pitstop/ui';
import { CircleAlert, Clock3, LocateFixed, MapPin, MapPinOff, SearchX } from 'lucide-react';
import { type FormEvent, type Ref, useEffect, useRef, useState } from 'react';

import { useLocation } from '../hooks/use-location';
import {
  createManualLocationSearchController,
  MANUAL_LOCATION_AREAS,
  type ManualLocationErrorReason,
  ManualLocationResolutionError,
  type ManualLocationResult,
  type ManualLocationSearchController,
} from '../lib/manual-location-resolver';

const MANUAL_SEARCH_DEBOUNCE_MS = 250;

type ManualSearchState =
  | { readonly status: 'IDLE' }
  | { readonly status: 'LOADING' }
  | { readonly message: string; readonly status: 'EMPTY' }
  | { readonly message: string; readonly status: 'ERROR' };

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
}

function manualErrorMessage(reason: ManualLocationErrorReason) {
  if (reason === 'TOO_BROAD')
    return 'Area terlalu umum. Masukkan nama kecamatan yang lebih spesifik.';
  if (reason === 'INVALID_FORMAT') return 'Masukkan sedikitnya 3 huruf tanpa karakter khusus.';
  if (reason === 'UNUSABLE_RESULT') return 'Area ditemukan, tetapi belum dapat digunakan.';
  return 'Tidak ada area yang cocok dengan pencarian ini.';
}

function LocationStateCard({
  children,
  description,
  headingRef,
  icon,
  title,
}: Readonly<{
  children?: React.ReactNode;
  description: string;
  headingRef?: Ref<HTMLHeadingElement> | undefined;
  icon: React.ReactNode;
  title: string;
}>) {
  return (
    <Card
      aria-labelledby="location-state-heading"
      className="flex flex-col items-center gap-3 py-7 text-center"
    >
      <span
        aria-hidden="true"
        className="flex size-14 items-center justify-center rounded-full bg-surface-success text-brand"
      >
        {icon}
      </span>
      <div className="grid max-w-80 gap-1.5">
        <h2
          className="text-xl font-bold"
          id="location-state-heading"
          ref={headingRef}
          tabIndex={headingRef ? -1 : undefined}
        >
          {title}
        </h2>
        <p className="text-sm text-muted">{description}</p>
      </div>
      {children}
    </Card>
  );
}

function ManualLocationPanel() {
  const { activateManualLocation, retryCurrentLocation, setManualLocationInvalid } = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<ManualLocationSearchController | null>(null);
  const searchTimerRef = useRef<number | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = createManualLocationSearchController();
  }

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<readonly ManualLocationResult[]>(MANUAL_LOCATION_AREAS);
  const [searchState, setSearchState] = useState<ManualSearchState>({ status: 'IDLE' });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    return () => controllerRef.current?.cancel();
  }, []);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 3) return;
    const handle = window.setTimeout(() => {
      searchTimerRef.current = null;
      void controllerRef.current
        ?.search(normalizedQuery)
        .then((nextResults) => {
          setResults(nextResults);
          setSearchState({ status: 'IDLE' });
        })
        .catch((error: unknown) => {
          if (isAbortError(error)) return;
          const reason =
            error instanceof ManualLocationResolutionError ? error.reason : 'UNUSABLE_RESULT';
          setResults([]);
          setSearchState({ message: manualErrorMessage(reason), status: 'ERROR' });
        });
    }, MANUAL_SEARCH_DEBOUNCE_MS);
    searchTimerRef.current = handle;

    return () => {
      window.clearTimeout(handle);
      if (searchTimerRef.current === handle) searchTimerRef.current = null;
    };
  }, [query]);

  const updateQuery = (nextQuery: string) => {
    setQuery(nextQuery);
    setSelectedId(null);
    controllerRef.current?.cancel();
    const normalizedQuery = nextQuery.trim();
    if (normalizedQuery === '') {
      setResults(MANUAL_LOCATION_AREAS);
      setSearchState({ status: 'IDLE' });
      return;
    }
    if (normalizedQuery.length < 3) {
      setResults([]);
      setSearchState({
        message: 'Ketik sedikitnya 3 huruf untuk mencari area.',
        status: 'EMPTY',
      });
      return;
    }
    setSearchState({ status: 'LOADING' });
  };

  const submitSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (searchTimerRef.current !== null) {
      window.clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 3) {
      setManualLocationInvalid('INVALID_FORMAT', normalizedQuery);
      return;
    }

    setSearchState({ status: 'LOADING' });
    const searchController = controllerRef.current;
    if (!searchController) return;
    try {
      const nextResults = await searchController.search(normalizedQuery);
      setResults(nextResults);
      setSelectedId(nextResults.length === 1 ? (nextResults[0]?.id ?? null) : null);
      setSearchState({ status: 'IDLE' });
    } catch (error) {
      if (isAbortError(error)) return;
      const reason =
        error instanceof ManualLocationResolutionError ? error.reason : 'UNUSABLE_RESULT';
      setManualLocationInvalid(reason, normalizedQuery);
    }
  };

  const selected = results.find((result) => result.id === selectedId) ?? null;

  return (
    <section aria-labelledby="manual-location-heading" className="grid gap-4">
      <header className="grid gap-1">
        <h2 className="text-xl font-bold" id="manual-location-heading">
          Pilih area manual
        </h2>
        <p className="text-sm text-muted">
          Pilih area dukungan. Label manual akan tetap terlihat agar tidak dianggap sebagai GPS
          real-time.
        </p>
      </header>

      <form className="grid gap-2" onSubmit={(event) => void submitSearch(event)}>
        <label className="text-sm font-semibold" htmlFor="manual-location-search">
          Cari area atau kecamatan
        </label>
        <SearchField
          aria-describedby="manual-location-search-status"
          autoComplete="off"
          id="manual-location-search"
          onChange={(event) => updateQuery(event.currentTarget.value)}
          placeholder="Contoh: Tambora"
          ref={inputRef}
          value={query}
        />
        <p
          aria-live="polite"
          className="min-h-5 text-[13px] text-muted"
          id="manual-location-search-status"
          role="status"
        >
          {searchState.status === 'LOADING'
            ? 'Mencari area…'
            : searchState.status === 'EMPTY' || searchState.status === 'ERROR'
              ? searchState.message
              : query.trim() === ''
                ? 'Pilihan area yang tersedia ditampilkan di bawah.'
                : `${results.length} area ditemukan.`}
        </p>
        <Button disabled={query.trim() === ''} size="full" type="submit" variant="secondary">
          Cari area
        </Button>
      </form>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold">Area tersedia</legend>
        {results.length === 0 ? (
          <p className="rounded-button border border-border bg-surface p-3 text-sm text-muted">
            Tidak ada hasil yang dapat dipilih. Ubah kata pencarian lalu coba lagi.
          </p>
        ) : (
          results.map((result) => {
            const selectedResult = result.id === selectedId;
            return (
              <button
                aria-pressed={selectedResult}
                className={
                  selectedResult
                    ? 'flex min-h-14 items-center gap-3 rounded-button border border-interactive bg-surface-success px-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-focus'
                    : 'flex min-h-14 items-center gap-3 rounded-button border border-border bg-surface px-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-focus'
                }
                key={result.id}
                onClick={() => setSelectedId(result.id)}
                type="button"
              >
                <MapPin aria-hidden="true" className="size-5 shrink-0 text-brand" />
                <span className="min-w-0 flex-1">
                  <strong className="block text-sm">{result.label}</strong>
                  {result.secondaryLabel ? (
                    <span className="block text-[13px] text-muted">{result.secondaryLabel}</span>
                  ) : null}
                </span>
              </button>
            );
          })
        )}
      </fieldset>

      <div className="grid gap-2">
        <Button
          disabled={selected === null}
          onClick={() => {
            if (selected) activateManualLocation(selected);
          }}
          size="full"
          type="button"
        >
          Gunakan area ini
        </Button>
        <Button onClick={retryCurrentLocation} size="full" type="button" variant="ghost">
          <LocateFixed aria-hidden="true" className="size-5" />
          Coba gunakan GPS lagi
        </Button>
      </div>
    </section>
  );
}

function ManualLocationInvalidPanel() {
  const { openManualLocation } = useLocation();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <LocationStateCard
      description="Alamat terlalu umum atau tidak valid. Periksa kembali lalu coba lagi."
      headingRef={headingRef}
      icon={<SearchX className="size-7" />}
      title="Lokasi tidak ditemukan."
    >
      <div className="grid w-full gap-2 sm:grid-cols-2">
        <Button onClick={openManualLocation} size="full" type="button">
          Ubah lokasi
        </Button>
        <Button onClick={openManualLocation} size="full" type="button" variant="secondary">
          Coba lagi
        </Button>
      </div>
    </LocationStateCard>
  );
}

export function LocationExperience() {
  const { openManualLocation, requestCurrentLocation, retryCurrentLocation, state } = useLocation();

  if (state.status === 'CURRENT_LOCATION_ACTIVE' || state.status === 'MANUAL_LOCATION_ACTIVE') {
    return null;
  }

  if (state.status === 'MANUAL_LOCATION') return <ManualLocationPanel />;
  if (state.status === 'MANUAL_LOCATION_INVALID') return <ManualLocationInvalidPanel />;

  if (
    state.status === 'LOCATION_REQUESTING' ||
    state.status === 'PERMISSION_GRANTED' ||
    state.status === 'LOCATION_RETRYING'
  ) {
    return (
      <LocationStateCard
        description="PitStop hanya memakai koordinat ini di memori untuk pencarian saat ini."
        icon={<LocateFixed className="size-7 animate-pulse motion-reduce:animate-none" />}
        title={state.status === 'LOCATION_RETRYING' ? 'Mencoba lokasi lagi' : 'Mencari lokasi kamu'}
      >
        <p aria-live="polite" className="text-sm font-semibold text-brand" role="status">
          Menunggu hasil lokasi…
        </p>
        <Button onClick={openManualLocation} size="full" type="button" variant="ghost">
          Pilih area manual
        </Button>
      </LocationStateCard>
    );
  }

  if (state.status === 'PERMISSION_NOT_REQUESTED') {
    return (
      <LocationStateCard
        description="Aktifkan lokasi saat dibutuhkan, atau pilih area secara manual."
        icon={<MapPinOff className="size-7" />}
        title="Lokasi belum aktif"
      >
        <div className="grid w-full gap-2">
          <Button onClick={requestCurrentLocation} size="full" type="button">
            <LocateFixed aria-hidden="true" className="size-5" />
            Gunakan lokasi saya
          </Button>
          <Button onClick={openManualLocation} size="full" type="button" variant="secondary">
            Pilih area manual
          </Button>
        </div>
      </LocationStateCard>
    );
  }

  const copy =
    state.status === 'PERMISSION_DENIED'
      ? {
          description:
            'Izin lokasi ditolak oleh browser. Izinkan lokasi di pengaturan browser atau pilih area manual.',
          icon: <MapPinOff className="size-7" />,
          title: 'Lokasi belum aktif',
        }
      : state.status === 'LOCATION_TIMEOUT'
        ? {
            description:
              'Browser belum memberikan lokasi dalam batas waktu. Periksa sinyal lalu coba lagi.',
            icon: <Clock3 className="size-7" />,
            title: 'Pencarian lokasi terlalu lama',
          }
        : {
            description:
              'Perangkat tidak dapat menentukan lokasi saat ini. Kamu tetap dapat memilih area manual.',
            icon: <CircleAlert className="size-7" />,
            title: 'Lokasi tidak tersedia',
          };

  return (
    <LocationStateCard description={copy.description} icon={copy.icon} title={copy.title}>
      <div className="grid w-full gap-2">
        <Button onClick={retryCurrentLocation} size="full" type="button">
          Coba lagi
        </Button>
        <Button onClick={openManualLocation} size="full" type="button" variant="secondary">
          Pilih area manual
        </Button>
      </div>
    </LocationStateCard>
  );
}

export function ActiveLocationSummary() {
  const { activeLocation, resetLocation } = useLocation();
  if (!activeLocation) return null;

  return (
    <Card className="flex items-center gap-2.5 rounded-button p-3 shadow-none">
      <MapPin aria-hidden="true" className="size-6 shrink-0 text-brand" />
      <div aria-live="polite" className="min-w-0 flex-1">
        <p className="text-[13px] text-muted">
          {activeLocation.source === 'CURRENT' ? 'Lokasi saat ini' : 'Area manual'}
        </p>
        <p className="break-words text-sm font-semibold">{activeLocation.label}</p>
      </div>
      <Button
        aria-label="Ubah lokasi pencarian"
        className="min-h-10 px-2"
        onClick={resetLocation}
        size="compact"
        type="button"
        variant="ghost"
      >
        Ubah
      </Button>
    </Card>
  );
}
