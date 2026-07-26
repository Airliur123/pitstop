import type { RecommendationFallback, RecommendationFallbackReason } from '@pitstop/contracts';
import { Card, LinkButton } from '@pitstop/ui';
import { CircleAlert, Clock3, Map, SearchX } from 'lucide-react';
import type { ReactNode } from 'react';

import { formatDistance, formatRupiah } from '../lib/format';

const content: Record<
  RecommendationFallbackReason,
  { body: (fallback: RecommendationFallback) => ReactNode; title: string }
> = {
  ALL_PLACES_CLOSED: {
    body: () =>
      'Tempat yang cocok sedang tutup. Kamu tetap bisa melihat semua tempat terverifikasi.',
    title: 'Semua tempat sedang tutup',
  },
  BUDGET_TOO_LOW: {
    body: (fallback) =>
      fallback.minimumRequiredBudgetAmount
        ? `Menu utama terdekat mulai ${formatRupiah(fallback.minimumRequiredBudgetAmount)}.`
        : 'Belum ada menu utama yang cocok dengan budget ini.',
    title: 'Belum ada yang sesuai budget',
  },
  NO_CATEGORY_MATCH: {
    body: () => 'Belum ada tempat terverifikasi untuk kategori ini di area pencarian.',
    title: 'Kategori belum tersedia',
  },
  NO_VERIFIED_MATCH: {
    body: () => 'Data yang memenuhi syarat verifikasi belum tersedia di sekitar lokasi ini.',
    title: 'Belum ada data terverifikasi',
  },
  OUTSIDE_RADIUS: {
    body: (fallback) =>
      fallback.nearestDistanceMeters !== undefined
        ? `Kandidat terdekat berjarak ${formatDistance(fallback.nearestDistanceMeters)}, di luar radius normal 5 km.`
        : 'Kandidat terdekat berada di luar radius normal 5 km.',
    title: 'Belum ada tempat sesuai dalam radius 5 km',
  },
};

export function FallbackState({
  action,
  fallback,
}: Readonly<{ action?: ReactNode; fallback: RecommendationFallback }>) {
  const copy = content[fallback.reason];
  const Icon =
    fallback.reason === 'ALL_PLACES_CLOSED'
      ? Clock3
      : fallback.reason === 'OUTSIDE_RADIUS'
        ? Map
        : fallback.reason === 'BUDGET_TOO_LOW'
          ? CircleAlert
          : SearchX;
  return (
    <Card
      className={
        fallback.reason === 'OUTSIDE_RADIUS' || fallback.reason === 'BUDGET_TOO_LOW'
          ? 'flex min-h-[260px] flex-col items-center justify-center gap-3 bg-surface-warning px-5 py-6 text-center'
          : 'flex min-h-[260px] flex-col items-center justify-center gap-3 px-5 py-6 text-center'
      }
    >
      <span className="flex size-14 items-center justify-center rounded-card bg-surface-success text-brand">
        <Icon aria-hidden="true" className="size-6" />
      </span>
      <h2 className="text-lg font-bold">{copy.title}</h2>
      <p className="max-w-72 text-[13px] text-muted">{copy.body(fallback)}</p>
      {action ?? (
        <LinkButton href="/" variant="ghost">
          Ubah pencarian
        </LinkButton>
      )}
    </Card>
  );
}
