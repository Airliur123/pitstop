'use client';

import type { MobileNavigationValue } from '@pitstop/ui';
import { Alert, Button, LinkButton, Skeleton } from '@pitstop/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useAuth } from './auth-provider';
import { GuestShell } from './guest-shell';

export function ProtectedPlaceholder({
  description,
  navigationCurrent,
  returnTo,
  title,
}: Readonly<{
  description: string;
  navigationCurrent: MobileNavigationValue;
  returnTo: '/activity' | '/contribute';
  title: string;
}>) {
  const auth = useAuth();
  const router = useRouter();
  const [logoutError, setLogoutError] = useState(false);

  useEffect(() => {
    if (auth.status === 'unauthenticated') {
      router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    }
  }, [auth.status, returnTo, router]);

  if (auth.status === 'loading' || auth.status === 'unauthenticated') {
    return (
      <GuestShell bottomNavigation navigationCurrent={navigationCurrent} title={title}>
        <main
          aria-busy="true"
          className="grid flex-1 content-start gap-4 px-4 py-6"
          id="main-content"
        >
          <span className="sr-only">Memeriksa sesi</span>
          <Skeleton className="h-36" />
        </main>
      </GuestShell>
    );
  }

  if (auth.status === 'error') {
    return (
      <GuestShell bottomNavigation navigationCurrent={navigationCurrent} title={title}>
        <main className="grid flex-1 content-start gap-4 px-4 py-6" id="main-content">
          <Alert title="Layanan akun tidak tersedia" tone="danger">
            Status sesi belum dapat diperiksa. Beranda tamu tetap dapat digunakan.
          </Alert>
          <Button onClick={() => void auth.refresh()} size="full" type="button">
            Coba lagi
          </Button>
          <LinkButton href="/" size="full" variant="secondary">
            Kembali ke beranda
          </LinkButton>
        </main>
      </GuestShell>
    );
  }

  return (
    <GuestShell bottomNavigation navigationCurrent={navigationCurrent} title={title}>
      <main className="grid flex-1 content-start gap-5 px-4 py-6" id="main-content">
        <div className="grid gap-2">
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-muted">{description}</p>
        </div>
        <Alert title="Tersedia pada fase berikutnya">
          Sesi sudah aktif. Fungsi ini sengaja belum dibuka agar batas Phase 6 tetap terjaga.
        </Alert>
        <p className="text-sm text-muted">
          Masuk sebagai {auth.session?.authenticated ? auth.session.user.email : 'pengguna'}.
        </p>
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
          type="button"
          variant="secondary"
        >
          Keluar
        </Button>
      </main>
    </GuestShell>
  );
}
