'use client';

import type { ApprovedPlacePatch, ReportStatus } from '@pitstop/contracts';
import { Alert, Button, Card, LinkButton, Skeleton, StatusBadge } from '@pitstop/ui';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';

import { ApiProblem, getPlaceReport } from '../lib/api/client';
import { queryKeys } from '../lib/query-keys';
import { useAuth } from './auth-provider';
import { GuestShell } from './guest-shell';

const statusCopy: Readonly<Record<ReportStatus, { description: string; title: string }>> = {
  APPLIED: {
    description: 'Perubahan yang disetujui sudah diterapkan pada data Place.',
    title: 'Perubahan diterapkan',
  },
  IN_REVIEW: {
    description: 'Admin sedang memeriksa laporan dan bukti yang kamu kirim.',
    title: 'Sedang diperiksa',
  },
  PENDING: {
    description: 'Laporan menunggu admin untuk memulai pemeriksaan.',
    title: 'Menunggu pemeriksaan',
  },
  REJECTED: {
    description: 'Laporan telah selesai diperiksa tanpa mengubah Place.',
    title: 'Tidak diterapkan',
  },
};

export function ReportDetailView({ reportId }: Readonly<{ reportId: string }>) {
  const auth = useAuth();
  const router = useRouter();
  const userId = auth.session?.authenticated ? auth.session.user.id : null;

  useEffect(() => {
    if (auth.status === 'unauthenticated') {
      router.replace(`/login?returnTo=${encodeURIComponent(`/reports/${reportId}`)}`);
    }
  }, [auth.status, reportId, router]);

  const reportQuery = useQuery({
    enabled: Boolean(userId),
    queryFn: ({ signal }) => getPlaceReport(reportId, signal),
    queryKey: userId
      ? queryKeys.report(userId, reportId)
      : ['private', 'reports', 'disabled', reportId],
    retry: false,
  });

  if (
    auth.status === 'loading' ||
    auth.status === 'unauthenticated' ||
    (userId && reportQuery.isPending)
  ) {
    return <ReportDetailLoading />;
  }
  if (auth.status === 'error') {
    return (
      <ReportDetailFrame>
        <Alert title="Status akun tidak tersedia" tone="danger">
          Sesi belum dapat diperiksa.
        </Alert>
        <Button onClick={() => void auth.refresh()} size="full">
          Coba lagi
        </Button>
      </ReportDetailFrame>
    );
  }
  if (reportQuery.isError) {
    const inaccessible =
      reportQuery.error instanceof ApiProblem &&
      (reportQuery.error.status === 404 || reportQuery.error.code === 'REPORT_NOT_FOUND');
    return (
      <ReportDetailFrame>
        <Alert
          title={inaccessible ? 'Laporan tidak ditemukan' : 'Detail belum dapat dimuat'}
          tone="danger"
        >
          {inaccessible
            ? 'Laporan tidak tersedia atau bukan milik akun ini.'
            : 'Periksa koneksi lalu coba lagi.'}
        </Alert>
        {!inaccessible ? (
          <Button onClick={() => void reportQuery.refetch()} size="full">
            Coba lagi
          </Button>
        ) : null}
        <LinkButton href="/activity" size="full" variant="secondary">
          Kembali ke Aktivitas
        </LinkButton>
      </ReportDetailFrame>
    );
  }

  const report = reportQuery.data?.data;
  if (!report) return <ReportDetailLoading />;
  const copy = statusCopy[report.status];

  return (
    <GuestShell backHref="/activity" title="Detail laporan">
      <main className="grid flex-1 content-start gap-4 px-4 py-6" id="main-content">
        <div className="grid gap-2">
          <StatusBadge status={statusBadge(report.status)} />
          <h1 className="text-2xl font-bold">{copy.title}</h1>
          <p className="text-sm text-muted">{copy.description}</p>
        </div>

        <Card className="grid gap-3">
          <h2 className="text-lg font-semibold">{report.place.name}</h2>
          <DetailRow label="Alamat" value={report.place.address} />
          <DetailRow label="Jenis laporan" value={report.reportType.replaceAll('_', ' ')} />
          <DetailRow label="Dikirim" value={formatDate(report.submittedAt)} />
          {report.reviewedAt ? (
            <DetailRow label="Ditinjau" value={formatDate(report.reviewedAt)} />
          ) : null}
          <LinkButton href={`/places/${report.place.slug}`} size="full" variant="secondary">
            Lihat Place
          </LinkButton>
        </Card>

        <Card className="grid gap-3">
          <h2 className="text-lg font-semibold">Laporan yang dikirim</h2>
          <p className="whitespace-pre-wrap text-sm">{report.explanation}</p>
          <PatchSummary patch={report.proposal} />
          {report.evidenceUrl ? (
            <a
              className="break-all text-sm font-semibold text-brand underline"
              href={report.evidenceUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              Buka URL bukti
              <span className="sr-only"> (buka tab baru)</span>
            </a>
          ) : null}
          {report.evidenceReference ? (
            <DetailRow label="Referensi bukti" value={report.evidenceReference} />
          ) : null}
        </Card>

        {report.resolution ? (
          <Alert
            title={report.status === 'APPLIED' ? 'Resolusi admin' : 'Alasan keputusan'}
            tone={report.status === 'APPLIED' ? 'success' : 'warning'}
          >
            {report.resolution}
          </Alert>
        ) : null}

        {report.status === 'APPLIED' && report.appliedChangeSummary ? (
          <Card className="grid gap-3">
            <h2 className="text-lg font-semibold">Ringkasan perubahan diterapkan</h2>
            <RecordSummary value={report.appliedChangeSummary} />
          </Card>
        ) : null}
      </main>
    </GuestShell>
  );
}

export function PatchSummary({ patch }: Readonly<{ patch: ApprovedPlacePatch }>) {
  const values = Object.entries(patch).filter(([key]) => key !== 'kind');
  return (
    <dl className="grid gap-2 rounded-card bg-app p-3 text-sm">
      {values.map(([key, value]) => (
        <div className="grid gap-0.5" key={key}>
          <dt className="text-muted">{key.replaceAll(/([A-Z])/g, ' $1')}</dt>
          <dd className="break-words font-semibold">
            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function RecordSummary({ value }: Readonly<{ value: Readonly<Record<string, unknown>> }>) {
  return (
    <dl className="grid gap-2 text-sm">
      {Object.entries(value).map(([key, item]) => (
        <div className="grid gap-0.5" key={key}>
          <dt className="text-muted">{key}</dt>
          <dd className="break-words font-semibold">
            {typeof item === 'object' ? JSON.stringify(item) : String(item)}
          </dd>
        </div>
      ))}
    </dl>
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

function statusBadge(status: ReportStatus): 'approved' | 'pending' | 'rejected' | 'reviewing' {
  if (status === 'APPLIED') return 'approved';
  if (status === 'REJECTED') return 'rejected';
  if (status === 'IN_REVIEW') return 'reviewing';
  return 'pending';
}

function ReportDetailFrame({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <GuestShell backHref="/activity" title="Detail laporan">
      <main className="grid flex-1 content-start gap-4 px-4 py-6" id="main-content">
        {children}
      </main>
    </GuestShell>
  );
}

function ReportDetailLoading() {
  return (
    <GuestShell backHref="/activity" title="Detail laporan">
      <main aria-busy="true" className="grid gap-4 px-4 py-6" id="main-content">
        <span className="sr-only">Memuat detail laporan</span>
        <Skeleton className="h-28" />
        <Skeleton className="h-56" />
      </main>
    </GuestShell>
  );
}
