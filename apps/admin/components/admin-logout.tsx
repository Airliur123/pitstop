'use client';

import { Button } from '@pitstop/ui';
import { useState } from 'react';

import { logoutAdmin } from '../lib/api/client';

export function AdminLogout({ email }: Readonly<{ email: string }>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await logoutAdmin();
      window.location.assign('/login');
    } catch {
      setError('Belum dapat keluar. Coba lagi.');
      setPending(false);
    }
  }

  return (
    <div>
      <p className="truncate text-xs text-white/70">{email}</p>
      <Button
        className="mt-3 w-full border-white/40 text-inverse hover:bg-white/10"
        loading={pending}
        loadingLabel="Keluar…"
        onClick={logout}
        size="compact"
        variant="secondary"
      >
        Keluar
      </Button>
      {error ? (
        <p aria-live="polite" className="mt-2 text-xs text-white">
          {error}
        </p>
      ) : null}
    </div>
  );
}
