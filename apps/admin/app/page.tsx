import {
  AdminPageShell,
  AdminSidebar,
  AdminStatCard,
  AdminTopbar,
  Alert,
  Badge,
  Card,
  SkipLink,
} from '@pitstop/ui';

export default function AdminFoundationPage() {
  return (
    <>
      <SkipLink />
      <AdminPageShell>
        <AdminSidebar />
        <main className="min-w-0 px-4 py-6 sm:px-8 sm:py-7" id="main-content">
          <AdminTopbar
            description="Foundation antarmuka administrasi · Data Simulasi"
            title="Dashboard"
            trailing={<Badge tone="success">UI Preview</Badge>}
          />
          <Alert className="mt-6" title="Belum terhubung ke data bisnis" tone="info">
            Shell ini hanya memvalidasi layout, navigasi, token, dan komponen Phase 2.
          </Alert>
          <section
            aria-label="Statistik simulasi"
            className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            <AdminStatCard label="Tempat Aktif" tone="success" value="—" />
            <AdminStatCard label="Menunggu Review" tone="warning" value="—" />
            <AdminStatCard label="Laporan Baru" tone="danger" value="—" />
            <AdminStatCard label="Perlu Diperbarui" value="—" />
          </section>
          <Card className="mt-5">
            <h2 className="text-lg font-semibold">Konten admin</h2>
            <p className="mt-2 text-sm text-muted">
              Workflow moderasi, autentikasi, CRUD, dan statistik API sengaja ditunda.
            </p>
          </Card>
        </main>
      </AdminPageShell>
    </>
  );
}
