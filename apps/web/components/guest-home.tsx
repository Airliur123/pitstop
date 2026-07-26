'use client';

import type { PublicCategory, PublicCategoryCode } from '@pitstop/contracts';
import { Button, Card, Sheet, Skeleton } from '@pitstop/ui';
import { useQuery } from '@tanstack/react-query';
import { Armchair, Coffee, Landmark, MapPin, Soup, Toilet } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { useGuestPreferences } from '../hooks/use-guest-preferences';
import { getCategories, getRecommendations } from '../lib/api/client';
import { formatRupiah } from '../lib/format';
import { getLocationContext } from '../lib/location';
import { GUEST_BUDGET_PRESETS, type GuestBudgetPreset } from '../lib/preferences';
import { queryKeys } from '../lib/query-keys';
import { ApiErrorState } from './api-error-state';
import { FallbackState } from './fallback-state';
import { GuestShell } from './guest-shell';
import { PlaceResultCard } from './place-result-card';

const categoryIcons = {
  ISTIRAHAT: Armchair,
  MAKAN_MURAH: Soup,
  MUSALA: Landmark,
  NGOPI: Coffee,
  TOILET: Toilet,
} satisfies Record<PublicCategoryCode, typeof Coffee>;

function CategorySelector({
  categories,
  onChange,
  selected,
}: Readonly<{
  categories: readonly PublicCategory[];
  onChange: (code: PublicCategoryCode) => void;
  selected: PublicCategoryCode | null;
}>) {
  return (
    <fieldset>
      <legend className="mb-3 font-semibold">Pilih kebutuhan</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {categories.map((category) => {
          const Icon = categoryIcons[category.code];
          const active = category.code === selected;
          return (
            <button
              aria-pressed={active}
              className={
                active
                  ? 'flex min-h-28 flex-col items-center justify-center gap-1 rounded-button border border-interactive bg-surface-success px-2 font-semibold text-brand outline-none focus-visible:ring-2 focus-visible:ring-focus'
                  : 'flex min-h-28 flex-col items-center justify-center gap-1 rounded-button border border-border bg-surface px-2 font-semibold text-muted outline-none focus-visible:ring-2 focus-visible:ring-focus'
              }
              key={category.id}
              onClick={() => onChange(category.code)}
              type="button"
            >
              <Icon aria-hidden="true" className="size-6" />
              {category.name}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function BudgetSelector({
  budgetAmount,
  onChange,
}: Readonly<{
  budgetAmount: GuestBudgetPreset | null;
  onChange: (value: GuestBudgetPreset) => void;
}>) {
  return (
    <Sheet
      description="Pilih batas harga menu utama untuk pencarian ini."
      title="Pilih budget"
      trigger={
        <Button className="w-full justify-between" type="button" variant="secondary">
          <span>Ubah budget</span>
          <span>{budgetAmount === null ? 'Belum dipilih' : `≤ ${formatRupiah(budgetAmount)}`}</span>
        </Button>
      }
    >
      <fieldset>
        <legend className="mb-3 text-sm font-semibold">Budget aktif untuk menu utama</legend>
        <div className="grid grid-cols-2 gap-2">
          {GUEST_BUDGET_PRESETS.map((amount) => (
            <button
              aria-pressed={budgetAmount === amount}
              className={
                budgetAmount === amount
                  ? 'min-h-12 rounded-button border border-interactive bg-interactive px-3 font-semibold text-inverse outline-none focus-visible:ring-2 focus-visible:ring-focus'
                  : 'min-h-12 rounded-button border border-border bg-surface px-3 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-focus'
              }
              key={amount}
              onClick={() => onChange(amount)}
              type="button"
            >
              ≤ {formatRupiah(amount)}
            </button>
          ))}
        </div>
      </fieldset>
    </Sheet>
  );
}

export function GuestHome() {
  const router = useRouter();
  const location = useMemo(() => getLocationContext(), []);
  const { budgetAmount, hydrated, setBudgetAmount } = useGuestPreferences();
  const [selectedCode, setSelectedCode] = useState<PublicCategoryCode | null>(null);

  const categories = useQuery({
    queryFn: ({ signal }) => getCategories(signal),
    queryKey: queryKeys.categories(),
    staleTime: 5 * 60_000,
  });

  const defaultCategory =
    categories.data?.data.find((category) => category.isPrimary) ?? categories.data?.data[0];
  const effectiveSelectedCode = selectedCode ?? defaultCategory?.code ?? null;
  const selectedCategory = categories.data?.data.find(
    (category) => category.code === effectiveSelectedCode,
  );
  const canSearch =
    hydrated &&
    location.status === 'READY' &&
    Boolean(selectedCategory) &&
    (!selectedCategory?.supportsBudget || budgetAmount !== null);
  const recommendationInput =
    location.status === 'READY' && effectiveSelectedCode
      ? {
          budgetAmount: selectedCategory?.supportsBudget ? budgetAmount : null,
          category: effectiveSelectedCode,
          latitude: location.latitude,
          limit: 1,
          longitude: location.longitude,
          radiusMeters: 5_000,
        }
      : null;
  const preview = useQuery({
    enabled: canSearch && recommendationInput !== null,
    queryFn: ({ signal }) => {
      if (recommendationInput === null) throw new Error('Recommendation input is unavailable.');
      return getRecommendations(recommendationInput, signal);
    },
    queryKey: recommendationInput
      ? queryKeys.recommendations(recommendationInput)
      : ['public', 'recommendations', 'disabled'],
  });

  const openResults = () => {
    if (!effectiveSelectedCode || !canSearch) return;
    const query = new URLSearchParams({ category: effectiveSelectedCode });
    if (selectedCategory?.supportsBudget && budgetAmount !== null) {
      query.set('budget', String(budgetAmount));
    }
    router.push(`/places?${query.toString()}`);
  };

  return (
    <GuestShell bottomNavigation>
      <main className="flex flex-1 flex-col gap-4 px-4 py-3" id="main-content">
        <h1 className="sr-only">Cari tempat singgah dengan PitStop</h1>
        <Card className="flex items-center gap-2.5 rounded-button p-3 shadow-none">
          <MapPin aria-hidden="true" className="size-6 shrink-0 text-muted" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-muted">Konteks lokasi</p>
            <p className="break-words text-sm font-semibold">
              {location.status === 'READY' ? location.label : 'Lokasi belum tersedia'}
            </p>
          </div>
        </Card>
        {location.status === 'READY' ? (
          <p className="rounded-button bg-surface-warning px-3 py-2 text-[13px] text-foreground">
            Data Simulasi — koordinat preview development, bukan lokasi GPS kamu.
          </p>
        ) : (
          <p className="rounded-button bg-surface-warning px-3 py-2 text-[13px] text-foreground">
            Preview lokasi tidak aktif. Browser geolocation dan lokasi manual baru tersedia pada
            Phase 5.
          </p>
        )}

        {categories.isPending ? (
          <div aria-busy="true" aria-live="polite">
            <span className="sr-only">Memuat kategori</span>
            <Skeleton className="h-56" />
          </div>
        ) : categories.isError ? (
          <ApiErrorState error={categories.error} onRetry={() => void categories.refetch()} />
        ) : (
          <CategorySelector
            categories={categories.data.data}
            onChange={setSelectedCode}
            selected={effectiveSelectedCode}
          />
        )}

        {selectedCategory?.supportsBudget ? (
          <BudgetSelector budgetAmount={budgetAmount} onChange={setBudgetAmount} />
        ) : null}

        <section
          className="flex flex-col gap-3 rounded-card bg-interactive p-4 text-inverse"
          aria-labelledby="search-summary"
        >
          <h2 className="text-xl font-bold" id="search-summary">
            {selectedCategory?.name ?? 'Pilih kebutuhan'}
            {selectedCategory?.supportsBudget && budgetAmount !== null
              ? ` ≤ ${formatRupiah(budgetAmount)}`
              : ''}
          </h2>
          <p className="text-[13px] text-inverse">Radius utama rekomendasi 5 km</p>
          <Button disabled={!canSearch} onClick={openResults} type="button" variant="secondary">
            Cari Sekarang
          </Button>
        </section>

        <section aria-labelledby="preview-heading" className="grid gap-3">
          <h2 className="font-semibold" id="preview-heading">
            Pilihan terdekat untukmu
          </h2>
          {!canSearch ? (
            <p className="text-sm text-muted">
              Lengkapi kategori, budget yang diperlukan, dan konteks lokasi untuk melihat preview.
            </p>
          ) : preview.isPending ? (
            <div aria-busy="true" aria-live="polite">
              <span className="sr-only">Mencari satu rekomendasi terdekat</span>
              <Skeleton className="h-[244px]" />
            </div>
          ) : preview.isError ? (
            <ApiErrorState error={preview.error} onRetry={() => void preview.refetch()} />
          ) : preview.data.meta.fallback ? (
            <FallbackState fallback={preview.data.meta.fallback} />
          ) : preview.data.data.primary ? (
            <PlaceResultCard place={preview.data.data.primary} />
          ) : (
            <p className="text-sm text-muted">Belum ada rekomendasi untuk pencarian ini.</p>
          )}
        </section>
      </main>
    </GuestShell>
  );
}
