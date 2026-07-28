'use client';

import type {
  ContributionCategory,
  ContributionDetail,
  ContributionDraftPayload,
  ContributionFacilityCode,
  ContributionFacilityStatus,
  ContributionOperatingHour,
} from '@pitstop/contracts';
import {
  Alert,
  Button,
  Card,
  FacilityChip,
  FormField,
  Input,
  LinkButton,
  Progress,
  Skeleton,
  StatusBadge,
  Textarea,
} from '@pitstop/ui';
import {
  canonicalizeContributionDraft,
  contributionFacilitiesByCategory,
  contributionStepOneSchema,
  contributionStepTwoSchema,
  contributionSubmissionSchema,
  normalizeContributionFacilities,
} from '@pitstop/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import type { z } from 'zod';

import {
  ApiProblem,
  createContribution,
  getContribution,
  submitContribution,
  updateContribution,
} from '../lib/api/client';
import { queryKeys } from '../lib/query-keys';
import { useAuth } from './auth-provider';
import { GuestShell } from './guest-shell';

const categoryLabels: Readonly<Record<ContributionCategory, string>> = {
  MAKAN_MURAH: 'Makan Murah',
  NGOPI: 'Ngopi',
  TOILET: 'Toilet',
  MUSALA: 'Musala',
  ISTIRAHAT: 'Istirahat',
};

const facilityLabels: Readonly<Record<ContributionFacilityCode, string>> = {
  PARKING: 'Parkir',
  TOILET: 'Toilet',
  MUSALA: 'Musala',
  POWER_OUTLET: 'Colokan',
  SEATING: 'Tempat duduk',
  SHADE: 'Area teduh',
  WIFI: 'Wi-Fi',
};

const dayLabels = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'] as const;

type Step = 1 | 2 | 3;
type ErrorMap = Readonly<Record<string, string>>;
type HourMode = 'CLOSED' | 'OPEN' | 'TWENTY_FOUR_HOURS' | 'UNKNOWN';

