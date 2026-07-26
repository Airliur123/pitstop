'use client';

import { Button, Card, FacilityChip, LinkButton, Skeleton } from '@pitstop/ui';
import { useQuery } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';

import { ApiProblem, getPlaceDetail } from '../lib/api/client';
import { formatRupiah, formatTime } from '../lib/format';
import { queryKeys } from '../lib/query-keys';
import { ApiErrorState } from './api-error-state';
import { GuestShell } from './guest-shell';

const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'] as const;

export function PlaceDetailView({ slug }: Readonly<{ slug: string }>) {
  const detail = useQuery({
    queryFn: ({ signal }) => getPlaceDetail(slug, signal),
    queryKey: queryKeys.detail(slug),
    staleTime: 60_000,
  });

  if (detail.isPending) {
    return (
      <GuestShell backHref="/places" title="Detail Tempat">
        <main
          aria-busy="true"
          aria-live="polite"
          className="grid gap-3 px-4 py-3"
          id="main-content"
        >
          <span className="sr-only">Memuat detail tempat</span>
          <Skeleton className="h-[201px]" />
          <Skeleton className="h-[142px]" />
          <Skeleton className="h-[160px]" />
        </main>
      </GuestShell>
    );
  }
  if (detail.isError) {
    if (detail.error instanceof ApiProblem && detail.error.status === 404) {
      return (
        <GuestShell backHref="/places" title="Detail Tempat">
          <main
            className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-12 text-center"
            id="main-content"
          >
            <h1 className="text-xl font-bold">Tempat tidak ditemukan</h1>
            <p className="text-sm text-muted">
              Tempat ini tidak tersedia atau belum memenuhi syarat publikasi.
            </p>
            <LinkButton href="/places" variant="secondary">
              Kembali ke rekomendasi
            </LinkButton>
          </main>
        </GuestShell>
      );
    }
    return (
      <GuestShell backHref="/places" title="Detail Tempat">
        <main className="px-4 py-12" id="main-content">
          <ApiErrorState error={detail.error} onRetry={() => void detail.refetch()} />
        </main>
      </GuestShell>
    );
  }

  const place = detail.data.data;
  const mainMenus = place.menus.filter((menu) => menu.isMainItem && menu.isAvailable);
  return (
    <GuestShell backHref="/places" title="Detail Tempat">
      <main className="grid gap-3 px-4 pb-28 pt-3" id="main-content">
        <div className="flex h-[201px] flex-col items-center justify-center gap-2 rounded-card bg-surface-navy text-inverse">
          <MapPin aria-hidden="true" className="size-6 opacity-80" />
          <p className="text-sm font-semibold">Foto {place.name}</p>
          <p className="px-4 text-center text-[13px] opacity-70">
            Foto belum tersedia. Informasi utama tetap dapat dibaca.
          </p>
        </div>

        <Card className="grid gap-1.5 p-3.5 shadow-none">
          <h1 className="break-words text-xl font-bold">{place.name}</h1>
          <p className="break-words text-[13px] text-muted">
            {place.categories.map((category) => category.name).join(' · ')}
          </p>
          <p className="text-sm font-semibold text-brand">
            {mainMenus.length > 0
              ? `Mulai ${formatRupiah(Math.min(...mainMenus.map((menu) => menu.priceAmount)))}`
              : 'Harga menu utama belum tersedia'}
          </p>
        </Card>

        <section className="rounded-card bg-surface p-3.5" aria-labelledby="menus-heading">
          <h2 className="mb-2 text-[15px] font-semibold" id="menus-heading">
            Menu dan harga
          </h2>
          {mainMenus.length > 0 ? (
            <ul className="grid gap-1.5">
              {mainMenus.map((menu) => (
                <li className="flex gap-2 text-sm" key={menu.id}>
                  <span className="min-w-0 flex-1 break-words">{menu.name}</span>
                  <strong className="shrink-0 text-brand">{formatRupiah(menu.priceAmount)}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Menu utama belum tersedia.</p>
          )}
        </section>

        <section className="rounded-card bg-surface p-3.5" aria-labelledby="facilities-heading">
          <h2 className="mb-2 text-[15px] font-semibold" id="facilities-heading">
            Fasilitas
          </h2>
          <div className="flex flex-wrap gap-2">
            {place.facilities.map((facility) => (
              <FacilityChip
                key={facility.code}
                label={facility.name}
                state={
                  facility.status === 'AVAILABLE'
                    ? 'available'
                    : facility.status === 'NOT_AVAILABLE'
                      ? 'unavailable'
                      : 'unknown'
                }
              />
            ))}
          </div>
        </section>

        <section className="rounded-card bg-surface p-3.5" aria-labelledby="hours-heading">
          <h2 className="mb-2 text-[15px] font-semibold" id="hours-heading">
            Jam operasional
          </h2>
          {place.operatingHours.length > 0 ? (
            <ul className="grid gap-1 text-[13px] text-muted">
              {place.operatingHours.map((hours) => (
                <li
                  className="flex justify-between gap-3"
                  key={`${hours.dayOfWeek}-${hours.sequence}`}
                >
                  <span>{dayNames[hours.dayOfWeek]}</span>
                  <span>
                    {hours.is24Hours
                      ? '24 jam'
                      : `${formatTime(hours.opensAt) ?? '—'}–${formatTime(hours.closesAt) ?? '—'}`}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted">Jam operasional belum diketahui.</p>
          )}
        </section>

        <section className="rounded-card bg-surface p-3.5" aria-labelledby="address-heading">
          <h2 className="mb-2 text-[15px] font-semibold" id="address-heading">
            Alamat dan verifikasi
          </h2>
          <address className="break-words text-[13px] not-italic text-muted">
            {place.address}, {place.district}, {place.city}
          </address>
          <p className="mt-2 text-[13px] text-muted">Terverifikasi admin · data publik aktif</p>
        </section>
      </main>
      <div className="fixed inset-x-0 bottom-0 z-[var(--pitstop-z-sticky)] mx-auto max-w-[430px] border-t border-border bg-surface px-4 py-3">
        <Button aria-describedby="directions-phase-note" className="w-full" disabled type="button">
          Arahkan Sekarang
        </Button>
        <p className="sr-only" id="directions-phase-note">
          Navigasi eksternal tersedia pada Phase 5.
        </p>
      </div>
    </GuestShell>
  );
}
