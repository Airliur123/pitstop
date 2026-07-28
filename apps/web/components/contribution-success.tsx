'use client';

import { Alert, LinkButton, Skeleton, StatusBadge } from '@pitstop/ui';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';

import { getContribution } from '../lib/api/client';
import { queryKeys } from '../lib/query-keys';
import { useAuth } from './auth-provider';
import { GuestShell } from './guest-shell';

export function ContributionSuccessView({ contributionId }: Readonly<{ contributionId: string }>) {
  const auth = useAuth();
  const router = useRouter();
  const userId = auth.session?.authenticated ? auth.session.user.id : null;

  useEffect(() => {
    if (auth.status === 'unauthenticated') {
      router.replace(
        `/login?returnTo=${encodeURIComponent(`/contributions/${contributionId}/success`)}`,
      );
    }
  }, [auth.status, contributionId, router]);

  const contributionQuery = useQuery({
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
    (userId && contributionQuery.isPending)
  ) {
    return (
      <SuccessFrame>
        <span className="sr-only">Memuat konfirmasi kontribusi</span>
        <Skeleton className="h-64" />
      </SuccessFrame>
    );
  }

  const contribution = contributionQuery.data?.data;
  if (auth.status === 'error' || contributionQuery.isError || !contribution) {
    return (
      <SuccessFrame>
        <Alert title="Konfirmasi belum dapat dimuat" tone="danger">
          Buka detail kontribusi untuk memeriksa status terbaru.
        </Alert>
        <LinkButton href={`/contributions/${contributionId}`} size="full">
          Lihat detail kontribusi
        </LinkButton>
      </SuccessFrame>
    );
  }

  if (contribution.status !== 'PENDING') {
    return (
      <SuccessFrame>
        <Alert title="Kontribusi belum dikirim" tone="warning">
          Halaman sukses hanya tersedia setelah server mengonfirmasi status menunggu pemeriksaan.
        </Alert>
        <LinkButton href={`/contributions/${contributionId}`} size="full">
          Lihat detail kontribusi
        </LinkButton>
      </SuccessFrame>
    );
  }

  return (
    <SuccessFrame>
      <section className="grid justify-items-center gap-4 py-6 text-center" role="status">
        <span className="flex size-16 items-center justify-center rounded-full bg-surface-success text-success">
          <CheckCircle2 aria-hidden="true" className="size-9" />
        </span>
        <StatusBadge status="pending" />
        <div>
          <h1 className="text-2xl font-bold">Kontribusi berhasil dikirim</h1>
          <p className="mt-2 text-sm text-muted">
            Terima kasih. Data sedang menunggu pemeriksaan dan belum langsung tampil publik.
          </p>
        </div>
      </section>
      <LinkButton href={`/contributions/${contribution.id}`} size="full">
        Lihat detail kontribusi
      </LinkButton>
      <LinkButton href="/" size="full" variant="secondary">
        Kembali ke beranda
      </LinkButton>
    </SuccessFrame>
  );
}

function SuccessFrame({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <GuestShell backHref="/" title="Kontribusi terkirim">
      <main className="grid flex-1 content-start gap-4 px-4 py-6" id="main-content">
        {children}
      </main>
    </GuestShell>
  );
}
