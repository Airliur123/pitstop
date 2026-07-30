import { Alert, Card, LinkButton } from '@pitstop/ui';

import { GuestShell } from './guest-shell';

export function ReportSuccess({ reportId }: Readonly<{ reportId: string }>) {
  return (
    <GuestShell backHref="/activity" title="Laporan terkirim">
      <main className="grid flex-1 content-center gap-5 px-4 py-8" id="main-content">
        <Alert title="Laporan berhasil dikirim" tone="success">
          Data Place belum berubah. Admin akan memeriksa proposal sebelum mengambil keputusan.
        </Alert>
        <Card className="grid gap-2 text-sm">
          <h1 className="text-xl font-bold">Terima kasih sudah membantu</h1>
          <p className="text-muted">
            Status, waktu pemeriksaan, dan resolusi aman dapat dipantau pada detail laporan.
          </p>
        </Card>
        <LinkButton href={`/reports/${reportId}`} size="full">
          Lihat detail laporan
        </LinkButton>
        <LinkButton href="/activity" size="full" variant="secondary">
          Buka Aktivitas
        </LinkButton>
      </main>
    </GuestShell>
  );
}
