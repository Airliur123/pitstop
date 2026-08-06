import { AdminStatCard, AdminTopbar, Badge, Card, SectionHeader } from '@pitstop/ui';

import { AccessDenied } from '../../components/access-denied';
import { AdminShell } from '../../components/admin-shell';
import { getAdminSystemDiagnostics } from '../../lib/api/server';
import { requireAuthenticatedUser } from '../../lib/auth';
import { formatDateTime } from '../../lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminSystemPage() {
  const user = await requireAuthenticatedUser();
  if (user.role !== 'ADMIN') return <AccessDenied email={user.email} />;
  const diagnostics = await getAdminSystemDiagnostics();

  return (
    <AdminShell current="system" userEmail={user.email}>
      <AdminTopbar
        description="Ringkasan operasional terbatas; respons selalu private dan tidak memuat payload pengguna."
        title="Diagnostik sistem"
        trailing={
          <Badge tone={diagnostics.status === 'ready' ? 'success' : 'danger'}>
            {diagnostics.status === 'ready' ? 'Siap' : 'Perlu perhatian'}
          </Badge>
        }
      />

      <section
        aria-label="Status dependensi"
        className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <AdminStatCard
          label="MySQL"
          tone={diagnostics.dependencies.database === 'up' ? 'success' : 'danger'}
          value={diagnostics.dependencies.database === 'up' ? 'Tersedia' : 'Tidak tersedia'}
        />
        <AdminStatCard
          label="Redis"
          tone={diagnostics.dependencies.redis === 'up' ? 'success' : 'danger'}
          value={diagnostics.dependencies.redis === 'up' ? 'Tersedia' : 'Tidak tersedia'}
        />
        <AdminStatCard
          label="Fondasi antrean"
          tone={diagnostics.dependencies.queue === 'up' ? 'success' : 'danger'}
          value={diagnostics.dependencies.queue === 'up' ? 'Tersedia' : 'Tidak tersedia'}
        />
        <AdminStatCard
          label="Worker"
          tone={diagnostics.worker.state === 'ready' ? 'success' : 'warning'}
          value={workerStateLabel(diagnostics.worker.state)}
        />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <SectionHeader
            description="Nilai agregat tanpa ID pengguna, Place, request, atau payload."
            title="Antrean dan backlog"
          />
          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            <DiagnosticValue
              label="Kontribusi menunggu"
              value={diagnostics.backlog.contributionsPending}
            />
            <DiagnosticValue
              label="Laporan menunggu/review"
              value={diagnostics.backlog.reportsPendingOrInReview}
            />
            <DiagnosticValue
              label="Google Form inbox"
              value={diagnostics.backlog.googleFormInbox}
            />
            <DiagnosticValue label="Google Form DLQ" value={diagnostics.backlog.googleFormDlq} />
            <DiagnosticValue label="BullMQ menunggu" value={diagnostics.queues.waiting} />
            <DiagnosticValue label="BullMQ aktif" value={diagnostics.queues.active} />
            <DiagnosticValue label="BullMQ tertunda" value={diagnostics.queues.delayed} />
            <DiagnosticValue label="BullMQ gagal" value={diagnostics.queues.failed} />
            <DiagnosticValue label="BullMQ DLQ" value={diagnostics.queues.dlq} />
          </dl>
        </Card>

        <Card>
          <SectionHeader
            description="Gunakan correlation ID dari respons untuk penelusuran insiden."
            title="Build dan aktivitas"
          />
          <dl className="mt-5 grid gap-3 text-sm">
            <DiagnosticText label="Layanan" value={diagnostics.service} />
            <DiagnosticText label="Environment" value={diagnostics.environment} />
            <DiagnosticText label="Release" value={diagnostics.release} />
            <DiagnosticText
              label="Heartbeat worker"
              value={
                diagnostics.worker.lastHeartbeatAt
                  ? formatDateTime(diagnostics.worker.lastHeartbeatAt)
                  : 'Belum tersedia'
              }
            />
            <DiagnosticText
              label="Aktivitas worker berhasil"
              value={
                diagnostics.worker.lastSuccessfulActivityAt
                  ? formatDateTime(diagnostics.worker.lastSuccessfulActivityAt)
                  : 'Belum tersedia'
              }
            />
            <DiagnosticText
              label="Snapshot dibuat"
              value={formatDateTime(diagnostics.generatedAt)}
            />
          </dl>
        </Card>
      </div>
    </AdminShell>
  );
}

function DiagnosticValue({ label, value }: Readonly<{ label: string; value: number }>) {
  return (
    <div className="rounded-card border border-border bg-surface-subtle p-4">
      <dt className="text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-bold tabular-nums">{value}</dd>
    </div>
  );
}

function DiagnosticText({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex flex-wrap justify-between gap-2 border-b border-border py-3 last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function workerStateLabel(state: 'ready' | 'stale' | 'stopping' | 'unavailable'): string {
  switch (state) {
    case 'ready':
      return 'Siap';
    case 'stale':
      return 'Heartbeat usang';
    case 'stopping':
      return 'Berhenti aman';
    case 'unavailable':
      return 'Belum tersedia';
  }
}
