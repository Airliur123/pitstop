import { Card, Skeleton } from '@pitstop/ui';

import { AdminShell } from '../../components/admin-shell';

export default function ReportsLoading() {
  return (
    <AdminShell current="reports">
      <div aria-busy="true" className="grid gap-6">
        <span className="sr-only">Memuat antrean report</span>
        <Skeleton className="h-20" />
        <Card className="grid gap-3">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </Card>
        <Skeleton className="h-80" />
      </div>
    </AdminShell>
  );
}
