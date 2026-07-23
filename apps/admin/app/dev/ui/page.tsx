import {
  AdminPageShell,
  AdminSidebar,
  AdminStatCard,
  AdminTopbar,
  Badge,
  Card,
  ContributionListItem,
  SkipLink,
} from '@pitstop/ui';
import { notFound } from 'next/navigation';

export default function AdminUiCatalogPage() {
  if (process.env.NEXT_PUBLIC_ENABLE_UI_CATALOG !== 'true') {
    notFound();
  }

  return (
    <>
      <SkipLink />
      <AdminPageShell>
        <AdminSidebar current="moderation" />
        <main className="min-w-0 px-4 py-6 sm:px-8" id="main-content">
          <AdminTopbar
            description="Development-only component catalog"
            title="Admin UI Preview"
            trailing={<Badge tone="warning">Data Simulasi</Badge>}
          />
          <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <AdminStatCard label="Neutral" value="12" />
            <AdminStatCard label="Success" tone="success" value="5" />
            <AdminStatCard label="Warning" tone="warning" value="3" />
            <AdminStatCard label="Danger" tone="danger" value="1" />
          </section>
          <Card className="mt-5 grid gap-3">
            <h2 className="text-lg font-semibold">Contribution list states</h2>
            <ContributionListItem
              meta="UI Preview · tidak tersimpan"
              status="pending"
              title="Kontribusi simulasi"
            />
            <ContributionListItem
              meta="Teks panjang untuk menguji pembungkusan pada viewport sempit"
              status="revision"
              title="Nama kontribusi sangat panjang untuk validasi layout responsif"
            />
          </Card>
        </main>
      </AdminPageShell>
    </>
  );
}
