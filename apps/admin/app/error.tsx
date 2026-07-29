'use client';

import { ErrorState, SkipLink } from '@pitstop/ui';

export default function AdminError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return (
    <>
      <SkipLink />
      <main className="mx-auto flex min-h-dvh max-w-2xl items-center px-4" id="main-content">
        <ErrorState onRetry={reset} title={error.message || 'Dashboard tidak tersedia'} />
      </main>
    </>
  );
}
