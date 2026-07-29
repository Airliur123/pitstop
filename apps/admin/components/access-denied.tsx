import { Alert, Card, LinkButton } from '@pitstop/ui';

export function AccessDenied({ email }: Readonly<{ email: string }>) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl items-center px-4 py-10" id="main-content">
      <Card className="w-full p-6">
        <h1 className="text-2xl font-bold">Akses admin diperlukan</h1>
        <Alert className="mt-5" title="Akun tidak memiliki izin" tone="danger">
          Akun {email} telah masuk, tetapi bukan administrator PitStop.
        </Alert>
        <p className="mt-4 text-sm text-muted">
          Hubungi pengelola akses bila peran akun ini seharusnya administrator.
        </p>
        <LinkButton className="mt-6" href="/login" variant="ghost">
          Gunakan akun lain
        </LinkButton>
      </Card>
    </main>
  );
}
