'use client';

import type { ActivityItem, ActivityType } from '@pitstop/contracts';
import { Alert, Button, Card, EmptyState, LinkButton, Skeleton, StatusBadge } from '@pitstop/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { getActivity } from '../lib/api/client';
import { queryKeys } from '../lib/query-keys';
import { useAuth } from './auth-provider';
import { GuestShell } from './guest-shell';

const controlClass =
  'min-h-12 rounded-button border border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus';

export function UserActivityView() {
  const auth = useAuth();
  const [type, setType] = useState<ActivityType | ''>('');
  const [status, setStatus] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [cursorHistory, setCursorHistory] = useState<readonly (string | undefined)[]>([]);
  const [logoutError, setLogoutError] = useState(false);
  const userId = auth.session?.authenticated ? auth.session.user.id : null;
  const input = {
    ...(cursor ? { cursor } : {}),
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
  };
  const activity = useQuery({
    enabled: Boolean(userId),
    queryFn: ({ signal }) => getActivity(input, signal),
    queryKey: userId ? queryKeys.activity(userId, input) : ['private', 'activity', 'guest'],
    retry: false,
  });

  function resetPagination() {
    setCursor(undefined);
    setCursorHistory([]);
  }

  if (auth.status === 'loading') return <ActivityLoading />;
  if (auth.status === 'error') {
    return (
      <ActivityFrame>
        <Alert title="Aktivitas belum dapat dimuat" tone="danger">
          Status sesi tidak tersedia.
        </Alert>
        <Button onClick={() => void auth.refresh()} size="full">
          Coba lagi
        </Button>
      </ActivityFrame>
    );
  }
  if (auth.status === 'unauthenticated') {
    return (
      <ActivityFrame>
        <EmptyState
          action={
            <LinkButton href="/login?returnTo=%2Factivity" size="full">
              Masuk
            </LinkButton>
          }
          title="Aktivitas tersimpan di akun"
        >
          Masuk untuk melihat kontribusi, laporan, dan konfirmasi milikmu. Aktivitas tidak bersifat
          publik.
        </EmptyState>
      </ActivityFrame>
    );
  }

  const response = activity.data?.data;
  return (
    <GuestShell bottomNavigation navigationCurrent="activity" title="Aktivitas">
      <main className="grid flex-1 content-start gap-4 px-4 py-6" id="main-content">
        <div>
          <h1 className="text-2xl font-bold">Aktivitas</h1>
          <p className="mt-1 text-sm text-muted">Hanya kamu yang dapat melihat riwayat ini.</p>
        </div>

        <Card className="grid grid-cols-2 gap-3 shadow-none">
          <label className="grid gap-1 text-[13px] font-semibold" htmlFor="activity-type">
            Jenis
            <select
              className={controlClass}
              id="activity-type"
              onChange={(event) => {
                setType(event.target.value as ActivityType | '');
                setStatus('');
                resetPagination();
              }}
              value={type}
            >
              <option value="">Semua</option>
              <option value="CONTRIBUTION">Kontribusi</option>
              <option value="REPORT">Laporan</option>
              <option value="CONFIRMATION">Konfirmasi</option>
            </select>
          </label>
          <label className="grid gap-1 text-[13px] font-semibold" htmlFor="activity-status">
            Status
            <select
              className={controlClass}
              id="activity-status"
              onChange={(event) => {
                setStatus(event.target.value);
                resetPagination();
              }}
              value={status}
            >
              <option value="">Semua</option>
              {statusOptions(type).map((option) => (
                <option key={option} value={option}>
                  {option.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
        </Card>

        {activity.isPending ? (
          <div aria-busy="true" className="grid gap-3">
            <span className="sr-only">Memuat aktivitas</span>
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        ) : activity.isError ? (
          <div className="grid gap-3">
            <Alert title="Aktivitas gagal dimuat" tone="danger">
              Periksa koneksi lalu coba lagi.
            </Alert>
            <Button onClick={() => void activity.refetch()} size="full">
              Coba lagi
            </Button>
          </div>
        ) : response && response.items.length > 0 ? (
          <>
            <ol className="grid gap-3" aria-label="Daftar aktivitas">
              {response.items.map((item) => (
                <ActivityCard item={item} key={`${item.type}-${item.id}`} />
              ))}
            </ol>
            <nav aria-label="Paginasi aktivitas" className="grid grid-cols-2 gap-3">
              <Button
                disabled={cursorHistory.length === 0}
                onClick={() => {
                  const previous = cursorHistory.at(-1);
                  setCursor(previous);
                  setCursorHistory((values) => values.slice(0, -1));
                }}
                variant="secondary"
              >
                Sebelumnya
              </Button>
              <Button
                disabled={!response.pagination.hasMore || !response.pagination.nextCursor}
                onClick={() => {
                  const next = response.pagination.nextCursor;
                  if (!next) return;
                  setCursorHistory((values) => [...values, cursor]);
                  setCursor(next);
                }}
                variant="secondary"
              >
                Berikutnya
              </Button>
            </nav>
          </>
        ) : (
          <EmptyState
            action={
              type || status ? (
                <Button
                  onClick={() => {
                    setType('');
                    setStatus('');
                    resetPagination();
                  }}
                  size="full"
                  variant="secondary"
                >
                  Hapus filter
                </Button>
              ) : (
                <LinkButton href="/" size="full" variant="secondary">
                  Jelajahi Place
                </LinkButton>
              )
            }
            title="Aktivitas masih kosong"
          >
            Belum ada data milikmu untuk filter ini.
          </EmptyState>
        )}

        {logoutError ? (
          <Alert title="Keluar gagal" tone="danger">
            Sesi belum dapat diakhiri. Coba lagi.
          </Alert>
        ) : null}
        <Button
          loading={auth.isLoggingOut}
          loadingLabel="Mengakhiri sesi…"
          onClick={() => {
            setLogoutError(false);
            void auth.logout().catch(() => setLogoutError(true));
          }}
          size="full"
          variant="secondary"
        >
          Keluar
        </Button>
      </main>
    </GuestShell>
  );
}

function ActivityCard({ item }: Readonly<{ item: ActivityItem }>) {
  const href =
    item.type === 'CONTRIBUTION'
      ? `/contributions/${item.id}`
      : item.type === 'REPORT'
        ? `/reports/${item.id}`
        : null;
  return (
    <li>
      <Card className="grid gap-2 shadow-none">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-brand">
              {item.type === 'CONTRIBUTION'
                ? 'Kontribusi'
                : item.type === 'REPORT'
                  ? 'Laporan perubahan'
                  : 'Konfirmasi komunitas'}
            </p>
            <h2 className="break-words text-base font-semibold">{item.placeName}</h2>
          </div>
          <StatusBadge status={activityBadge(item.status)} />
        </div>
        <p className="text-[13px] text-muted">
          Diperbarui {formatDate(item.updatedAt)}
          {item.type === 'REPORT' ? ` · ${item.reportType.replaceAll('_', ' ')}` : ''}
          {item.type === 'CONFIRMATION' ? ` · ${item.confirmationType.replaceAll('_', ' ')}` : ''}
        </p>
        {href ? (
          <LinkButton href={href} size="full" variant="secondary">
            Lihat detail
          </LinkButton>
        ) : (
          <p className="text-[13px] text-muted">
            Konfirmasi aktif sampai masa recency berakhir; detail GPS tidak disimpan.
          </p>
        )}
      </Card>
    </li>
  );
}

function statusOptions(type: ActivityType | ''): readonly string[] {
  if (type === 'REPORT') return ['PENDING', 'IN_REVIEW', 'APPLIED', 'REJECTED'];
  if (type === 'CONFIRMATION') return ['ACTIVE', 'EXPIRED'];
  if (type === 'CONTRIBUTION') {
    return ['DRAFT', 'PENDING', 'IN_REVIEW', 'NEEDS_REVISION', 'APPROVED', 'REJECTED', 'MERGED'];
  }
  return [];
}

function activityBadge(status: ActivityItem['status']) {
  if (status === 'APPLIED' || status === 'APPROVED' || status === 'MERGED' || status === 'ACTIVE') {
    return 'approved' as const;
  }
  if (status === 'REJECTED' || status === 'EXPIRED') return 'rejected' as const;
  if (status === 'IN_REVIEW') return 'reviewing' as const;
  if (status === 'NEEDS_REVISION') return 'revision' as const;
  if (status === 'DRAFT') return 'unknown' as const;
  return 'pending' as const;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

function ActivityFrame({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <GuestShell bottomNavigation navigationCurrent="activity" title="Aktivitas">
      <main className="grid flex-1 content-start gap-4 px-4 py-6" id="main-content">
        {children}
      </main>
    </GuestShell>
  );
}

function ActivityLoading() {
  return (
    <ActivityFrame>
      <div aria-busy="true" className="grid gap-4">
        <span className="sr-only">Memuat status akun</span>
        <Skeleton className="h-20" />
        <Skeleton className="h-48" />
      </div>
    </ActivityFrame>
  );
}
