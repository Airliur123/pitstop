'use client';

import type {
  ApprovedPlacePatch,
  ContributionCategory,
  ContributionFacilityCode,
  ContributionFacilityStatus,
  PublicMenuItem,
  ReportType,
} from '@pitstop/contracts';
import { Alert, Button, Card, FormField, Input, LinkButton, Skeleton, Textarea } from '@pitstop/ui';
import { type CreateReportInput, createReportSchema } from '@pitstop/validation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import { createPlaceReport, getPlaceDetail } from '../lib/api/client';
import { queryKeys } from '../lib/query-keys';
import { useAuth } from './auth-provider';
import { GuestShell } from './guest-shell';

const fieldClass =
  'min-h-12 w-full rounded-button border border-border bg-surface px-3.5 text-base outline-none focus-visible:ring-2 focus-visible:ring-focus';

const reportLabels: Readonly<Record<ReportType, string>> = {
  CATEGORY_INCORRECT: 'Kategori salah',
  DUPLICATE_PLACE: 'Tempat duplikat',
  FACILITY_CHANGED: 'Fasilitas salah',
  HOURS_CHANGED: 'Jam buka salah',
  LOCATION_INCORRECT: 'Lokasi atau alamat salah',
  OTHER: 'Koreksi faktual lain',
  PERMANENTLY_CLOSED: 'Tutup permanen',
  PRICE_CHANGED: 'Harga atau menu salah',
  TEMPORARILY_CLOSED: 'Tutup sementara',
};

interface ReportFields {
  readonly address: string;
  readonly categoryCode: ContributionCategory;
  readonly city: string;
  readonly closesAt: string;
  readonly dayOfWeek: string;
  readonly description: string;
  readonly district: string;
  readonly duplicatePlaceId: string;
  readonly facilityCode: ContributionFacilityCode;
  readonly facilityStatus: ContributionFacilityStatus;
  readonly landmark: string;
  readonly latitude: string;
  readonly longitude: string;
  readonly menuName: string;
  readonly menuId: string;
  readonly name: string;
  readonly opensAt: string;
  readonly postalCode: string;
  readonly priceAmount: string;
  readonly province: string;
}

const initialFields: ReportFields = {
  address: '',
  categoryCode: 'MAKAN_MURAH',
  city: '',
  closesAt: '17:00',
  dayOfWeek: '1',
  description: '',
  district: '',
  duplicatePlaceId: '',
  facilityCode: 'PARKING',
  facilityStatus: 'AVAILABLE',
  landmark: '',
  latitude: '',
  longitude: '',
  menuName: '',
  menuId: '',
  name: '',
  opensAt: '08:00',
  postalCode: '',
  priceAmount: '',
  province: '',
};

