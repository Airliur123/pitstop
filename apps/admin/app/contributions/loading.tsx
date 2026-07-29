import { AdminTopbar, Skeleton } from '@pitstop/ui';

import { AdminShell } from '../../components/admin-shell';

export default function ContributionsLoading() {
  return (
    <AdminShell current="moderation">
      <AdminTopbar description="Memuat antrean privat…" title="Kontribusi" />
      <div aria-busy="true" aria-label="Memuat antrean" className="mt-6 space-y-4">
        <Skeleton className="h-48" />
        <Skeleton className="h-72" />
      </div>
    </AdminShell>
  );
}