export function ContributionFlow() {
  const auth = useAuth();
  const router = useRouter();
  const searchParameters = useSearchParams();
  const queryClient = useQueryClient();
  const contributionId = searchParameters.get('id');
  const step = parseStep(searchParameters.get('step'));
  const userId = auth.session?.authenticated ? auth.session.user.id : null;
  const [form, setForm] = useState<ContributionDraftPayload>({
    facilities: normalizeContributionFacilities(undefined),
  });
  const [errors, setErrors] = useState<ErrorMap>({});
  const [saveNotice, setSaveNotice] = useState(false);
  const creationStarted = useRef(false);
  const creationKey = useRef<string | null>(null);
  const loadedVersion = useRef<number | null>(null);
  const headingReference = useRef<HTMLHeadingElement>(null);
  const errorSummaryReference = useRef<HTMLDivElement>(null);
  const submitKey = useRef<string | null>(null);
  const submitStarted = useRef(false);

  useEffect(() => {
    if (auth.status === 'unauthenticated') {
      router.replace('/login?returnTo=%2Fcontribute');
    }
  }, [auth.status, router]);

  const createDraftMutation = useMutation({
    mutationFn: () => {
      creationKey.current ??= clientIdempotencyKey();
      return createContribution({ payload: sanitizeDraftForApi(form) }, creationKey.current);
    },
    onSuccess: (response) => {
      router.replace(`/contribute?id=${response.data.id}&step=1`);
    },
  });

  useEffect(() => {
    if (auth.status === 'authenticated' && !contributionId && !creationStarted.current) {
      creationStarted.current = true;
      createDraftMutation.mutate();
    }
  }, [auth.status, contributionId, createDraftMutation]);

  const detailQuery = useQuery({
    enabled: Boolean(userId && contributionId),
    queryFn: ({ signal }) => getContribution(contributionId ?? '', signal),
    queryKey:
      userId && contributionId
        ? queryKeys.contribution(userId, contributionId)
        : ['private', 'contributions', 'disabled'],
    retry: false,
  });
  const detail = detailQuery.data?.data;

  useEffect(() => {
    if (detail && loadedVersion.current !== detail.version) {
      setForm(canonicalizeContributionDraft(detail.payload));
      loadedVersion.current = detail.version;
    }
  }, [detail]);

  useEffect(() => {
    headingReference.current?.focus();
  }, [step]);

  const saveMutation = useMutation({
    mutationFn: async (input: {
      readonly expectedVersion: number;
      readonly payload: ContributionDraftPayload;
    }) => {
      if (!contributionId) throw new Error('Contribution draft is unavailable');
      return updateContribution(contributionId, input);
    },
    onSuccess: (response) => {
      if (!userId) return;
      queryClient.setQueryData(queryKeys.contribution(userId, response.data.id), response);
      loadedVersion.current = response.data.version;
      setForm(canonicalizeContributionDraft(response.data.payload));
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (expectedVersion: number) => {
      if (!contributionId) throw new Error('Contribution draft is unavailable');
      submitKey.current ??= clientIdempotencyKey();
      return submitContribution(contributionId, { expectedVersion }, submitKey.current);
    },
    onSuccess: (response) => {
      if (userId) {
        queryClient.setQueryData(queryKeys.contribution(userId, response.data.id), response);
      }
      router.replace(`/contributions/${response.data.id}/success`);
    },
    onSettled: () => {
      submitStarted.current = false;
    },
  });

  const facilities = useMemo(
    () => normalizeContributionFacilities(form.facilities),
    [form.facilities],
  );

  if (
    auth.status === 'loading' ||
    auth.status === 'unauthenticated' ||
    createDraftMutation.isPending ||
    (contributionId && detailQuery.isPending)
  ) {
    return <ContributionLoading />;
  }

  if (auth.status === 'error') {
    return (
      <ContributionFrame>
        <Alert title="Layanan akun tidak tersedia" tone="danger">
          Status sesi belum dapat diperiksa. Coba lagi saat koneksi membaik.
        </Alert>
        <Button onClick={() => void auth.refresh()} size="full">
          Coba lagi
        </Button>
      </ContributionFrame>
    );
  }

  if (createDraftMutation.isError || detailQuery.isError || !detail) {
    return (
      <ContributionFrame>
        <Alert title="Draft belum dapat dimuat" tone="danger">
          Periksa koneksi lalu coba lagi. Data yang sudah tersimpan tetap aman.
        </Alert>
        <Button
          onClick={() => {
            if (contributionId) void detailQuery.refetch();
            else {
              creationStarted.current = false;
              createDraftMutation.reset();
              router.refresh();
            }
          }}
          size="full"
        >
          Coba lagi
        </Button>
        <LinkButton href="/" size="full" variant="secondary">
          Kembali ke beranda
        </LinkButton>
      </ContributionFrame>
    );
  }

  if (detail.status !== 'DRAFT') {
    return (
      <ContributionFrame>
        <StatusBadge status="pending" />
        <Alert title="Kontribusi sudah dikirim" tone="warning">
          Data ini sedang menunggu pemeriksaan dan tidak dapat diubah lagi.
        </Alert>
        <LinkButton href={`/contributions/${detail.id}`} size="full">
          Lihat detail kontribusi
        </LinkButton>
      </ContributionFrame>
    );
  }

  const currentDetail = detail;
  const serverError = saveMutation.error ?? submitMutation.error;
  const busy = saveMutation.isPending || submitMutation.isPending;

  async function saveDraft(payload = form): Promise<ContributionDetail | null> {
    setSaveNotice(false);
    const draft = sanitizeDraftForApi(payload);
    const draftResult = await saveMutation.mutateAsync({
      expectedVersion: currentDetail.version,
      payload: draft,
    });
    setSaveNotice(true);
    return draftResult.data;
  }

  function validate(schema: z.ZodType): boolean {
    const result = schema.safeParse(sanitizeDraftForApi(form));
    if (result.success) {
      setErrors({});
      return true;
    }
    setErrors(issuesToErrors(result.error.issues));
    queueMicrotask(() => errorSummaryReference.current?.focus());
    return false;
  }

  async function navigate(next: Step) {
    const schema = step === 1 ? contributionStepOneSchema : contributionStepTwoSchema;
    if (next > step && !validate(schema)) return;
    try {
      await saveDraft();
      router.replace(`/contribute?id=${currentDetail.id}&step=${next}`);
    } catch {
      // Mutation state renders the typed network or API failure.
    }
  }

  async function submit() {
    if (submitStarted.current) return;
    const finalCheck = contributionSubmissionSchema.safeParse(sanitizeDraftForApi(form));
    if (!finalCheck.success) {
      setErrors(issuesToErrors(finalCheck.error.issues));
      queueMicrotask(() => errorSummaryReference.current?.focus());
      return;
    }
    submitStarted.current = true;
    try {
      const saved = await saveDraft();
      if (saved) await submitMutation.mutateAsync(saved.version);
    } catch {
      submitStarted.current = false;
    }
  }

  return (
    <GuestShell backHref="/" title="Tambah tempat">
      <main className="grid flex-1 content-start gap-5 px-4 py-6" id="main-content">
        <Progress label={`Langkah ${step} dari 3`} value={Math.round((step / 3) * 100)} />
        <div className="grid gap-1">
          <h1 className="text-2xl font-bold outline-none" ref={headingReference} tabIndex={-1}>
            {stepTitle(step)}
          </h1>
          <p className="text-sm text-muted">{stepDescription(step)}</p>
        </div>

        {Object.keys(errors).length > 0 ? (
          <div
            className="rounded-card border border-danger bg-surface p-4 text-sm"
            ref={errorSummaryReference}
            role="alert"
            tabIndex={-1}
          >
            <p className="font-semibold text-danger">Periksa kembali data berikut:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {Object.entries(errors).map(([field, message]) => (
                <li key={field}>{message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {serverError ? <ContributionMutationError error={serverError} /> : null}
        {saveNotice && !serverError ? (
          <Alert title="Draft tersimpan" tone="success">
            Perubahan sudah aman di server.
          </Alert>
        ) : null}

        {step === 1 ? (
          <StepOne
            errors={errors}
            form={form}
            onCategoryChange={(category) => {
              const next = changeCategoryDraft(form, category);
              if (
                next.losesData &&
                !globalThis.confirm(
                  'Mengganti kategori akan menghapus data yang tidak lagi relevan. Lanjutkan?',
                )
              ) {
                return;
              }
              setForm(next.payload);
              setErrors({});
            }}
            onChange={setForm}
          />
        ) : null}

        {step === 2 && form.category ? (
          <StepTwo
            category={form.category}
            errors={errors}
            facilities={facilities}
            form={form}
            onChange={setForm}
          />
        ) : null}

        {step === 3 ? <StepThree form={sanitizeDraftForApi(form)} /> : null}

        <div className="grid gap-2 border-t border-border pt-4">
          {step > 1 ? (
            <Button
              disabled={busy}
              onClick={() => void navigate((step - 1) as Step)}
              size="full"
              variant="secondary"
            >
              Kembali
            </Button>
          ) : null}
          <Button
            disabled={busy}
            loading={saveMutation.isPending && !submitMutation.isPending}
            loadingLabel="Menyimpan draft…"
            onClick={() => void saveDraft().catch(() => undefined)}
            size="full"
            variant="ghost"
          >
            Simpan draft
          </Button>
          {step < 3 ? (
            <Button disabled={busy} onClick={() => void navigate((step + 1) as Step)} size="full">
              Lanjutkan
            </Button>
          ) : (
            <Button
              disabled={busy}
              loading={submitMutation.isPending}
              loadingLabel="Mengirim kontribusi…"
              onClick={() => void submit()}
              size="full"
            >
              Kirim kontribusi
            </Button>
          )}
        </div>
      </main>
    </GuestShell>
  );
}

function StepOne({
  errors,
  form,
  onCategoryChange,
  onChange,
}: Readonly<{
  errors: ErrorMap;
  form: ContributionDraftPayload;
  onCategoryChange: (category: ContributionCategory) => void;
  onChange: (payload: ContributionDraftPayload) => void;
}>) {
  return (
    <section aria-labelledby="basic-information-heading" className="grid gap-4">
      <h2 className="text-lg font-semibold" id="basic-information-heading">
        Informasi dasar
      </h2>
      <FormField error={errors.placeName} label="Nama tempat" required>
        {(properties) => (
          <Input
            {...properties}
            autoComplete="organization"
            maxLength={180}
            onChange={(event) => onChange({ ...form, placeName: event.target.value })}
            value={form.placeName ?? ''}
          />
        )}
      </FormField>
      <fieldset className="grid gap-2">
        <legend className="text-[13px] font-semibold">
          Kategori{' '}
          <span aria-hidden="true" className="text-danger">
            *
          </span>
          <span className="sr-only"> (wajib)</span>
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(categoryLabels) as ContributionCategory[]).map((category) => (
            <Button
              aria-pressed={form.category === category}
              className="min-w-0"
              key={category}
              onClick={() => onCategoryChange(category)}
              variant={form.category === category ? 'primary' : 'secondary'}
            >
              {categoryLabels[category]}
            </Button>
          ))}
        </div>
        {errors.category ? (
          <p className="text-[13px] text-danger" role="alert">
            {errors.category}
          </p>
        ) : null}
      </fieldset>
      <FormField
        description="Tuliskan alamat atau deskripsi lokasi tempat, bukan lokasi GPS pribadi."
        error={errors.address}
        label="Alamat atau lokasi"
        required
      >
        {(properties) => (
          <Textarea
            {...properties}
            maxLength={500}
            onChange={(event) => onChange({ ...form, address: event.target.value })}
            value={form.address ?? ''}
          />
        )}
      </FormField>
      <FormField error={errors.landmark} label="Patokan (opsional)">
        {(properties) => (
          <Input
            {...properties}
            maxLength={255}
            onChange={(event) => onChange({ ...form, landmark: event.target.value })}
            value={form.landmark ?? ''}
          />
        )}
      </FormField>
      <FormField
        description="Hanya tautan Google Maps http/https."
        error={errors.mapsUrl}
        label="Tautan Google Maps (opsional)"
      >
        {(properties) => (
          <Input
            {...properties}
            inputMode="url"
            maxLength={1_000}
            onChange={(event) => onChange({ ...form, mapsUrl: event.target.value })}
            type="url"
            value={form.mapsUrl ?? ''}
          />
        )}
      </FormField>
    </section>
  );
}

function StepTwo({
  category,
  errors,
  facilities,
  form,
  onChange,
}: Readonly<{
  category: ContributionCategory;
  errors: ErrorMap;
  facilities: ReturnType<typeof normalizeContributionFacilities>;
  form: ContributionDraftPayload;
  onChange: (payload: ContributionDraftPayload) => void;
}>) {
  const usesPrice = category === 'MAKAN_MURAH' || category === 'NGOPI';
  const relevantFacilities = contributionFacilitiesByCategory[category];

  return (
    <div className="grid gap-6">
      {usesPrice ? (
        <section aria-labelledby="price-heading" className="grid gap-4">
          <div>
            <h2 className="text-lg font-semibold" id="price-heading">
              Menu termurah
            </h2>
            <p className="text-sm text-muted">Isi harga tempat, bukan budget pencarian pribadi.</p>
          </div>
          <FormField
            error={errors['mainMenu.name'] ?? errors.mainMenu}
            label="Nama menu termurah"
            required
          >
            {(properties) => (
              <Input
                {...properties}
                maxLength={180}
                onChange={(event) =>
                  onChange({
                    ...form,
                    mainMenu: { ...form.mainMenu, name: event.target.value },
                  })
                }
                value={form.mainMenu?.name ?? ''}
              />
            )}
          </FormField>
          <FormField
            error={errors['mainMenu.priceAmount'] ?? errors.mainMenu}
            label="Harga menu termurah (rupiah)"
            required
          >
            {(properties) => (
              <Input
                {...properties}
                inputMode="numeric"
                max={10_000_000}
                min={1}
                onChange={(event) =>
                  onChange({
                    ...form,
                    mainMenu: {
                      ...form.mainMenu,
                      priceAmount:
                        event.target.value === '' ? undefined : Number(event.target.value),
                    },
                  })
                }
                step={1}
                type="number"
                value={form.mainMenu?.priceAmount ?? ''}
              />
            )}
          </FormField>
        </section>
      ) : (
        <Alert title="Kategori tanpa data menu">
          Kategori {categoryLabels[category]} tidak meminta menu atau budget makanan.
        </Alert>
      )}

      <section aria-labelledby="facilities-heading" className="grid gap-3">
        <div>
          <h2 className="text-lg font-semibold" id="facilities-heading">
            Fasilitas
          </h2>
          <p className="text-sm text-muted">Pilih “Belum diketahui” bila kamu belum yakin.</p>
        </div>
        {relevantFacilities.map((code) => {
          const facility = facilities.find((item) => item.code === code);
          return (
            <label className="grid gap-1.5" key={code}>
              <span className="text-[13px] font-semibold">{facilityLabels[code]}</span>
              <select
                aria-label={`${facilityLabels[code]} tersedia`}
                className="min-h-12 rounded-button border border-border bg-surface px-3.5 text-base"
                onChange={(event) =>
                  onChange({
                    ...form,
                    facilities: facilities.map((item) =>
                      item.code === code
                        ? {
                            ...item,
                            status: event.target.value as ContributionFacilityStatus,
                          }
                        : item,
                    ),
                  })
                }
                value={facility?.status ?? 'UNKNOWN'}
              >
                <option value="UNKNOWN">Belum diketahui</option>
                <option value="AVAILABLE">Tersedia</option>
                <option value="NOT_AVAILABLE">Tidak tersedia</option>
              </select>
            </label>
          );
        })}
      </section>

      <OperatingHoursEditor form={form} onChange={onChange} />

      <FormField error={errors.notes} label="Catatan tambahan (opsional)">
        {(properties) => (
          <Textarea
            {...properties}
            maxLength={1_000}
            onChange={(event) => onChange({ ...form, notes: event.target.value })}
            value={form.notes ?? ''}
          />
        )}
      </FormField>
    </div>
  );
}

function OperatingHoursEditor({
  form,
  onChange,
}: Readonly<{
  form: ContributionDraftPayload;
  onChange: (payload: ContributionDraftPayload) => void;
}>) {
  const hours = form.operatingHours ?? [];
  return (
    <section aria-labelledby="hours-heading" className="grid gap-3">
      <div>
        <h2 className="text-lg font-semibold" id="hours-heading">
          Jam operasional (opsional)
        </h2>
        <p className="text-sm text-muted">
          Biarkan “Belum diketahui” bila jadwal belum pasti. Jam melewati tengah malam didukung.
        </p>
      </div>
      {dayLabels.map((day, dayOfWeek) => {
        const value = hours.find((hour) => hour.dayOfWeek === dayOfWeek);
        const mode = hourMode(value);
        return (
          <Card className="grid gap-3" key={day}>
            <label className="grid gap-1">
              <span className="text-sm font-semibold">{day}</span>
              <select
                aria-label={`Jadwal ${day}`}
                className="min-h-12 rounded-button border border-border bg-surface px-3"
                onChange={(event) =>
                  onChange({
                    ...form,
                    operatingHours: setHourMode(hours, dayOfWeek, event.target.value as HourMode),
                  })
                }
                value={mode}
              >
                <option value="UNKNOWN">Belum diketahui</option>
                <option value="OPEN">Buka pada jam tertentu</option>
                <option value="TWENTY_FOUR_HOURS">Buka 24 jam</option>
                <option value="CLOSED">Tutup</option>
              </select>
            </label>
            {mode === 'OPEN' && value ? (
              <div className="grid grid-cols-2 gap-2">
                <FormField label={`Jam buka ${day}`}>
                  {(properties) => (
                    <Input
                      {...properties}
                      onChange={(event) =>
                        onChange({
                          ...form,
                          operatingHours: updateHourTime(
                            hours,
                            dayOfWeek,
                            'opensAt',
                            event.target.value,
                          ),
                        })
                      }
                      type="time"
                      value={value.opensAt ?? '08:00'}
                    />
                  )}
                </FormField>
                <FormField label={`Jam tutup ${day}`}>
                  {(properties) => (
                    <Input
                      {...properties}
                      onChange={(event) =>
                        onChange({
                          ...form,
                          operatingHours: updateHourTime(
                            hours,
                            dayOfWeek,
                            'closesAt',
                            event.target.value,
                          ),
                        })
                      }
                      type="time"
                      value={value.closesAt ?? '17:00'}
                    />
                  )}
                </FormField>
              </div>
            ) : null}
          </Card>
        );
      })}
    </section>
  );
}

function StepThree({ form }: Readonly<{ form: ContributionDraftPayload }>) {
  const relevantFacilities = form.category ? contributionFacilitiesByCategory[form.category] : [];
  return (
    <div className="grid gap-4">
      <Alert title="Periksa sebelum mengirim" tone="warning">
        Setelah dikirim, kontribusi tidak dapat diedit dan belum langsung tampil publik.
      </Alert>
      <ReviewSection title="Informasi tempat">
        <ReviewRow label="Nama" value={form.placeName ?? 'Belum diisi'} />
        <ReviewRow
          label="Kategori"
          value={form.category ? categoryLabels[form.category] : 'Belum dipilih'}
        />
        <ReviewRow label="Alamat" value={form.address ?? 'Belum diisi'} />
        {form.landmark ? <ReviewRow label="Patokan" value={form.landmark} /> : null}
        {form.mapsUrl ? <ReviewRow label="Google Maps" value={form.mapsUrl} /> : null}
      </ReviewSection>
      {form.mainMenu?.name && form.mainMenu.priceAmount ? (
        <ReviewSection title="Harga">
          <ReviewRow label="Menu termurah" value={form.mainMenu.name} />
          <ReviewRow label="Harga" value={formatRupiah(form.mainMenu.priceAmount)} />
        </ReviewSection>
      ) : null}
      <ReviewSection title="Fasilitas">
        <div className="flex flex-wrap gap-2">
          {normalizeContributionFacilities(form.facilities)
            .filter(({ code }) => relevantFacilities.includes(code))
            .map((facility) => (
              <FacilityChip
                key={facility.code}
                label={facilityLabels[facility.code]}
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
      </ReviewSection>
      <ReviewSection title="Jam operasional">
        {form.operatingHours && form.operatingHours.length > 0 ? (
          <ul className="grid gap-2 text-sm">
            {[...form.operatingHours]
              .sort((left, right) => left.dayOfWeek - right.dayOfWeek)
              .map((hour) => (
                <li className="flex justify-between gap-3" key={hour.dayOfWeek}>
                  <span>{dayLabels[hour.dayOfWeek]}</span>
                  <strong>{formatHour(hour)}</strong>
                </li>
              ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Belum diketahui</p>
        )}
      </ReviewSection>
      {form.notes ? (
        <ReviewSection title="Catatan">
          <p className="whitespace-pre-wrap text-sm">{form.notes}</p>
        </ReviewSection>
      ) : null}
    </div>
  );
}

function ReviewSection({ children, title }: Readonly<{ children: ReactNode; title: string }>) {
  return (
    <Card className="grid gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </Card>
  );
}

function ReviewRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="grid gap-0.5 text-sm">
      <span className="text-muted">{label}</span>
      <strong className="break-words">{value}</strong>
    </div>
  );
}

function ContributionMutationError({ error }: Readonly<{ error: Error }>) {
  if (error instanceof ApiProblem && error.code === 'CONTRIBUTION_VERSION_CONFLICT') {
    return (
      <Alert title="Draft berubah di tab lain" tone="warning">
        Muat ulang halaman sebelum melanjutkan agar perubahan terbaru tidak tertimpa.
      </Alert>
    );
  }
  return (
    <Alert title="Perubahan belum tersimpan" tone="danger">
      Koneksi atau layanan sedang bermasalah. Coba lagi; submit tidak akan diduplikasi.
    </Alert>
  );
}

function ContributionFrame({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <GuestShell backHref="/" title="Tambah tempat">
      <main className="grid flex-1 content-start gap-4 px-4 py-6" id="main-content">
        {children}
      </main>
    </GuestShell>
  );
}

function ContributionLoading() {
  return (
    <GuestShell backHref="/" title="Tambah tempat">
      <main
        aria-busy="true"
        className="grid flex-1 content-start gap-4 px-4 py-6"
        id="main-content"
      >
        <span className="sr-only">Memuat draft kontribusi</span>
        <Skeleton className="h-20" />
        <Skeleton className="h-52" />
      </main>
    </GuestShell>
  );
}

export function sanitizeDraftForApi(payload: ContributionDraftPayload): ContributionDraftPayload {
  const cleanText = (value: string | undefined) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  };
  const menuName = cleanText(payload.mainMenu?.name);
  const mainMenu =
    menuName || payload.mainMenu?.priceAmount !== undefined
      ? {
          ...(menuName ? { name: menuName } : {}),
          ...(payload.mainMenu?.priceAmount === undefined
            ? {}
            : { priceAmount: payload.mainMenu.priceAmount }),
        }
      : undefined;
  return canonicalizeContributionDraft({
    ...(cleanText(payload.address) ? { address: cleanText(payload.address) } : {}),
    ...(payload.category ? { category: payload.category } : {}),
    facilities: normalizeContributionFacilities(payload.facilities),
    ...(cleanText(payload.landmark) ? { landmark: cleanText(payload.landmark) } : {}),
    ...(mainMenu ? { mainMenu } : {}),
    ...(cleanText(payload.mapsUrl) ? { mapsUrl: cleanText(payload.mapsUrl) } : {}),
    ...(cleanText(payload.notes) ? { notes: cleanText(payload.notes) } : {}),
    ...(payload.operatingHours ? { operatingHours: payload.operatingHours } : {}),
    ...(cleanText(payload.placeName) ? { placeName: cleanText(payload.placeName) } : {}),
  });
}

export function changeCategoryDraft(
  payload: ContributionDraftPayload,
  category: ContributionCategory,
): { readonly losesData: boolean; readonly payload: ContributionDraftPayload } {
  const allowedFacilities = new Set(contributionFacilitiesByCategory[category]);
  const facilities = normalizeContributionFacilities(payload.facilities);
  const losesFacilityData = facilities.some(
    (facility) => !allowedFacilities.has(facility.code) && facility.status !== 'UNKNOWN',
  );
  const supportsPrice = category === 'MAKAN_MURAH' || category === 'NGOPI';
  const losesMenuData = !supportsPrice && Boolean(payload.mainMenu);
  return {
    losesData: losesFacilityData || losesMenuData,
    payload: canonicalizeContributionDraft({
      ...payload,
      category,
      facilities: facilities.map((facility) =>
        allowedFacilities.has(facility.code) ? facility : { ...facility, status: 'UNKNOWN' },
      ),
      ...(supportsPrice ? {} : { mainMenu: undefined }),
    }),
  };
}

function parseStep(value: string | null): Step {
  return value === '2' ? 2 : value === '3' ? 3 : 1;
}

function stepTitle(step: Step): string {
  return step === 1 ? 'Ceritakan tempatnya' : step === 2 ? 'Lengkapi detail' : 'Tinjau kontribusi';
}

function stepDescription(step: Step): string {
  return step === 1
    ? 'Nama, kategori, dan lokasi membantu moderator mengenali tempat.'
    : step === 2
      ? 'Isi harga, fasilitas, dan jam yang kamu ketahui.'
      : 'Pastikan semua informasi sudah sesuai sebelum dikirim.';
}

function issuesToErrors(issues: readonly z.core.$ZodIssue[]): ErrorMap {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const field = issue.path.map(String).join('.') || 'payload';
    errors[field] ??= issue.message;
  }
  return errors;
}

function clientIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}

function hourMode(hour: ContributionOperatingHour | undefined): HourMode {
  if (!hour) return 'UNKNOWN';
  if (hour.isClosed) return 'CLOSED';
  if (hour.is24Hours) return 'TWENTY_FOUR_HOURS';
  return 'OPEN';
}

function setHourMode(
  hours: readonly ContributionOperatingHour[],
  dayOfWeek: number,
  mode: HourMode,
): readonly ContributionOperatingHour[] {
  const remaining = hours.filter((hour) => hour.dayOfWeek !== dayOfWeek);
  if (mode === 'UNKNOWN') return remaining;
  const next: ContributionOperatingHour =
    mode === 'CLOSED'
      ? { closesAt: null, dayOfWeek, is24Hours: false, isClosed: true, opensAt: null }
      : mode === 'TWENTY_FOUR_HOURS'
        ? { closesAt: null, dayOfWeek, is24Hours: true, isClosed: false, opensAt: null }
        : {
            closesAt: '17:00',
            dayOfWeek,
            is24Hours: false,
            isClosed: false,
            opensAt: '08:00',
          };
  return [...remaining, next].sort((left, right) => left.dayOfWeek - right.dayOfWeek);
}

function updateHourTime(
  hours: readonly ContributionOperatingHour[],
  dayOfWeek: number,
  field: 'closesAt' | 'opensAt',
  value: string,
): readonly ContributionOperatingHour[] {
  return hours.map((hour) => (hour.dayOfWeek === dayOfWeek ? { ...hour, [field]: value } : hour));
}

function formatRupiah(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    currency: 'IDR',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value);
}

function formatHour(hour: ContributionOperatingHour): string {
  if (hour.isClosed) return 'Tutup';
  if (hour.is24Hours) return '24 jam';
  return `${hour.opensAt ?? '—'}–${hour.closesAt ?? '—'}`;
}
