import type {
  ApprovedPlacePatch,
  GovernanceAuditEntry,
  PlaceHistoryEntry,
} from '@pitstop/contracts';
import {
  AdminTopbar,
  Alert,
  Badge,
  Breadcrumb,
  Card,
  LinkButton,
  SectionHeader,
  StatusBadge,
} from '@pitstop/ui';
import { notFound } from 'next/navigation';

import { AccessDenied } from '../../../components/access-denied';
import { AdminShell } from '../../../components/admin-shell';
import { ReportActions } from '../../../components/report-actions';
import { AdminApiProblem } from '../../../lib/api/client';
import { getAdminReport } from '../../../lib/api/server';
import { requireAuthenticatedUser } from '../../../lib/auth';
import { formatDateTime } from '../../../lib/format';

export const dynamic = 'force-dynamic';
const validId = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export default async function AdminReportDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const user = await requireAuthenticatedUser();
  if (user.role !== 'ADMIN') return <AccessDenied email={user.email} />;
  const { id } = await params;
  if (!validId.test(id)) notFound();
  let report;
  try {
    report = await getAdminReport(id);
  } catch (error) {
    if (error instanceof AdminApiProblem && error.status === 404) notFound();
    throw error;
  }

  return (
    <AdminShell current="reports" userEmail={user.email}>
      <Breadcrumb items={[{ href: '/reports', label: 'Reports' }, { label: report.id }]} />
      <div className="mt-5">
        <AdminTopbar
          description={`Report v${report.version} · Place v${report.currentPlace.version}`}
          title={report.currentPlace.name}
          trailing={<StatusBadge status={statusBadge(report.status)} />}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
        <div className="space-y-6">
          <Card>
            <SectionHeader
              description="Perbandingan ini read-only. Hanya patch allowlist yang dapat diterapkan."
              title="Current versus proposed"
            />
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <section
                aria-labelledby="current-place-heading"
                className="rounded-card border border-border p-4"
              >
                <h2 className="font-semibold" id="current-place-heading">
                  Current Place
                </h2>
                <dl className="mt-3 grid gap-3 text-sm">
                  <Detail label="Nama" value={report.currentPlace.name} />
                  <Detail label="Alamat" value={report.currentPlace.address} />
                  <Detail
                    label="Kategori"
                    value={report.currentPlace.categories.join(', ') || '—'}
                  />
                  <Detail
                    label="Fasilitas"
                    value={
                      report.currentPlace.facilities
                        .map((facility) => `${facility.code}: ${facility.status}`)
                        .join(', ') || '—'
                    }
                  />
                  <Detail
                    label="Menu"
                    value={
                      report.currentPlace.menus
                        .map(
                          (menu) =>
                            `${menu.name}: Rp${menu.priceAmount.toLocaleString('id-ID')}${
                              menu.isAvailable ? '' : ' (tidak tersedia)'
                            }`,
                        )
                        .join(', ') || '—'
                    }
                  />
                  <Detail
                    label="Jam operasional"
                    value={
                      report.currentPlace.operatingHours
                        .map(
                          (hour) =>
                            `Hari ${hour.dayOfWeek}: ${
                              hour.isClosed
                                ? 'tutup'
                                : hour.is24Hours
                                  ? '24 jam'
                                  : `${hour.opensAt}–${hour.closesAt}`
                            }`,
                        )
                        .join('; ') || '—'
                    }
                  />
                  <Detail label="Verifikasi" value={report.currentPlace.verificationStatus} />
                </dl>
              </section>
              <section
                aria-labelledby="proposal-heading"
                className="rounded-card border border-border-brand bg-surface-success p-4"
              >
                <h2 className="font-semibold" id="proposal-heading">
                  Proposed change
                </h2>
                <PatchSummary patch={report.proposal} />
              </section>
            </div>
          </Card>

          <Card>
            <SectionHeader title="Penjelasan dan bukti" />
            <p className="mt-5 whitespace-pre-wrap text-sm">{report.explanation}</p>
            {report.evidenceReference ? (
              <Alert className="mt-4" title="Referensi bukti" tone="info">
                {report.evidenceReference}
              </Alert>
            ) : null}
            {report.evidenceUrl ? (
              <a
                className="mt-4 inline-flex min-h-12 items-center break-all font-semibold text-brand underline"
                href={report.evidenceUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                Buka URL bukti
                <span className="sr-only"> (buka tab baru; URL tidak di-fetch server)</span>
              </a>
            ) : (
              <p className="mt-4 text-sm text-muted">Tidak ada URL bukti.</p>
            )}
          </Card>

          <Card>
            <SectionHeader
              description="Snapshot terbatas tanpa secret atau koordinat mentah."
              title="Place change history"
            />
            <HistoryList entries={report.placeHistory} />
          </Card>

          <Card>
            <SectionHeader
              action={<LinkButton href={`/audit?resourceId=${report.id}`}>Buka audit</LinkButton>}
              description="Event governance append-only yang terkait report ini."
              title="Audit summary"
            />
            <AuditList entries={report.audit} />
          </Card>
        </div>

        <aside aria-label="Konteks dan tindakan report" className="space-y-6">
          <Card>
            <SectionHeader title="Konteks report" />
            <dl className="mt-5 grid gap-4">
              <Detail label="Jenis" value={report.reportType.replaceAll('_', ' ')} />
              <Detail label="Reporter" value={report.reporter.maskedEmail} />
              <Detail label="Dikirim" value={formatDateTime(report.submittedAt)} />
              <Detail
                label="Reviewer"
                value={
                  report.currentReviewer
                    ? `${report.currentReviewer.email}${
                        report.currentReviewer.claimExpired ? ' · lease kedaluwarsa' : ''
                      }`
                    : 'Belum diklaim'
                }
              />
              {report.reviewedAt ? (
                <Detail label="Ditinjau" value={formatDateTime(report.reviewedAt)} />
              ) : null}
              {report.resolution ? <Detail label="Resolusi" value={report.resolution} /> : null}
            </dl>
          </Card>

          <Card>
            <SectionHeader
              description="Action hanya tersedia untuk status dan lease yang valid."
              title="Tindakan"
            />
            <div className="mt-5">
              <ReportActions adminId={user.id} report={report} />
            </div>
          </Card>

          <Card>
            <SectionHeader title="Related pending reports" />
            {report.relatedPendingReports.length > 0 ? (
              <ul className="mt-4 grid gap-3">
                {report.relatedPendingReports.map((related) => (
                  <li className="rounded-button border border-border p-3" key={related.id}>
                    <p className="text-sm font-semibold">
                      {related.reportType.replaceAll('_', ' ')}
                    </p>
                    <p className="mt-1 text-xs text-muted">{formatDateTime(related.submittedAt)}</p>
                    <LinkButton className="mt-2" href={`/reports/${related.id}`} variant="ghost">
                      Buka
                    </LinkButton>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-muted">Tidak ada report terkait yang pending.</p>
            )}
          </Card>
        </aside>
      </div>
    </AdminShell>
  );
}

function PatchSummary({ patch }: Readonly<{ patch: ApprovedPlacePatch }>) {
  return (
    <dl className="mt-3 grid gap-3 text-sm">
      <Detail label="Jenis patch" value={patch.kind} />
      {Object.entries(patch)
        .filter(([key]) => key !== 'kind')
        .map(([key, value]) => (
          <Detail
            key={key}
            label={key.replaceAll(/([A-Z])/g, ' $1')}
            value={typeof value === 'object' ? JSON.stringify(value) : String(value)}
          />
        ))}
    </dl>
  );
}

function HistoryList({ entries }: Readonly<{ entries: readonly PlaceHistoryEntry[] }>) {
  if (entries.length === 0) {
    return <p className="mt-5 text-sm text-muted">Belum ada history untuk Place ini.</p>;
  }
  return (
    <ol className="mt-5 divide-y divide-border">
      {entries.map((entry) => (
        <li className="py-4" key={entry.id}>
          <div className="flex flex-wrap justify-between gap-2">
            <p className="font-semibold">{entry.changedFields.join(', ')}</p>
            <time className="text-sm text-muted" dateTime={entry.createdAt}>
              {formatDateTime(entry.createdAt)}
            </time>
          </div>
          <p className="mt-1 text-sm text-muted">
            {entry.sourceType} · versi {entry.previousVersion ?? 'awal'} → {entry.nextVersion}
          </p>
          {entry.reason ? <p className="mt-2 text-sm">{entry.reason}</p> : null}
        </li>
      ))}
    </ol>
  );
}

function AuditList({ entries }: Readonly<{ entries: readonly GovernanceAuditEntry[] }>) {
  if (entries.length === 0) {
    return <p className="mt-5 text-sm text-muted">Belum ada event audit.</p>;
  }
  return (
    <ol className="mt-5 divide-y divide-border">
      {entries.map((entry) => (
        <li className="py-4" key={entry.id}>
          <div className="flex flex-wrap justify-between gap-2">
            <p className="font-semibold">{entry.action}</p>
            <time className="text-sm text-muted" dateTime={entry.createdAt}>
              {formatDateTime(entry.createdAt)}
            </time>
          </div>
          <p className="mt-1 text-sm text-muted">
            {entry.actorType} · {entry.previousStatus ?? '—'} → {entry.nextStatus ?? '—'}
          </p>
          <Badge className="mt-2" tone="neutral">
            Request {entry.requestId}
          </Badge>
        </li>
      ))}
    </ol>
  );
}

function Detail({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 break-words font-medium">{value}</dd>
    </div>
  );
}

function statusBadge(status: string): 'approved' | 'pending' | 'rejected' | 'reviewing' {
  if (status === 'APPLIED') return 'approved';
  if (status === 'REJECTED') return 'rejected';
  if (status === 'IN_REVIEW') return 'reviewing';
  return 'pending';
}
