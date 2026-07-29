import {
  AdminStatCard,
  AdminTopbar,
  Badge,
  Card,
  EmptyState,
  LinkButton,
  SectionHeader,
} from '@pitstop/ui';

import { AccessDenied } from '../components/access-denied';
import { AdminShell } from '../components/admin-shell';
import { getAdminDashboard } from '../lib/api/server';
import { requireAuthenticatedUser } from '../lib/auth';
import { actionLabels, formatDateTime } from '../lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const user = await requireAuthenticatedUser();
  if (user.role !== 'ADMIN') return <AccessDenied email={user.email} />;
  const dashboard = await getAdminDashboard();

  return (
    <AdminShell current="dashboard" userEmail={user.email}>
      <AdminTopbar
        description={`Sesi aman · ${user.email}`}
        title="Dashboard moderasi"
        trailing={<Badge tone="success">Administrator</Badge>}
      />
      <section
        aria-label="Ringkasan antrean moderasi"
        className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <AdminStatCard
          label="Menunggu review"
          tone="warning"
          value={String(dashboard.totals.pending)}
        />
        <AdminStatCard label="Sedang direview" value={String(dashboard.totals.inReview)} />
        <AdminStatCard
          label="Perlu perbaikan"
          tone="danger"
          value={String(dashboard.totals.needsRevision)}
        />
        <AdminStatCard
          label="Siap dipublikasikan"
          tone="success"
          value={String(dashboard.totals.approvedAwaitingMerge)}
        />
      </section>

      <Card className="mt-6">
        <SectionHeader
          action={<LinkButton href="/contributions">Buka antrean</LinkButton>}
          description="Aktivitas keputusan terbaru dari seluruh administrator."
          title="Aktivitas moderasi"
        />
        {dashboard.recentActivity.length === 0 ? (
          <div className="mt-5">
            <EmptyState title="Belum ada aktivitas">
              Aktivitas akan muncul setelah kontribusi mulai ditinjau.
            </EmptyState>
          </div>
        ) : (
          <ol className="mt-5 divide-y divide-border">
            {dashboard.recentActivity.map((event) => (
              <li className="flex flex-wrap items-start justify-between gap-3 py-4" key={event.id}>
                <div>
                  <p className="font-semibold">{actionLabels[event.action]}</p>
                  <p className="mt-1 text-sm text-muted">
                    {event.actor.email} · versi {event.contributionVersion}
                  </p>
                  {event.reason ? <p className="mt-2 text-sm">{event.reason}</p> : null}
                </div>
                <time className="text-sm text-muted" dateTime={event.createdAt}>
                  {formatDateTime(event.createdAt)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </AdminShell>
  );
}
