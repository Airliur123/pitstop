import { AdminTopbar, Badge, Button, Card, EmptyState, Input, LinkButton } from '@pitstop/ui';

import { AccessDenied } from '../../components/access-denied';
import { AdminShell } from '../../components/admin-shell';
import { getAuditLog } from '../../lib/api/server';
import { requireAuthenticatedUser } from '../../lib/auth';
import { formatDateTime } from '../../lib/format';

export const dynamic = 'force-dynamic';
const acceptedParameters = ['action', 'cursor', 'limit', 'resourceId', 'resourceType'] as const;
type PageSearchParameters = Promise<Record<string, string | string[] | undefined>>;

function scalar(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : '';
}

export default async function AuditPage({
  searchParams,
}: Readonly<{ searchParams: PageSearchParameters }>) {
  const user = await requireAuthenticatedUser();
  if (user.role !== 'ADMIN') return <AccessDenied email={user.email} />;
  const raw = await searchParams;
  const query = new URLSearchParams();
  for (const key of acceptedParameters) {
    const value = scalar(raw[key]).trim();
    if (value) query.set(key, value);
  }
  const audit = await getAuditLog(query);
  const nextQuery = new URLSearchParams(query);
  if (audit.pagination.nextCursor) nextQuery.set('cursor', audit.pagination.nextCursor);

  return (
    <AdminShell current="audit" userEmail={user.email}>
      <AdminTopbar
        description="Governance event append-only · privat · metadata allowlist"
        title="Audit log"
        trailing={<Badge tone="info">{audit.items.length} event</Badge>}
      />
      <Card className="mt-6">
        <form action="/audit" className="grid gap-4 md:grid-cols-3">
          <label className="grid gap-1.5 text-sm font-semibold">
            Action
            <Input defaultValue={scalar(raw.action)} maxLength={120} name="action" />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            Resource type
            <Input defaultValue={scalar(raw.resourceType)} maxLength={100} name="resourceType" />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            Resource ID
            <Input
              defaultValue={scalar(raw.resourceId)}
              maxLength={26}
              minLength={26}
              name="resourceId"
            />
          </label>
          <div className="flex gap-2 md:col-span-3">
            <Button type="submit">Terapkan filter</Button>
            <LinkButton href="/audit" variant="ghost">
              Reset
            </LinkButton>
          </div>
        </form>
      </Card>

      {audit.items.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="Tidak ada audit event">
            Ubah filter atau tunggu tindakan governance baru.
          </EmptyState>
        </div>
      ) : (
        <Card className="mt-6 overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-left text-sm">
              <caption className="sr-only">Governance audit log</caption>
              <thead className="bg-app text-muted">
                <tr>
                  <th className="px-4 py-3" scope="col">
                    Action
                  </th>
                  <th className="px-4 py-3" scope="col">
                    Resource
                  </th>
                  <th className="px-4 py-3" scope="col">
                    Actor
                  </th>
                  <th className="px-4 py-3" scope="col">
                    Transition
                  </th>
                  <th className="px-4 py-3" scope="col">
                    Request
                  </th>
                  <th className="px-4 py-3" scope="col">
                    Waktu
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {audit.items.map((entry) => (
                  <tr key={entry.id}>
                    <th className="px-4 py-4 font-semibold" scope="row">
                      {entry.action}
                    </th>
                    <td className="px-4 py-4">
                      {entry.resourceType}
                      <p className="mt-1 font-mono text-xs text-muted">{entry.resourceId}</p>
                    </td>
                    <td className="px-4 py-4">
                      {entry.actorType}
                      <p className="mt-1 font-mono text-xs text-muted">
                        {entry.actorId ?? 'system'}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      {entry.previousStatus ?? '—'} → {entry.nextStatus ?? '—'}
                    </td>
                    <td className="px-4 py-4 font-mono text-xs">{entry.requestId}</td>
                    <td className="px-4 py-4">
                      <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <nav aria-label="Navigasi cursor audit" className="mt-6 flex justify-end">
        {audit.pagination.hasMore ? (
          <LinkButton href={`/audit?${nextQuery.toString()}`} variant="ghost">
            Halaman berikutnya
          </LinkButton>
        ) : (
          <span className="text-sm text-muted">Akhir audit log</span>
        )}
      </nav>
    </AdminShell>
  );
}
