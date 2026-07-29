import { EmptyState, LinkButton } from '@pitstop/ui';

import { AdminShell } from '../../../components/admin-shell';

export default function ContributionNotFound() {
  return (
    <AdminShell current="moderation">
      <EmptyState
        action={
          <LinkButton href="/contributions" variant="ghost">
            Kembali ke antrean
          </LinkButton>
        }
        title="Kontribusi tidak ditemukan"
      >
        ID tidak valid, kontribusi telah dihapus, atau Anda tidak dapat mengaksesnya.
      </EmptyState>
    </AdminShell>
  );
}
