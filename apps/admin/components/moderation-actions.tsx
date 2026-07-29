'use client';

import type { AdminContributionDetail } from '@pitstop/contracts';
import { Alert, Button, Dialog, FormField, Input, Textarea } from '@pitstop/ui';
import { useRouter } from 'next/navigation';
import { type FormEvent, useRef, useState } from 'react';

import { AdminApiProblem, mutateContribution } from '../lib/api/client';

type Action = 'approve' | 'claim' | 'merge' | 'needs-revision' | 'reject';

interface Attempt {
  readonly key: string;
  readonly signature: string;
}

export function ModerationActions({
  adminId,
  contribution,
}: Readonly<{ adminId: string; contribution: AdminContributionDetail }>) {
  const router = useRouter();
  const attempts = useRef(new Map<Action, Attempt>());
  const [pending, setPending] = useState<Action | null>(null);
  const [feedback, setFeedback] = useState<{ action: Action; message: string } | null>(null);
  const reviewer = contribution.currentReviewer;
  const isReviewer = reviewer?.id === adminId && !reviewer.claimExpired;
  const canClaim =
    contribution.status === 'PENDING' ||
    (contribution.status === 'IN_REVIEW' && Boolean(reviewer?.claimExpired));

  async function execute(action: Action, body: unknown) {
    if (pending) return;
    const signature = JSON.stringify(body);
    const existing = attempts.current.get(action);
    const attempt =
      existing?.signature === signature ? existing : { key: crypto.randomUUID(), signature };
    attempts.current.set(action, attempt);
    setPending(action);
    setFeedback(null);
    try {
      await mutateContribution(contribution.id, action, body, attempt.key);
      attempts.current.delete(action);
      setFeedback({ action, message: 'Perubahan tersimpan.' });
      router.refresh();
    } catch (caught) {
      setFeedback({
        action,
        message:
          caught instanceof AdminApiProblem
            ? `${caught.message}${caught.requestId ? ` (ID permintaan: ${caught.requestId})` : ''}`
            : 'Perubahan belum tersimpan. Periksa koneksi lalu coba lagi.',
      });
    } finally {
      setPending(null);
    }
  }

  if (
    contribution.status === 'MERGED' ||
    contribution.status === 'REJECTED' ||
    contribution.status === 'NEEDS_REVISION'
  ) {
    return (
      <Alert title="Moderasi selesai" tone="info">
        Status ini tidak memiliki tindakan lanjutan dalam Phase 8.
      </Alert>
    );
  }

  if (contribution.status === 'IN_REVIEW' && !isReviewer && !canClaim) {
    return (
      <Alert title="Sedang ditinjau administrator lain" tone="warning">
        {reviewer?.email ?? 'Administrator lain'} memegang review ini hingga{' '}
        {reviewer
          ? new Date(reviewer.claimExpiresAt).toLocaleString('id-ID')
          : 'masa klaim berakhir'}
        .
      </Alert>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {canClaim ? (
          <Dialog
            description="Klaim mencegah administrator lain mengambil keputusan selama 30 menit."
            title={contribution.status === 'PENDING' ? 'Ambil review ini?' : 'Ambil ulang review?'}
            trigger={<Button>Ambil review</Button>}
          >
            <p className="text-sm">
              Versi {contribution.version} akan dipindahkan ke status sedang direview atas nama
              Anda.
            </p>
            <ActionFeedback action="claim" feedback={feedback} />
            <div className="mt-6 flex justify-end">
              <Button
                loading={pending === 'claim'}
                loadingLabel="Mengambil…"
                onClick={() =>
                  execute('claim', {
                    expectedVersion: contribution.version,
                  })
                }
              >
                Konfirmasi klaim
              </Button>
            </div>
          </Dialog>
        ) : null}

        {contribution.status === 'IN_REVIEW' && isReviewer ? (
          <>
            <DecisionDialog
              action="needs-revision"
              execute={execute}
              feedback={feedback}
              label="Minta perbaikan"
              pending={pending}
              title="Minta kontributor memperbaiki data"
              version={contribution.version}
            />
            <DecisionDialog
              action="reject"
              destructive
              execute={execute}
              feedback={feedback}
              label="Tolak"
              pending={pending}
              title="Tolak kontribusi"
              version={contribution.version}
            />
            <ApproveDialog
              contribution={contribution}
              execute={execute}
              feedback={feedback}
              pending={pending}
            />
          </>
        ) : null}

        {contribution.status === 'APPROVED' && reviewer?.id === adminId ? (
          <MergeDialog
            contribution={contribution}
            execute={execute}
            feedback={feedback}
            pending={pending}
          />
        ) : null}
      </div>
      <p aria-live="polite" className="sr-only">
        {pending ? 'Menyimpan perubahan.' : feedback?.message}
      </p>
    </div>
  );
}

function ActionFeedback({
  action,
  feedback,
}: Readonly<{
  action: Action;
  feedback: { action: Action; message: string } | null;
}>) {
  if (!feedback || feedback.action !== action) return null;
  return (
    <Alert className="mt-4" title="Hasil permintaan" tone="info">
      {feedback.message}
    </Alert>
  );
}

function DecisionDialog({
  action,
  destructive = false,
  execute,
  feedback,
  label,
  pending,
  title,
  version,
}: Readonly<{
  action: 'needs-revision' | 'reject';
  destructive?: boolean;
  execute: (action: Action, body: unknown) => Promise<void>;
  feedback: { action: Action; message: string } | null;
  label: string;
  pending: Action | null;
  title: string;
  version: number;
}>) {
  const [reason, setReason] = useState('');
  const error =
    reason.length > 0 && reason.trim().length < 10 ? 'Alasan minimal 10 karakter.' : undefined;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = reason.trim();
    if (normalized.length < 10) return;
    void execute(action, { expectedVersion: version, reason: normalized });
  }

  return (
    <Dialog
      description="Alasan akan tersimpan dalam riwayat audit dan tidak boleh memuat markup aktif."
      title={title}
      trigger={<Button variant={destructive ? 'destructive' : 'secondary'}>{label}</Button>}
    >
      <form onSubmit={submit}>
        <FormField
          description={`${reason.trim().length}/500 karakter`}
          error={error}
          id={`${action}-reason`}
          label="Alasan keputusan"
          required
        >
          {(field) => (
            <Textarea
              {...field}
              maxLength={500}
              minLength={10}
              onChange={(event) => setReason(event.target.value)}
              required
              value={reason}
            />
          )}
        </FormField>
        <ActionFeedback action={action} feedback={feedback} />
        <div className="mt-6 flex justify-end">
          <Button
            loading={pending === action}
            loadingLabel="Menyimpan…"
            type="submit"
            variant={destructive ? 'destructive' : 'primary'}
          >
            Konfirmasi {label.toLocaleLowerCase('id-ID')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ApproveDialog({
  contribution,
  execute,
  feedback,
  pending,
}: Readonly<{
  contribution: AdminContributionDetail;
  execute: (action: Action, body: unknown) => Promise<void>;
  feedback: { action: Action; message: string } | null;
  pending: Action | null;
}>) {
  const [mode, setMode] = useState<'CREATE_NEW' | 'MERGE_EXISTING'>('CREATE_NEW');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const targetPlaceId = String(data.get('targetPlaceId') ?? '').trim();
    const publicationTarget = mode === 'CREATE_NEW' ? { mode } : { mode, targetPlaceId };
    void execute('approve', {
      expectedVersion: contribution.version,
      location: {
        city: String(data.get('city') ?? '').trim(),
        district: String(data.get('district') ?? '').trim(),
        latitude: Number(data.get('latitude')),
        longitude: Number(data.get('longitude')),
        postalCode: String(data.get('postalCode') ?? '').trim() || null,
        province: String(data.get('province') ?? '').trim(),
      },
      publicationTarget,
    });
  }

  return (
    <Dialog
      description="Persetujuan memverifikasi data dan lokasi, tetapi belum menayangkannya ke publik."
      title="Setujui kontribusi"
      trigger={<Button>Setujui</Button>}
    >
      <form className="space-y-4" onSubmit={submit}>
        <Alert title="Lokasi harus diverifikasi" tone="warning">
          Jangan menyalin koordinat kandidat tanpa memeriksa peta. Nilai ini menjadi sumber lokasi
          publik saat merge.
        </Alert>
        <div className="grid gap-4 sm:grid-cols-2">
          <RequiredInput
            label="Latitude"
            max={90}
            min={-90}
            name="latitude"
            step="any"
            type="number"
          />
          <RequiredInput
            label="Longitude"
            max={180}
            min={-180}
            name="longitude"
            step="any"
            type="number"
          />
          <RequiredInput label="Kecamatan" name="district" />
          <RequiredInput label="Kota/kabupaten" name="city" />
          <RequiredInput label="Provinsi" name="province" />
          <FormField id="postalCode" label="Kode pos">
            {(field) => <Input {...field} maxLength={12} name="postalCode" />}
          </FormField>
        </div>
        <label className="grid gap-1.5 text-sm font-semibold">
          Tujuan publikasi
          <select
            className="min-h-12 rounded-button border border-border bg-surface px-3.5"
            onChange={(event) =>
              setMode(event.target.value === 'MERGE_EXISTING' ? 'MERGE_EXISTING' : 'CREATE_NEW')
            }
            value={mode}
          >
            <option value="CREATE_NEW">Buat Place baru saat publikasi</option>
            <option value="MERGE_EXISTING">Gabungkan ke Place aktif</option>
          </select>
        </label>
        {mode === 'MERGE_EXISTING' ? (
          <RequiredInput
            description="ULID Place aktif yang sudah diverifikasi."
            label="ID Place target"
            maxLength={26}
            minLength={26}
            name="targetPlaceId"
          />
        ) : null}
        <ActionFeedback action="approve" feedback={feedback} />
        <div className="flex justify-end">
          <Button loading={pending === 'approve'} loadingLabel="Menyetujui…" type="submit">
            Verifikasi dan setujui
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function MergeDialog({
  contribution,
  execute,
  feedback,
  pending,
}: Readonly<{
  contribution: AdminContributionDetail;
  execute: (action: Action, body: unknown) => Promise<void>;
  feedback: { action: Action; message: string } | null;
  pending: Action | null;
}>) {
  return (
    <Dialog
      description="Publikasi dilakukan dalam satu transaksi database dan akan mengaktifkan data untuk pengguna."
      title="Publikasikan kontribusi?"
      trigger={<Button variant="destructive">Publikasikan</Button>}
    >
      <Alert title="Tindakan berdampak publik" tone="danger">
        Data kanonis, fasilitas, jam operasional, dan lokasi terverifikasi akan dibuat atau
        digabungkan ke Place aktif. Periksa seluruh ringkasan sebelum melanjutkan.
      </Alert>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
        <dt className="text-muted">Nama</dt>
        <dd className="font-semibold">{contribution.payload.placeName}</dd>
        <dt className="text-muted">Target</dt>
        <dd>
          {contribution.publicationTarget?.mode === 'MERGE_EXISTING'
            ? contribution.publicationTarget.targetPlaceId
            : 'Place baru'}
        </dd>
        <dt className="text-muted">Lokasi</dt>
        <dd>
          {contribution.verifiedLocation
            ? `${contribution.verifiedLocation.latitude}, ${contribution.verifiedLocation.longitude}`
            : 'Tidak tersedia'}
        </dd>
      </dl>
      <ActionFeedback action="merge" feedback={feedback} />
      <div className="mt-6 flex justify-end">
        <Button
          loading={pending === 'merge'}
          loadingLabel="Mempublikasikan…"
          onClick={() =>
            execute('merge', {
              expectedVersion: contribution.version,
            })
          }
          variant="destructive"
        >
          Ya, publikasikan
        </Button>
      </div>
    </Dialog>
  );
}

function RequiredInput({
  description,
  label,
  name,
  ...properties
}: Readonly<{
  description?: string;
  label: string;
  name: string;
}> &
  React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FormField description={description} id={name} label={label} required>
      {(field) => <Input {...field} {...properties} name={name} required />}
    </FormField>
  );
}
