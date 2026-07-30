import { Skeleton } from '@pitstop/ui';

import { AdminShell } from '../../components/admin-shell';

export default function AuditLoading() {
  return (
    <AdminShell current="audit">
      <div aria-busy="true" className="grid gap-6">
        <span className="sr-only">Memuat audit log</span>
        <Skeleton className="h-20" />
        <Skeleton className="h-32" />
        <Skeleton className="h-96" />
      </div>
    </AdminShell>
  );
}
