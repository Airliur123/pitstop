'use client';

import type {
  ContributionCategory,
  ContributionDetail,
  ContributionFacilityCode,
  ContributionOperatingHour,
  ContributionStatus,
} from '@pitstop/contracts';
import { Alert, Button, Card, FacilityChip, LinkButton, Skeleton, StatusBadge } from '@pitstop/ui';
import { normalizeContributionFacilities } from '@pitstop/validation';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';

import { ApiProblem, getContribution } from '../lib/api/client';
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

const statusCopy: Readonly<
  Record<ContributionStatus, { readonly description: string; readonly title: string }>
> = {
  DRAFT: {
    description: 'Draft hanya terlihat olehmu dan masih dapat dilanjutkan.',
    title: 'Draft',
  },
  PENDING: {
    description: 'Data sedang menunggu pemeriksaan dan belum tampil publik.',
    title: 'Menunggu pemeriksaan',
  },
  IN_REVIEW: {
    description: 'Data sedang diperiksa. Moderasi tetap berada di fase berikutnya.',
    title: 'Sedang diperiksa',
  },
  NEEDS_REVISION: {
    description: 'Data memerlukan perbaikan, tetapi alur revisi belum tersedia pada Phase 7.',
    title: 'Perlu perbaikan',
  },
  APPROVED: {
    description: 'Status disetujui dikenali sebagai data read-only untuk kompatibilitas.',
    title: 'Disetujui',
  },
  REJECTED: {
    description: 'Status ditolak dikenali sebagai data read-only untuk kompatibilitas.',
    title: 'Ditolak',
  },
  MERGED: {
    description: 'Status digabung dikenali sebagai data read-only untuk kompatibilitas.',
    title: 'Digabung',
  },
};

export function ContributionDetailView({ contributionId }: Readonly<{ contributionId: string }>) {
  const auth = useAuth();
  const router = useRouter();
  const userId = auth.session?.authenticated ? auth.session.user.id : null;

  useEffect(() => {
    if (auth.status === 'unauthenticated') {
      router.replace(`/login?returnTo=${encodeURIComponent(`/contributions/${contributionId}`)}`);
    }
  }, [auth.status, contributionId, router]);

  const detailQuery = useQuery({
    enabled: Boolean(userId),
    queryFn: ({ signal }) => getContribution(contributionId, signal),
    queryKey: userId
      ? queryKeys.contribution(userId, contributionId)
      : ['private', 'contributions', 'disabled'],
    retry: false,
  });

  if (
    auth.status === 'loading' ||
    auth.status === 'unauthenticated' ||
    (userId && detailQuery.isPending)
  ) {
    return <DetailLoading />;
  }

  if (auth.status === 'error') {
    return (
      <DetailFrame>
        <Alert title="Layanan akun tidak tersedia" tone="danger">
          Status sesi belum dapat diperiksa.
        </Alert>
        <Button onClick={() => void auth.refresh()} size="full">
          Coba lagi
        </Button>
      </DetailFrame>
    );
  }

  if (detailQuery.isError) {
    const unavailable =
      detailQuery.error instanceof ApiProblem &&
      detailQuery.error.code === 'CONTRIBUTION_NOT_FOUND';
    return (
      <DetailFrame>
        <Alert
          title={unavailable ? 'Kontribusi tidak ditemukan' : 'Detail belum dapat dimuat'}
          tone="danger"
        >
          {unavailable
            ? 'Kontribusi tidak tersedia atau tidak dapat diakses oleh akun ini.'
            : 'Periksa koneksi lalu coba lagi.'}
        </Alert>
        {!unavailable ? (
          <Button onClick={() => void detailQuery.refetch()} size="full">
            Coba lagi
          </Button>
        ) : null}
        <LinkButton href="/" size="full" variant="secondary">
          Kembali ke beranda
        </LinkButton>
      </DetailFrame>
    );
  }

  const contribution = detailQuery.data?.data;
  if (!contribution) return <DetailLoading />;
  const copy = statusCopy[contribution.status];

  return (
    <GuestShell backHref="/" title="Detail kontribusi">
      <main className="grid flex-1 content-start gap-5 px-4 py-6" id="main-content">
        <div className="grid gap-3">
          <StatusBadge status={statusBadge(contribution.status)} />
          <div>
            <h1 className="text-2xl font-bold">{copy.title}</h1>
            <p className="mt-1 text-sm text-muted">{copy.description}</p>
          </div>
        </div>

        <Card className="grid gap-3">
          <h2 className="text-lg font-semibold">Waktu kontribusi</h2>
          <DetailRow label="Dibuat" value={formatDate(contribution.createdAt)} />
          <DetailRow
            label="Dikirim"
            value={
              contribution.submittedAt ? formatDate(contribution.submittedAt) : 'Belum dikirim'
            }
          />
        </Card>

        <ContributionPayloadDetail contribution={contribution} />

        {contribution.status === 'DRAFT' ? (
          <LinkButton href={`/contribute?id=${contribution.id}&step=1`} size="full">
            Lanjutkan edit
          </LinkButton>
        ) : (
          <Alert title="Data bersifat read-only" tone="warning">
            Kontributor tidak dapat mengubah data setelah dikirim. Tindakan moderasi tidak tersedia
            pada Phase 7.
          </Alert>
        )}
        <LinkButton href="/" size="full" variant="secondary">
          Kembali ke beranda
        </LinkButton>
      </main>
    </GuestShell>
  );
}

