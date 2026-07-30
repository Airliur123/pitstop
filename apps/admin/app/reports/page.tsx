import type { ReportStatus, ReportType } from '@pitstop/contracts';
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
import { getAdminReports } from '../../lib/api/server';
import { requireAuthenticatedUser } from '../../lib/auth';
import { categoryLabels, formatDateTime } from '../../lib/format';

export const dynamic = 'force-dynamic';

const acceptedParameters = [
  'category',
  'cursor',
  'from',
  'limit',
  'reportType',
  'reviewer',
  'search',
  'sort',
  'status',
  'to',
] as const;
const reportLabels: Readonly<Record<ReportType, string>> = {
  CATEGORY_INCORRECT: 'Kategori salah',
  DUPLICATE_PLACE: 'Tempat duplikat',
  FACILITY_CHANGED: 'Fasilitas berubah',
  HOURS_CHANGED: 'Jam berubah',
  LOCATION_INCORRECT: 'Lokasi salah',
  OTHER: 'Koreksi lain',
  PERMANENTLY_CLOSED: 'Tutup permanen',
  PRICE_CHANGED: 'Harga/menu berubah',
  TEMPORARILY_CLOSED: 'Tutup sementara',
};
type PageSearchParameters = Promise<Record<string, string | string[] | undefined>>;

function scalar(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : '';
}

export default async function ReportsQueuePage({
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
  const queue = await getAdminReports(query);
  const nextQuery = new URLSearchParams(query);
  if (queue.pagination.nextCursor) nextQuery.set('cursor', queue.pagination.nextCursor);

  return (
    <AdminShell current="reports" userEmail={user.email}>
      <AdminTopbar
        description="Antrean governance privat · urutan stabil berbasis cursor"
        title="Place reports"
        trailing={<Badge tone="info">{queue.items.length} ditampilkan</Badge>}
      />
      <Card className="mt-6">
        <form action="/reports" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="grid gap-1.5 text-sm font-semibold xl:col-span-2">
            Cari Place atau alamat
            <SearchField
              defaultValue={scalar(raw.search)}
              minLength={2}
              name="search"
              placeholder="Minimal 2 karakter"
            />
          </label>
          <FilterSelect
            defaultValue={scalar(raw.status)}
            label="Status"
            name="status"
            options={[
              ['PENDING', 'Menunggu review'],
              ['IN_REVIEW', 'Sedang direview'],
              ['APPLIED', 'Diterapkan'],
              ['REJECTED', 'Ditolak'],
            ]}
          />
          <FilterSelect
            defaultValue={scalar(raw.reportType)}
            label="Jenis report"
            name="reportType"
            options={Object.entries(reportLabels)}
          />
          <FilterSelect
            defaultValue={scalar(raw.category)}
            label="Kategori"
            name="category"
            options={Object.entries(categoryLabels)}
          />
          <FilterSelect
            defaultValue={scalar(raw.reviewer)}
            label="Reviewer"
            name="reviewer"
            options={[
              ['CLAIMED', 'Sudah diklaim'],
              ['UNCLAIMED', 'Belum diklaim'],
              ['EXPIRED', 'Lease kedaluwarsa'],
            ]}
          />
          <label className="grid gap-1.5 text-sm font-semibold">
            Dari tanggal
            <Input defaultValue={scalar(raw.from)} name="from" type="date" />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            Sampai tanggal
            <Input defaultValue={scalar(raw.to)} name="to" type="date" />
          </label>
          <FilterSelect
            defaultValue={scalar(raw.sort) || 'SUBMITTED_DESC'}
            label="Urutan"
            name="sort"
            options={[
              ['SUBMITTED_DESC', 'Terbaru'],
              ['SUBMITTED_ASC', 'Terlama'],
            ]}
          />
          <div className="flex items-end gap-2 xl:col-span-4">
            <Button type="submit">Terapkan filter</Button>
            <LinkButton href="/reports" variant="ghost">
              Reset
            </LinkButton>
          </div>
        </form>
      </Card>

      {queue.items.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="Tidak ada report">
            Ubah filter atau tunggu laporan pengguna baru.
          </EmptyState>
        </div>
      ) : (
        <Card className="mt-6 overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] border-collapse text-left text-sm">
              <caption className="sr-only">Antrean Place report</caption>
              <thead className="bg-app text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold" scope="col">
                    Place
                  </th>
                  <th className="px-4 py-3 font-semibold" scope="col">
                    Report
                  </th>
                  <th className="px-4 py-3 font-semibold" scope="col">
                    Status
                  </th>
                  <th className="px-4 py-3 font-semibold" scope="col">
                    Reporter
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
                      <p className="font-semibold">{item.place.name}</p>
                      <p className="mt-1 text-muted">
                        {categoryLabels[item.category]} · Place v{item.place.version}
                      </p>
                    </th>
                    <td className="px-4 py-4">{reportLabels[item.reportType]}</td>
                    <td className="px-4 py-4">
                      <StatusBadge status={reportStatus(item.status)} />
                    </td>
                    <td className="px-4 py-4 text-muted">{item.reporter.maskedEmail}</td>
                    <td className="px-4 py-4 text-muted">
                      {item.currentReviewer
                        ? `${item.currentReviewer.email}${item.currentReviewer.claimExpired ? ' · lease berakhir' : ''}`
                        : 'Belum diambil'}
                    </td>
                    <td className="px-4 py-4">
                      <time dateTime={item.submittedAt}>{formatDateTime(item.submittedAt)}</time>
                    </td>
                    <td className="px-4 py-4">
                      <LinkButton href={`/reports/${item.id}`} variant="ghost">
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

      <nav aria-label="Navigasi cursor report" className="mt-6 flex justify-end gap-3">
        {scalar(raw.cursor) ? (
          <span className="text-sm text-muted">
            Gunakan tombol kembali untuk halaman sebelumnya.
          </span>
        ) : null}
        {queue.pagination.hasMore ? (
          <LinkButton href={`/reports?${nextQuery.toString()}`} variant="ghost">
            Halaman berikutnya
          </LinkButton>
        ) : (
          <span className="text-sm text-muted">Akhir antrean</span>
        )}
      </nav>
    </AdminShell>
  );
}

function FilterSelect({
  defaultValue,
  label,
  name,
  options,
}: Readonly<{
  defaultValue: string;
  label: string;
  name: string;
  options: readonly (readonly [string, string])[];
}>) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold">
      {label}
      <select
        className="min-h-12 rounded-button border border-border bg-surface px-3.5"
        defaultValue={defaultValue}
        name={name}
      >
        <option value="">Semua</option>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function reportStatus(status: ReportStatus): 'approved' | 'pending' | 'rejected' | 'reviewing' {
  if (status === 'APPLIED') return 'approved';
  if (status === 'REJECTED') return 'rejected';
  if (status === 'IN_REVIEW') return 'reviewing';
  return 'pending';
}