export function ReportChangeFlow({ slug }: Readonly<{ slug: string }>) {
  const auth = useAuth();
  const router = useRouter();
  const idempotencyKey = useRef<string | null>(null);
  const [reportType, setReportType] = useState<ReportType>('LOCATION_INCORRECT');
  const [explanation, setExplanation] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [fields, setFields] = useState<ReportFields>(initialFields);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (auth.status === 'unauthenticated') {
      router.replace(`/login?returnTo=${encodeURIComponent(`/places/${slug}/report`)}`);
    }
  }, [auth.status, router, slug]);

  const placeQuery = useQuery({
    queryFn: ({ signal }) => getPlaceDetail(slug, signal),
    queryKey: queryKeys.detail(slug),
    staleTime: 0,
  });
  const mutation = useMutation({
    mutationFn: (input: CreateReportInput) => {
      const place = placeQuery.data?.data;
      if (!place) throw new Error('Place detail unavailable');
      idempotencyKey.current ??= globalThis.crypto.randomUUID();
      return createPlaceReport(place.id, input, idempotencyKey.current);
    },
    onSuccess: (response) => router.replace(`/reports/${response.data.id}/success`),
  });

  if (auth.status === 'loading' || auth.status === 'unauthenticated' || placeQuery.isPending) {
    return <ReportLoading />;
  }

  if (auth.status === 'error' || placeQuery.isError || !placeQuery.data) {
    return (
      <ReportFrame slug={slug}>
        <Alert title="Form laporan belum dapat dimuat" tone="danger">
          Periksa koneksi dan status akun, lalu coba lagi.
        </Alert>
        <Button onClick={() => void placeQuery.refetch()} size="full">
          Coba lagi
        </Button>
      </ReportFrame>
    );
  }

  const place = placeQuery.data.data;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError(null);
    const candidate = {
      ...(evidenceReference.trim() ? { evidenceReference: evidenceReference.trim() } : {}),
      ...(evidenceUrl.trim() ? { evidenceUrl: evidenceUrl.trim() } : {}),
      expectedPlaceVersion: place.version,
      explanation,
      proposedChange: buildPatch(reportType, fields),
      reportType,
    };
    const parsed = createReportSchema.safeParse(candidate);
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? 'Periksa kembali data laporan.');
      return;
    }
    mutation.mutate(parsed.data);
  }

  return (
    <GuestShell backHref={`/places/${slug}`} title="Laporkan perubahan">
      <main className="grid flex-1 content-start gap-4 px-4 py-6" id="main-content">
        <div>
          <h1 className="text-2xl font-bold">Laporkan perubahan</h1>
          <p className="mt-1 text-sm text-muted">
            Laporan untuk <strong>{place.name}</strong> akan diperiksa admin dan tidak langsung
            mengubah data publik.
          </p>
        </div>

        <form className="grid gap-4" noValidate onSubmit={submit}>
          {validationError ? (
            <Alert title="Laporan belum dapat dikirim" tone="danger">
              {validationError}
            </Alert>
          ) : null}
          {mutation.isError ? (
            <Alert title="Pengiriman gagal" tone="danger">
              Laporan belum tersimpan. Koreksi data bila perlu lalu coba lagi.
            </Alert>
          ) : null}

          <Card className="grid gap-4">
            <label className="grid gap-1.5 text-sm font-semibold" htmlFor="report-type">
              Jenis perubahan
              <select
                className={fieldClass}
                id="report-type"
                onChange={(event) => {
                  setReportType(event.target.value as ReportType);
                  setValidationError(null);
                }}
                value={reportType}
              >
                {Object.entries(reportLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <PatchFields
              fields={fields}
              menus={place.menus}
              onChange={(next) => setFields((current) => ({ ...current, ...next }))}
              reportType={reportType}
            />
          </Card>

          <Card className="grid gap-4">
            <FormField
              description="Jelaskan fakta yang perlu diperbaiki tanpa data pribadi."
              label="Penjelasan"
              required
            >
              {(properties) => (
                <Textarea
                  {...properties}
                  maxLength={1_000}
                  onChange={(event) => setExplanation(event.target.value)}
                  value={explanation}
                />
              )}
            </FormField>
            <FormField
              description="Hanya HTTPS publik. Server tidak akan membuka URL ini."
              label="URL bukti (opsional)"
            >
              {(properties) => (
                <Input
                  {...properties}
                  inputMode="url"
                  maxLength={1_000}
                  onChange={(event) => setEvidenceUrl(event.target.value)}
                  placeholder="https://..."
                  value={evidenceUrl}
                />
              )}
            </FormField>
            <FormField label="Referensi bukti (opsional)">
              {(properties) => (
                <Textarea
                  {...properties}
                  maxLength={500}
                  onChange={(event) => setEvidenceReference(event.target.value)}
                  value={evidenceReference}
                />
              )}
            </FormField>
          </Card>

          <Button disabled={mutation.isPending} size="full" type="submit">
            {mutation.isPending ? 'Mengirim…' : 'Kirim laporan'}
          </Button>
          <LinkButton href={`/places/${slug}`} size="full" variant="secondary">
            Batal
          </LinkButton>
        </form>
      </main>
    </GuestShell>
  );
}

function PatchFields({
  fields,
  menus,
  onChange,
  reportType,
}: Readonly<{
  fields: ReportFields;
  menus: readonly PublicMenuItem[];
  onChange: (value: Partial<ReportFields>) => void;
  reportType: ReportType;
}>) {
  if (reportType === 'PRICE_CHANGED') {
    return (
      <>
        <label className="grid gap-1.5 text-sm font-semibold" htmlFor="report-menu">
          Menu yang dikoreksi
          <select
            className={fieldClass}
            id="report-menu"
            onChange={(event) => onChange({ menuId: event.target.value })}
            value={fields.menuId}
          >
            <option value="">Menu baru atau belum terdaftar</option>
            {menus.map((menu) => (
              <option key={menu.id} value={menu.id}>
                {menu.name} · Rp{menu.priceAmount.toLocaleString('id-ID')}
              </option>
            ))}
          </select>
        </label>
        <TextInput
          label="Nama menu"
          onChange={(menuName) => onChange({ menuName })}
          value={fields.menuName}
        />
        <TextInput
          inputMode="numeric"
          label="Harga baru (rupiah)"
          onChange={(priceAmount) => onChange({ priceAmount })}
          value={fields.priceAmount}
        />
      </>
    );
  }
  if (reportType === 'HOURS_CHANGED') {
    return (
      <div className="grid grid-cols-2 gap-3">
        <TextInput
          inputMode="numeric"
          label="Hari (0 Minggu–6 Sabtu)"
          onChange={(dayOfWeek) => onChange({ dayOfWeek })}
          value={fields.dayOfWeek}
        />
        <span />
        <TextInput
          label="Buka (HH:mm)"
          onChange={(opensAt) => onChange({ opensAt })}
          value={fields.opensAt}
        />
        <TextInput
          label="Tutup (HH:mm)"
          onChange={(closesAt) => onChange({ closesAt })}
          value={fields.closesAt}
        />
      </div>
    );
  }
  if (reportType === 'LOCATION_INCORRECT') {
    return (
      <>
        <TextInput
          label="Alamat yang benar"
          onChange={(address) => onChange({ address })}
          value={fields.address}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextInput
            label="Kecamatan"
            onChange={(district) => onChange({ district })}
            value={fields.district}
          />
          <TextInput label="Kota" onChange={(city) => onChange({ city })} value={fields.city} />
          <TextInput
            label="Provinsi"
            onChange={(province) => onChange({ province })}
            value={fields.province}
          />
          <TextInput
            label="Kode pos"
            onChange={(postalCode) => onChange({ postalCode })}
            value={fields.postalCode}
          />
          <TextInput
            inputMode="decimal"
            label="Latitude (opsional)"
            onChange={(latitude) => onChange({ latitude })}
            value={fields.latitude}
          />
          <TextInput
            inputMode="decimal"
            label="Longitude (opsional)"
            onChange={(longitude) => onChange({ longitude })}
            value={fields.longitude}
          />
        </div>
      </>
    );
  }
  if (reportType === 'CATEGORY_INCORRECT') {
    return (
      <NativeSelectField
        label="Kategori yang benar"
        onChange={(categoryCode) =>
          onChange({ categoryCode: categoryCode as ContributionCategory })
        }
        options={['MAKAN_MURAH', 'NGOPI', 'TOILET', 'MUSALA', 'ISTIRAHAT']}
        value={fields.categoryCode}
      />
    );
  }
  if (reportType === 'FACILITY_CHANGED') {
    return (
      <div className="grid grid-cols-2 gap-3">
        <NativeSelectField
          label="Fasilitas"
          onChange={(facilityCode) =>
            onChange({ facilityCode: facilityCode as ContributionFacilityCode })
          }
          options={['PARKING', 'TOILET', 'MUSALA', 'POWER_OUTLET', 'SEATING', 'SHADE', 'WIFI']}
          value={fields.facilityCode}
        />
        <NativeSelectField
          label="Kondisi"
          onChange={(facilityStatus) =>
            onChange({ facilityStatus: facilityStatus as ContributionFacilityStatus })
          }
          options={['AVAILABLE', 'NOT_AVAILABLE', 'UNKNOWN']}
          value={fields.facilityStatus}
        />
      </div>
    );
  }
  if (reportType === 'DUPLICATE_PLACE') {
    return (
      <TextInput
        label="ID tempat yang sama"
        onChange={(duplicatePlaceId) => onChange({ duplicatePlaceId })}
        value={fields.duplicatePlaceId}
      />
    );
  }
  if (reportType === 'OTHER') {
    return (
      <>
        <TextInput
          label="Nama yang benar (opsional)"
          onChange={(name) => onChange({ name })}
          value={fields.name}
        />
        <TextInput
          label="Patokan yang benar (opsional)"
          onChange={(landmark) => onChange({ landmark })}
          value={fields.landmark}
        />
        <FormField label="Deskripsi yang benar (opsional)">
          {(properties) => (
            <Textarea
              {...properties}
              maxLength={2_000}
              onChange={(event) => onChange({ description: event.target.value })}
              value={fields.description}
            />
          )}
        </FormField>
      </>
    );
  }
  return (
    <Alert title="Perubahan status tempat" tone="warning">
      Admin akan memeriksa status penutupan sebelum menerapkannya.
    </Alert>
  );
}

function buildPatch(reportType: ReportType, fields: ReportFields): ApprovedPlacePatch {
  switch (reportType) {
    case 'PRICE_CHANGED':
      return {
        kind: reportType,
        ...(fields.menuId ? { menuId: fields.menuId } : {}),
        ...(fields.menuName.trim() ? { menuName: fields.menuName.trim() } : {}),
        ...(fields.priceAmount ? { priceAmount: Number(fields.priceAmount) } : {}),
      };
    case 'HOURS_CHANGED':
      return {
        kind: reportType,
        operatingHours: [
          {
            closesAt: fields.closesAt,
            dayOfWeek: Number(fields.dayOfWeek),
            is24Hours: false,
            isClosed: false,
            opensAt: fields.opensAt,
          },
        ],
      };
    case 'LOCATION_INCORRECT':
      return {
        kind: reportType,
        ...(fields.address.trim() ? { address: fields.address.trim() } : {}),
        ...(fields.city.trim() ? { city: fields.city.trim() } : {}),
        ...(fields.district.trim() ? { district: fields.district.trim() } : {}),
        ...(fields.latitude ? { latitude: Number(fields.latitude) } : {}),
        ...(fields.longitude ? { longitude: Number(fields.longitude) } : {}),
        ...(fields.postalCode.trim() ? { postalCode: fields.postalCode.trim() } : {}),
        ...(fields.province.trim() ? { province: fields.province.trim() } : {}),
      };
    case 'CATEGORY_INCORRECT':
      return { categoryCode: fields.categoryCode, kind: reportType };
    case 'FACILITY_CHANGED':
      return {
        facilityCode: fields.facilityCode,
        kind: reportType,
        status: fields.facilityStatus,
      };
    case 'TEMPORARILY_CLOSED':
      return { kind: reportType, placeStatus: 'TEMPORARILY_CLOSED' };
    case 'PERMANENTLY_CLOSED':
      return { kind: reportType, placeStatus: 'PERMANENTLY_CLOSED' };
    case 'DUPLICATE_PLACE':
      return {
        duplicatePlaceId: fields.duplicatePlaceId.trim(),
        kind: reportType,
        placeStatus: 'ARCHIVED',
      };
    case 'OTHER':
      return {
        kind: reportType,
        ...(fields.description.trim() ? { description: fields.description.trim() } : {}),
        ...(fields.landmark.trim() ? { landmark: fields.landmark.trim() } : {}),
        ...(fields.name.trim() ? { name: fields.name.trim() } : {}),
      };
  }
}

function TextInput({
  inputMode,
  label,
  onChange,
  value,
}: Readonly<{
  inputMode?: 'decimal' | 'numeric';
  label: string;
  onChange: (value: string) => void;
  value: string;
}>) {
  return (
    <FormField label={label}>
      {(properties) => (
        <Input
          {...properties}
          {...(inputMode ? { inputMode } : {})}
          onChange={(event) => onChange(event.target.value)}
          value={value}
        />
      )}
    </FormField>
  );
}

function NativeSelectField({
  label,
  onChange,
  options,
  value,
}: Readonly<{
  label: string;
  onChange: (value: string) => void;
  options: readonly string[];
  value: string;
}>) {
  const id = `report-${label.toLowerCase().replaceAll(' ', '-')}`;
  return (
    <label className="grid gap-1.5 text-sm font-semibold" htmlFor={id}>
      {label}
      <select
        className={fieldClass}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option.replaceAll('_', ' ')}
          </option>
        ))}
      </select>
    </label>
  );
}

function ReportFrame({ children, slug }: Readonly<{ children: React.ReactNode; slug: string }>) {
  return (
    <GuestShell backHref={`/places/${slug}`} title="Laporkan perubahan">
      <main className="grid flex-1 content-start gap-4 px-4 py-6" id="main-content">
        {children}
      </main>
    </GuestShell>
  );
}

function ReportLoading() {
  return (
    <GuestShell backHref="/places" title="Laporkan perubahan">
      <main aria-busy="true" className="grid gap-4 px-4 py-6" id="main-content">
        <span className="sr-only">Memuat form laporan</span>
        <Skeleton className="h-20" />
        <Skeleton className="h-72" />
        <Skeleton className="h-48" />
      </main>
    </GuestShell>
  );
}