function ContributionPayloadDetail({
  contribution,
}: Readonly<{ contribution: ContributionDetail }>) {
  const { payload } = contribution;
  return (
    <>
      <Card className="grid gap-3">
        <h2 className="text-lg font-semibold">Informasi tempat</h2>
        <DetailRow label="Nama" value={payload.placeName ?? 'Belum diisi'} />
        <DetailRow
          label="Kategori"
          value={payload.category ? categoryLabels[payload.category] : 'Belum dipilih'}
        />
        <DetailRow label="Alamat" value={payload.address ?? 'Belum diisi'} />
        {payload.landmark ? <DetailRow label="Patokan" value={payload.landmark} /> : null}
        {payload.mapsUrl ? <DetailRow label="Google Maps" value={payload.mapsUrl} /> : null}
      </Card>

      {payload.mainMenu?.name || payload.mainMenu?.priceAmount ? (
        <Card className="grid gap-3">
          <h2 className="text-lg font-semibold">Harga</h2>
          <DetailRow label="Menu termurah" value={payload.mainMenu.name ?? 'Belum diisi'} />
          <DetailRow
            label="Harga"
            value={
              payload.mainMenu.priceAmount
                ? formatRupiah(payload.mainMenu.priceAmount)
                : 'Belum diisi'
            }
          />
        </Card>
      ) : null}

      <Card className="grid gap-3">
        <h2 className="text-lg font-semibold">Fasilitas</h2>
        <div className="flex flex-wrap gap-2">
          {normalizeContributionFacilities(payload.facilities).map((facility) => (
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
      </Card>

      <Card className="grid gap-3">
        <h2 className="text-lg font-semibold">Jam operasional</h2>
        {payload.operatingHours && payload.operatingHours.length > 0 ? (
          <ul className="grid gap-2 text-sm">
            {[...payload.operatingHours]
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
      </Card>

      {payload.notes ? (
        <Card className="grid gap-3">
          <h2 className="text-lg font-semibold">Catatan</h2>
          <p className="whitespace-pre-wrap text-sm">{payload.notes}</p>
        </Card>
      ) : null}
    </>
  );
}

function DetailRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="grid gap-0.5 text-sm">
      <span className="text-muted">{label}</span>
      <strong className="break-words">{value}</strong>
    </div>
  );
}

function DetailFrame({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <GuestShell backHref="/" title="Detail kontribusi">
      <main className="grid flex-1 content-start gap-4 px-4 py-6" id="main-content">
        {children}
      </main>
    </GuestShell>
  );
}

function DetailLoading() {
  return (
    <GuestShell backHref="/" title="Detail kontribusi">
      <main
        aria-busy="true"
        className="grid flex-1 content-start gap-4 px-4 py-6"
        id="main-content"
      >
        <span className="sr-only">Memuat detail kontribusi</span>
        <Skeleton className="h-28" />
        <Skeleton className="h-56" />
      </main>
    </GuestShell>
  );
}

function statusBadge(status: ContributionStatus) {
  return status === 'DRAFT'
    ? 'unknown'
    : status === 'PENDING'
      ? 'pending'
      : status === 'IN_REVIEW'
        ? 'reviewing'
        : status === 'NEEDS_REVISION'
          ? 'revision'
          : status === 'APPROVED' || status === 'MERGED'
            ? 'approved'
            : 'rejected';
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value));
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
