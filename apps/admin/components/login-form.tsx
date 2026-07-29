'use client';

import { Alert, Button, FormField, Input, Spinner } from '@pitstop/ui';
import { type FormEvent, useState } from 'react';

import { AdminApiProblem, requestMagicLink } from '../lib/api/client';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await requestMagicLink(email);
      setSent(true);
    } catch (caught) {
      setError(
        caught instanceof AdminApiProblem
          ? caught.message
          : 'Tautan masuk belum dapat dikirim. Coba lagi.',
      );
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <Alert title="Periksa email Anda" tone="success">
        Jika alamat tersebut terdaftar, tautan masuk admin sudah dikirim. Tautan hanya dapat
        digunakan sekali.
      </Alert>
    );
  }

  return (
    <form className="mt-6 space-y-5" onSubmit={submit}>
      <FormField id="email" label="Email administrator" required>
        {(field) => (
          <Input
            {...field}
            autoComplete="email"
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        )}
      </FormField>
      {error ? (
        <Alert title="Tidak dapat mengirim tautan" tone="danger">
          {error}
        </Alert>
      ) : null}
      <Button className="w-full" disabled={pending} type="submit">
        {pending ? (
          <>
            <Spinner aria-hidden="true" /> Mengirim…
          </>
        ) : (
          'Kirim tautan masuk'
        )}
      </Button>
    </form>
  );
}
