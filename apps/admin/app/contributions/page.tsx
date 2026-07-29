import {
  AdminTopbar,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  LinkButton,
  SearchField,
  StatusBadge,
} from '@pitstop/ui';

import { AccessDenied } from '../../components/access-denied';
import { AdminShell } from '../../components/admin-shell';
import { getAdminContributions } from '../../lib/api/server';
import { requireAuthenticatedUser } from '../../lib/auth';
import { categoryLabels, formatDateTime, sourceLabels, toUiStatus } from '../../lib/format';

export const dynamic = 'force-dynamic';

const acceptedParameters = [
  'category',
  'contributorId',
  'cursor',
  'from',
  'limit',
  'search',
  'sort',
  'source',
  'status',
  'to',
] as const;

type PageSearchParameters = Promise<Record<string, string | string[] | undefined>>;

function scalar(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

export default async function ContributionsQueuePage({
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
  const queue = await getAdminContributions(query);
  const nextQuery = new URLSearchParams(query);
  if (queue.pagination.nextCursor) nextQuery.set('cursor', queue.pagination.nextCursor);

  return (
    <AdminShell current="moderation" userEmail={user.email}>
      <AdminTopbar
        description="Antrean privat · urutan stabil berbasis cursor"
        title="Kontribusi"
        trailing={<Badge tone="info">{queue.items.length} ditampilkan</Badge>}
      />

      <Card className="mt-6">
        <form action="/contributions" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="grid gap-1.5 text-sm font-semibold xl:col-span-2">
            Cari nama atau alamat
            <SearchField
              defaultValue={scalar(raw.search)}
              minLength={2}
              name="search"
              placeholder="Minimal 2 karakter"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            Status
            <select
              className="min-h-12 rounded-button border border-border bg-surface px-3.5"
              defaultValue={scalar(raw.status)}
              name="status"
            >
              <option value="">Semua status</option>
              <option value="PENDING">Menunggu review</option>
              <option value="IN_REVIEW">Sedang direview</option>
              <option value="NEEDS_REVISION">Perlu perbaikan</option>
              <option value="APPROVED">Disetujui</option>
              <option value="REJECTED">Ditolak</option>
              <option value="MERGED">Dipublikasikan</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            Kategori
            <select
              className="min-h-12 rounded-button border border-border bg-surface px-3.5"
              defaultValue={scalar(raw.category)}
              name="category"
            >
              <option value="">Semua kategori</option>
              {Object.entries(categoryLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            Sumber
            <select
              className="min-h-12 rounded-button border border-border bg-surface px-3.5"
              defaultValue={scalar(raw.source)}
              name="source"
            >
              <option value="">Semua sumber</option>
              {Object.entries(sourceLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            ID kontributor
            <Input
              defaultValue={scalar(raw.contributorId)}
              maxLength={26}
              minLength={26}
              name="contributorId"
              placeholder="ULID 26 karakter"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            Dari tanggal
            <Input defaultValue={scalar(raw.from)} name="from" type="date" />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            Sampai tanggal
            <Input defaultValue={scalar(raw.to)} name="to" type="date" />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            Urutan
            <select
              className="min-h-12 rounded-button border border-border bg-surface px-3.5"
              defaultValue={scalar(raw.sort) || 'SUBMITTED_DESC'}
              name="sort"
            >
              <option value="SUBMITTED_DESC">Terbaru</option>
              <option value="SUBMITTED_ASC">Terlama</option>
            </select>
          </label>
          <div className="flex items-end gap-2 xl:col-span-4">
            <Button type="submit">Terapkan filter</Button>
            <LinkButton href="/contributions" variant="ghost">
              Reset
            </LinkButton>
          </div>
        </form>
      </Card>

      {queue.items.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="Tidak ada kontribusi">
            Ubah filter atau tunggu kontribusi baru dikirim.
          </EmptyState>
        </div>
      ) : (
        <Card className="mt-6 overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-left text-sm">
              <caption className="sr-only">Antrean kontribusi untuk dimoderasi</caption>
              <thead className="bg-app text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold" scope="col">
                    Tempat
                  </th>
                  <th className="px-4 py-3 font-semibold" scope="col">
                    Status
                  </th>
                  <th className="px-4 py-3 font-semibold" scope="col">
                    Reviewer
                  </th>
                  <th className="px-4 py-3 font-semibold" scope="col">
                    Dikirim
                  </th>
                  <th className="px-4 py-3 font-semibold" scope="col">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {queue.items.map((item) => (
                  <tr key={item.id}>
                    <th className="px-4 py-4 font-normal" scope="row">
                      <p className="font-semibold">{item.placeName}</p>
                      <p className="mt-1 text-muted">
                        {categoryLabels[item.category]} · {sourceLabels[item.source]}
                      </p>
                    </th>
                    <td className="px-4 py-4">
                      <StatusBadge status={toUiStatus(item.status)} />
                    </td>
                    <td className="px-4 py-4 text-muted">
                      {item.currentReviewer
                        ? `${item.currentReviewer.email}${item.currentReviewer.claimExpired ? ' · kedaluwarsa' : ''}`
                        : 'Belum diambil'}
                    </td>
                    <td className="px-4 py-4">
                      <time dateTime={item.submittedAt}>{formatDateTime(item.submittedAt)}</time>
                    </td>
                    <td className="px-4 py-4">
                      <LinkButton href={`/contributions/${item.id}`} variant="ghost">
                        Tinjau
                      </LinkButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <nav
        aria-label="Navigasi cursor antrean"
        className="mt-6 flex items-center justify-end gap-3"
      >
        {scalar(raw.cursor) ? (
          <span className="text-sm text-muted">
            Gunakan tombol kembali untuk halaman sebelumnya.
          </span>
        ) : null}
        {queue.pagination.hasMore ? (
          <LinkButton href={`/contributions?${nextQuery.toString()}`} variant="ghost">
            Halaman berikutnya
          </LinkButton>
        ) : (
          <span className="text-sm text-muted">Akhir antrean</span>
        )}
      </nav>
    </AdminShell>
  );
}
