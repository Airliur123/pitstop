'use client';

import type { ConfirmationType, PublicPlaceDetail } from '@pitstop/contracts';
import { Alert, Button, Card, Dialog, FormField, LinkButton, Textarea } from '@pitstop/ui';
import { confirmationSchema } from '@pitstop/validation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { confirmPlace } from '../lib/api/client';
import { queryKeys } from '../lib/query-keys';
import { useAuth } from './auth-provider';

const confirmationLabels: Readonly<Record<ConfirmationType, string>> = {
  FACILITIES_ACCURATE: 'Fasilitas masih akurat',
  PRICE_ACCURATE: 'Harga masih akurat',
  STILL_VALID: 'Semua informasi utama masih akurat',
};

export function PlaceGovernanceActions({ place }: Readonly<{ place: PublicPlaceDetail }>) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const key = useRef<string | null>(null);
  const [confirmationType, setConfirmationType] = useState<ConfirmationType>('STILL_VALID');
  const [note, setNote] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const confirmation = useMutation({
    mutationFn: () => {
      const parsed = confirmationSchema.safeParse({
        confirmationType,
        confirmedAt: new Date().toISOString(),
        expectedPlaceVersion: place.version,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      if (!parsed.success) {
        throw new ConfirmationValidationError(
          parsed.error.issues[0]?.message ?? 'Konfirmasi belum valid.',
        );
      }
      key.current ??= globalThis.crypto.randomUUID();
      return confirmPlace(place.id, parsed.data, key.current);
    },
    onMutate: () => setValidationError(null),
    onError: (error) => {
      if (error instanceof ConfirmationValidationError) setValidationError(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.privateData() });
    },
  });

  return (
    <Card className="grid gap-3 shadow-none">
      <div>
        <h2 className="text-[15px] font-semibold">Bantu jaga informasi</h2>
        <p className="mt-1 text-[13px] text-muted">
          Laporkan koreksi atau konfirmasi berdasarkan kunjungan terbaru. Konfirmasi tidak menyimpan
          GPS kamu.
        </p>
      </div>
      {auth.status === 'authenticated' ? (
        <>
          <Dialog
            description="Konfirmasi berlaku 90 hari dan dihitung satu kali per pengguna."
            title="Konfirmasi informasi tempat"
            trigger={
              <Button size="full" variant="secondary">
                Informasi masih akurat
              </Button>
            }
          >
            <div className="grid gap-4">
              <label className="grid gap-1.5 text-sm font-semibold" htmlFor="confirmation-type">
                Yang dikonfirmasi
                <select
                  className="min-h-12 rounded-button border border-border bg-surface px-3.5 text-base outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  id="confirmation-type"
                  onChange={(event) => setConfirmationType(event.target.value as ConfirmationType)}
                  value={confirmationType}
                >
                  {Object.entries(confirmationLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <FormField
                description="Maksimal 300 karakter. Hindari data pribadi."
                label="Catatan (opsional)"
              >
                {(properties) => (
                  <Textarea
                    {...properties}
                    maxLength={300}
                    onChange={(event) => setNote(event.target.value)}
                    value={note}
                  />
                )}
              </FormField>
              {validationError || confirmation.isError ? (
                <Alert title="Konfirmasi belum tersimpan" tone="danger">
                  {validationError ?? 'Periksa koneksi atau batas konfirmasi, lalu coba lagi.'}
                </Alert>
              ) : null}
              {confirmation.isSuccess ? (
                <Alert title="Konfirmasi tersimpan" tone="success">
                  Masa berlaku konfirmasi berakhir{' '}
                  {new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(
                    new Date(confirmation.data.data.expiresAt),
                  )}
                  . Retry tidak menambah jumlah konfirmasi.
                </Alert>
              ) : (
                <Button
                  disabled={confirmation.isPending}
                  onClick={() => confirmation.mutate()}
                  size="full"
                >
                  {confirmation.isPending ? 'Menyimpan…' : 'Simpan konfirmasi'}
                </Button>
              )}
            </div>
          </Dialog>
          <LinkButton href={`/places/${place.slug}/report`} size="full" variant="secondary">
            Laporkan perubahan
          </LinkButton>
        </>
      ) : (
        <LinkButton
          href={`/login?returnTo=${encodeURIComponent(`/places/${place.slug}`)}`}
          size="full"
          variant="secondary"
        >
          Masuk untuk melapor atau konfirmasi
        </LinkButton>
      )}
    </Card>
  );
}

class ConfirmationValidationError extends Error {}
