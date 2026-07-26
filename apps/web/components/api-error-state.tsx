'use client';

import { Button, Card } from '@pitstop/ui';
import { TriangleAlert } from 'lucide-react';

import { ApiProblem } from '../lib/api/client';

export function ApiErrorState({ error, onRetry }: Readonly<{ error: Error; onRetry: () => void }>) {
  const problem = error instanceof ApiProblem ? error : null;
  const isRateLimited = problem?.status === 429;
  return (
    <Card
      aria-live="assertive"
      className="flex min-h-[260px] flex-col items-center justify-center gap-3 border-danger px-5 py-6 text-center"
      role="alert"
    >
      <TriangleAlert aria-hidden="true" className="size-6 text-danger" />
      <h2 className="text-lg font-bold text-danger">
        {isRateLimited ? 'Terlalu banyak permintaan' : 'Koneksi sedang bermasalah'}
      </h2>
      <p className="text-[13px] text-muted">
        {isRateLimited
          ? `Tunggu sebentar${problem?.retryAfterSeconds ? ` sekitar ${problem.retryAfterSeconds} detik` : ''}, lalu coba lagi.`
          : 'Hasil belum dapat dimuat. Periksa koneksi lalu coba lagi.'}
      </p>
      {problem?.requestId ? (
        <p className="break-all text-[13px] text-muted">ID permintaan: {problem.requestId}</p>
      ) : null}
      <Button onClick={onRetry} type="button">
        Coba lagi
      </Button>
    </Card>
  );
}
