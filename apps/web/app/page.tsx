import {
  Alert,
  AppHeader,
  Badge,
  Button,
  Card,
  MobileBottomNavigation,
  MobilePageShell,
  SkipLink,
} from '@pitstop/ui';

export default function WebFoundationPage() {
  return (
    <>
      <SkipLink />
      <MobilePageShell>
        <AppHeader />
        <main className="flex flex-1 flex-col gap-4 px-4 py-5" id="main-content">
          <Badge className="w-fit" tone="success">
            Phase 2
          </Badge>
          <div>
            <h1 className="text-[length:var(--pitstop-type-heading-h1-size)] font-bold leading-[var(--pitstop-type-heading-h1-line)]">
              Foundation siap digunakan
            </h1>
            <p className="mt-2 text-base leading-6 text-muted">
              Shell mobile PitStop menggunakan token, komponen, dan pola aksesibilitas bersama.
            </p>
          </div>
          <Alert title="UI Preview" tone="info">
            Halaman ini sengaja belum memuat rekomendasi, lokasi, peta, atau data bisnis.
          </Alert>
          <Card>
            <h2 className="text-lg font-semibold">Guest-first foundation</h2>
            <p className="mt-2 text-sm text-muted">
              Navigasi dapat digunakan dengan keyboard dan target sentuh mengikuti minimum 48 px.
            </p>
            <Button className="mt-4 w-full" disabled>
              Fitur tersedia pada phase berikutnya
            </Button>
          </Card>
        </main>
        <MobileBottomNavigation />
      </MobilePageShell>
    </>
  );
}
