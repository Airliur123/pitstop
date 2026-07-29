import { AdminTopbar, Skeleton } from '@pitstop/ui';

import { AdminShell } from '../components/admin-shell';

export default function AdminLoading() {
  return (
    <AdminShell current="dashboard">
      <AdminTopbar description="Memuat data privat…" title="Dashboard moderasi" />
      <div
        aria-busy="true"
        aria-label="Memuat dashboard"
        className="mt-6 grid gap-4 sm:grid-cols-2"
      >
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
    </AdminShell>
  );
}
