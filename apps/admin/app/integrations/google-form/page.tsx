import { AdminStatCard, AdminTopbar, Badge, Card, EmptyState, SectionHeader } from '@pitstop/ui';

import { AccessDenied } from '../../../components/access-denied';
import { AdminShell } from '../../../components/admin-shell';
import { getGoogleFormIntegrationStatus, getGoogleFormSubmissions } from '../../../lib/api/server';
import { requireAuthenticatedUser } from '../../../lib/auth';
import { formatDateTime } from '../../../lib/format';

export const dynamic = 'force-dynamic';

export default async function GoogleFormIntegrationPage() {
  const user = await requireAuthenticatedUser();
  if (user.role !== 'ADMIN') return <AccessDenied email={user.email} />;
  const [status, submissions] = await Promise.all([
    getGoogleFormIntegrationStatus(),
    getGoogleFormSubmissions(new URLSearchParams({ page: '1', pageSize: '20' })),
  ]);

  return (
    <AdminShell current="integrations" userEmail={user.email}>
      <AdminTopbar
        description={`Source ${status.source.id} · key ${status.source.keyId}`}
        title="Sinkronisasi Google Form"
        trailing={
          <Badge tone={status.source.enabled ? 'success' : 'danger'}>
            {status.source.enabled ? 'Aktif' : 'Nonaktif'}
          </Badge>
        }
      />

      <section
        aria-label="Ringkasan sinkronisasi Google Form"
        className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5"
      >
        <AdminStatCard label="Diterima 24 jam" value={String(status.recentReceived)} />
        <AdminStatCard
          label="Sedang diproses"
          tone="warning"
          value={String(status.queue.pending)}
        />
        <AdminStatCard label="Selesai" tone="success" value={String(status.counts.COMPLETED)} />
        <AdminStatCard
          label="Menunggu retry"
          tone="warning"
          value={String(status.counts.RETRYABLE_FAILURE)}
        />
        <AdminStatCard
          label="Dead letter"
          tone="danger"
          value={String(status.counts.DEAD_LETTER)}
        />
      </section>

      <Card className="mt-6">
        <SectionHeader
          description={
            status.lastSuccessfulSyncAt
              ? `Sinkronisasi berhasil terakhir ${formatDateTime(status.lastSuccessfulSyncAt)}.`
              : 'Belum ada submission yang selesai diproses.'
          }
          title="Submission terbaru"
        />
        {submissions.items.length === 0 ? (
          <div className="mt-5">
            <EmptyState title="Belum ada submission">
              Submission yang sudah diterima durable akan tampil di sini.
            </EmptyState>
          </div>
        ) : (
          <div
            aria-label="Daftar submission Google Form terbaru"
            className="mt-5 overflow-x-auto"
            role="region"
            tabIndex={0}
          >
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <caption className="sr-only">
                Dua puluh submission Google Form terbaru dengan status aman
              </caption>
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="px-3 py-3 font-semibold" scope="col">
                    Diterima
                  </th>
                  <th className="px-3 py-3 font-semibold" scope="col">
                    Submission ID
                  </th>
                  <th className="px-3 py-3 font-semibold" scope="col">
                    Status
                  </th>
                  <th className="px-3 py-3 font-semibold" scope="col">
                    Geocoding
                  </th>
                  <th className="px-3 py-3 font-semibold" scope="col">
                    Dedupe
                  </th>
                  <th className="px-3 py-3 font-semibold" scope="col">
                    Email
                  </th>
                  <th className="px-3 py-3 font-semibold" scope="col">
                    Error aman
                  </th>
                </tr>
              </thead>
              <tbody>
                {submissions.items.map((submission) => (
                  <tr className="border-b border-border/70" key={submission.id}>
                    <td className="px-3 py-3">{formatDateTime(submission.receivedAt)}</td>
                    <td className="max-w-52 truncate px-3 py-3 font-mono text-xs">
                      {submission.externalSubmissionId}
                    </td>
                    <td className="px-3 py-3">
                      <Badge
                        tone={
                          submission.status === 'COMPLETED'
                            ? 'success'
                            : submission.status === 'DEAD_LETTER' ||
                                submission.status === 'REJECTED_INVALID'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {submission.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">{submission.geocodingStatus}</td>
                    <td className="px-3 py-3">{submission.duplicateDetectionStatus}</td>
                    <td className="px-3 py-3">{submission.submitterEmailMasked ?? '—'}</td>
                    <td className="px-3 py-3">{submission.lastErrorCode ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AdminShell>
  );
}
