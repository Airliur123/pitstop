'use client';

import { Button, Card, LinkButton } from '@pitstop/ui';
import { CloudOff, Wifi } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { GuestShell } from './guest-shell';

export function OfflineExperience() {
  const [online, setOnline] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.focus();
    const updateConnectionState = () => setOnline(navigator.onLine);
    updateConnectionState();
    window.addEventListener('online', updateConnectionState);
    window.addEventListener('offline', updateConnectionState);
    return () => {
      window.removeEventListener('online', updateConnectionState);
      window.removeEventListener('offline', updateConnectionState);
    };
  }, []);

  const retry = () => {
    if (!navigator.onLine) {
      setOnline(false);
      return;
    }
    window.location.assign('/');
  };

  return (
    <GuestShell title="PitStop offline">
      <main
        className="flex flex-1 items-center px-4 py-8"
        id="main-content"
        ref={mainRef}
        tabIndex={-1}
      >
        <Card className="w-full px-5 py-8 text-center">
          {online ? (
            <Wifi aria-hidden="true" className="mx-auto size-10 text-brand" />
          ) : (
            <CloudOff aria-hidden="true" className="mx-auto size-10 text-muted" />
          )}
          <h1 className="mt-4 text-xl font-bold text-foreground">
            {online ? 'Koneksi kembali tersedia' : 'Koneksi sedang tidak tersedia'}
          </h1>
          <p aria-live="polite" className="mt-2 text-sm text-muted" role="status">
            {online
              ? 'Anda dapat mencoba membuka kembali halaman aman.'
              : 'PitStop tidak menampilkan data tersimpan sebagai informasi terbaru. Login, Aktivitas, kontribusi, laporan, dan pengiriman formulir memerlukan koneksi.'}
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <Button onClick={retry} size="full" type="button">
              {online ? 'Coba lagi' : 'Periksa koneksi'}
            </Button>
            <LinkButton href="/" size="full" variant="secondary">
              Kembali ke beranda
            </LinkButton>
          </div>
        </Card>
      </main>
    </GuestShell>
  );
}
