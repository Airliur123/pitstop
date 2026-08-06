'use client';

import { Button, Card } from '@pitstop/ui';
import { RefreshCw } from 'lucide-react';
import { useEffect, useReducer, useRef, useState } from 'react';

import { PWA_CACHE_FAMILY, shouldPurgeCacheOnLogout } from '../lib/pwa/cache-policy';
import {
  type PwaUpdateStatus,
  reducePwaUpdateStatus,
  shouldReloadForControllerChange,
} from '../lib/pwa/update-state';
import { reportServiceWorkerFailure } from './client-observability';

const pwaEnabled = process.env.NEXT_PUBLIC_PWA_ENABLED === 'true';

async function disableStaleServiceWorkers() {
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations.map(async (registration) => {
      await registration.unregister();
    }),
  );

  if ('caches' in window) {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter(
          (cacheName) =>
            cacheName.startsWith(`${PWA_CACHE_FAMILY}-`) || shouldPurgeCacheOnLogout(cacheName),
        )
        .map((cacheName) => caches.delete(cacheName)),
    );
  }
}

export function UpdateNotice({
  onApply,
  status,
}: Readonly<{
  onApply: () => void;
  status: Exclude<PwaUpdateStatus, 'idle'>;
}>) {
  const failed = status === 'failed';
  return (
    <aside
      aria-atomic="true"
      aria-live={failed ? 'assertive' : 'polite'}
      className="fixed inset-x-4 bottom-4 z-[var(--pitstop-z-toast)] mx-auto max-w-[398px] motion-reduce:transition-none"
    >
      <Card className="flex items-start gap-3 border-border-strong bg-surface p-4 shadow-overlay">
        <RefreshCw
          aria-hidden="true"
          className={`mt-1 size-5 shrink-0 text-brand ${status === 'applying' ? 'animate-spin motion-reduce:animate-none' : ''}`}
        />
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-foreground">
            {failed ? 'Pembaruan belum dapat diterapkan' : 'Versi baru PitStop tersedia'}
          </h2>
          <p className="mt-1 text-[13px] text-muted">
            {failed
              ? 'Koneksi mungkin terputus. Formulir Anda tidak dimuat ulang otomatis.'
              : 'Selesaikan isian Anda terlebih dahulu. Aplikasi hanya dimuat ulang setelah Anda memilih tombol berikut.'}
          </p>
          <Button
            className="mt-3"
            loading={status === 'applying'}
            loadingLabel="Menerapkan pembaruan"
            onClick={onApply}
            size="compact"
            type="button"
            variant="secondary"
          >
            {failed ? 'Coba lagi' : 'Muat versi baru'}
          </Button>
        </div>
      </Card>
    </aside>
  );
}

export function PwaLifecycle() {
  const [status, dispatch] = useReducer(reducePwaUpdateStatus, 'idle');
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const activationRequested = useRef(false);
  const reloadStarted = useRef(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    if (!pwaEnabled) {
      void disableStaleServiceWorkers();
      return;
    }

    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;

    const offerUpdate = (worker: ServiceWorker) => {
      if (disposed || !navigator.serviceWorker.controller) return;
      setWaitingWorker(worker);
      dispatch({ type: 'AVAILABLE' });
    };
    const watchInstallingWorker = (worker: ServiceWorker) => {
      const onStateChange = () => {
        if (worker.state === 'installed') offerUpdate(worker);
        if (worker.state === 'redundant' && activationRequested.current) {
          dispatch({ type: 'FAILED' });
          reportServiceWorkerFailure('activation');
        }
      };
      worker.addEventListener('statechange', onStateChange);
    };
    const onUpdateFound = () => {
      if (registration?.installing) watchInstallingWorker(registration.installing);
    };
    const onControllerChange = () => {
      if (shouldReloadForControllerChange(activationRequested.current, reloadStarted.current)) {
        reloadStarted.current = true;
        window.location.reload();
      }
    };
    const updateRegistration = () => {
      void registration?.update().catch(() => reportServiceWorkerFailure('update'));
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    window.addEventListener('online', updateRegistration);
    void navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((registered) => {
        if (disposed) return;
        registration = registered;
        registration.addEventListener('updatefound', onUpdateFound);
        if (registration.waiting) offerUpdate(registration.waiting);
        updateRegistration();
      })
      .catch(() => reportServiceWorkerFailure('registration'));

    return () => {
      disposed = true;
      registration?.removeEventListener('updatefound', onUpdateFound);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      window.removeEventListener('online', updateRegistration);
    };
  }, []);

  if (status === 'idle') return null;

  const applyUpdate = () => {
    if (!waitingWorker) {
      dispatch({ type: 'FAILED' });
      reportServiceWorkerFailure('activation');
      return;
    }
    activationRequested.current = true;
    dispatch({ type: 'APPLY' });
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  };

  return <UpdateNotice onApply={applyUpdate} status={status} />;
}
