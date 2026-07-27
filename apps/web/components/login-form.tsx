'use client';

import { Alert, Button, FormField, Input, LinkButton } from '@pitstop/ui';
import { type MagicLinkRequestInput, magicLinkRequestSchema } from '@pitstop/validation';
import { useMutation } from '@tanstack/react-query';
import { MailCheck } from 'lucide-react';
import Link from 'next/link';
import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import { requestMagicLink } from '../lib/api/client';
import { useAuth } from './auth-provider';
import { GuestShell } from './guest-shell';

const GENERIC_SUCCESS = 'Jika email dapat digunakan, tautan masuk telah dikirim.';

const stateMessages = {
  expired: 'Tautan masuk sudah kedaluwarsa. Minta tautan baru untuk melanjutkan.',
  invalid: 'Tautan masuk tidak valid atau sudah pernah digunakan.',
  unavailable: 'Verifikasi belum dapat dilakukan. Coba lagi beberapa saat lagi.',
} as const;

export type LoginState = keyof typeof stateMessages;

export function LoginForm({ returnTo, state }: Readonly<{ returnTo: string; state?: LoginState }>) {
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const stateNotice = useRef<HTMLDivElement>(null);
  const requestMutation = useMutation({
    mutationFn: (input: MagicLinkRequestInput) => requestMagicLink(input),
  });

  useEffect(() => {
    if (state) stateNotice.current?.focus();
  }, [state]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFieldError(undefined);
    const parsed = magicLinkRequestSchema.safeParse({ email, returnTo });
    if (!parsed.success) {
      setFieldError(
        parsed.error.flatten().fieldErrors.email?.[0] ?? 'Periksa kembali alamat email.',
      );
      return;
    }
    requestMutation.mutate(parsed.data);
  };

  if (auth.status === 'authenticated') {
    return (
      <GuestShell backHref="/" title="Akun">
        <main className="grid flex-1 content-start gap-5 px-4 py-8" id="main-content">
          <h1 className="text-2xl font-bold">Kamu sudah masuk</h1>
          <p className="text-muted">
            Sesi aktif sebagai {auth.session?.authenticated ? auth.session.user.email : 'pengguna'}.
          </p>
          <LinkButton href={returnTo} size="full">
            Lanjutkan
          </LinkButton>
        </main>
      </GuestShell>
    );
  }

  return (
    <GuestShell backHref="/" title="Masuk">
      <main className="grid flex-1 content-start gap-6 px-4 py-8" id="main-content">
        <div className="grid gap-2">
          <h1 className="text-2xl font-bold">Masuk tanpa kata sandi</h1>
          <p className="text-muted">
            Kami akan mengirim tautan sekali pakai ke emailmu. Menjelajah sebagai tamu tetap
            tersedia.
          </p>
        </div>

        {state ? (
          <div
            className="rounded-card outline-none focus-visible:ring-2 focus-visible:ring-focus"
            ref={stateNotice}
            tabIndex={-1}
          >
            <Alert
              title="Tautan tidak dapat digunakan"
              tone={state === 'unavailable' ? 'danger' : 'warning'}
            >
              {stateMessages[state]}
            </Alert>
          </div>
        ) : null}

        {requestMutation.isSuccess ? (
          <section
            aria-live="polite"
            className="grid justify-items-center gap-4 rounded-card border border-border bg-surface p-6 text-center shadow-card"
          >
            <MailCheck aria-hidden="true" className="size-10 text-brand" />
            <h2 className="text-lg font-semibold">Periksa emailmu</h2>
            <p>{GENERIC_SUCCESS}</p>
            <p className="text-sm text-muted">
              Tautan hanya dapat digunakan satu kali dan akan segera kedaluwarsa.
            </p>
            <Button
              onClick={() => requestMutation.reset()}
              size="full"
              type="button"
              variant="secondary"
            >
              Gunakan email lain
            </Button>
          </section>
        ) : (
          <form className="grid gap-5" noValidate onSubmit={submit}>
            <FormField
              description="Kami hanya menggunakan email ini untuk mengirim tautan masuk."
              label="Email"
              required
              {...(fieldError ? { error: fieldError } : {})}
            >
              {(properties) => (
                <Input
                  {...properties}
                  autoComplete="email"
                  inputMode="email"
                  maxLength={320}
                  name="email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="nama@contoh.com"
                  type="email"
                  value={email}
                />
              )}
            </FormField>
            {requestMutation.isError ? (
              <Alert title="Permintaan gagal" tone="danger">
                Tautan belum dapat dikirim. Coba lagi beberapa saat lagi.
              </Alert>
            ) : null}
            <Button
              loading={requestMutation.isPending}
              loadingLabel="Mengirim tautan…"
              size="full"
              type="submit"
            >
              Kirim tautan masuk
            </Button>
          </form>
        )}

        <p className="text-center text-sm text-muted">
          <Link
            className="rounded-small font-semibold text-brand underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-focus"
            href="/"
          >
            Kembali menjelajah sebagai tamu
          </Link>
        </p>
      </main>
    </GuestShell>
  );
}
