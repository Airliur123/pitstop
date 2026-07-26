import { LinkButton } from '@pitstop/ui';

import { GuestShell } from '../../../components/guest-shell';

export default function PlaceNotFound() {
  return (
    <GuestShell backHref="/places" title="Detail Tempat">
      <main
        className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-12 text-center"
        id="main-content"
      >
        <h1 className="text-xl font-bold">Tempat tidak ditemukan</h1>
        <p className="max-w-72 text-sm text-muted">
          Tautan mungkin sudah berubah atau tempat ini tidak tersedia untuk publik.
        </p>
        <LinkButton href="/places" variant="secondary">
          Kembali ke rekomendasi
        </LinkButton>
      </main>
    </GuestShell>
  );
}
