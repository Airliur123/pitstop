import { EmptyState, LinkButton } from '@pitstop/ui';

import { AdminShell } from '../../../components/admin-shell';

export default function ReportNotFound() {
  return (
    <AdminShell current="reports">
      <div className="mx-auto max-w-xl py-16">
        <EmptyState
          action={<LinkButton href="/reports">Kembali ke antrean</LinkButton>}
          title="Report tidak ditemukan"
        >
          Report tidak tersedia atau tidak dapat diakses oleh akun ini.
        </EmptyState>
      </div>
    </AdminShell>
  );
}
