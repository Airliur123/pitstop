import { Alert, Card, SkipLink } from '@pitstop/ui';

import { LoginForm } from '../../components/login-form';

export default async function AdminLoginPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ state?: string }> }>) {
  const state = (await searchParams).state;
  const callbackMessage =
    state === 'expired'
      ? 'Tautan masuk sudah kedaluwarsa. Minta tautan baru.'
      : state === 'invalid'
        ? 'Tautan masuk tidak valid atau sudah pernah digunakan.'
        : state === 'unavailable'
          ? 'Layanan masuk sedang tidak tersedia. Coba lagi.'
          : null;
  return (
    <>
      <SkipLink />
      <main className="mx-auto flex min-h-dvh max-w-lg items-center px-4 py-10" id="main-content">
        <Card className="w-full p-6 sm:p-8">
          <p className="text-sm font-semibold text-brand">PitStop Admin</p>
          <h1 className="mt-2 text-3xl font-bold">Masuk untuk memoderasi</h1>
          <p className="mt-3 text-sm text-muted">
            Gunakan email administrator. Kami akan mengirim tautan masuk sekali pakai.
          </p>
          {callbackMessage ? (
            <Alert className="mt-5" title="Tautan tidak dapat digunakan" tone="danger">
              {callbackMessage}
            </Alert>
          ) : null}
          <LoginForm />
        </Card>
      </main>
    </>
  );
}
