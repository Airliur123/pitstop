'use client';

import type { AdminReportDetail } from '@pitstop/contracts';
import { Alert, Button, Dialog, FormField, Textarea } from '@pitstop/ui';
import { useRouter } from 'next/navigation';
import { type FormEvent, useRef, useState } from 'react';

import { AdminApiProblem, mutateReport } from '../lib/api/client';

type Action = 'apply' | 'claim' | 'reject';
interface Attempt {
  readonly key: string;
  readonly signature: string;
}

export function ReportActions({
  adminId,
  report,
}: Readonly<{ adminId: string; report: AdminReportDetail }>) {
  const router = useRouter();
  const attempts = useRef(new Map<Action, Attempt>());
  const [pending, setPending] = useState<Action | null>(null);
  const [feedback, setFeedback] = useState<{ action: Action; message: string } | null>(null);
  const reviewer = report.currentReviewer;
  const isReviewer = reviewer?.id === adminId && !reviewer.claimExpired;
  const canClaim =
    report.status === 'PENDING' ||
    (report.status === 'IN_REVIEW' && Boolean(report.currentReviewer?.claimExpired));

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
      await mutateReport(report.id, action, body, attempt.key);
      attempts.current.delete(action);
      setFeedback({ action, message: 'Perubahan tersimpan.' });
      router.refresh();
    } catch (error) {
      setFeedback({
        action,
        message:
          error instanceof AdminApiProblem
            ? `${error.message}${error.requestId ? ` (ID permintaan: ${error.requestId})` : ''}`
            : 'Perubahan belum tersimpan. Periksa koneksi lalu coba lagi.',
      });
    } finally {
      setPending(null);
    }
  }

  if (report.status === 'APPLIED' || report.status === 'REJECTED') {
    return (
      <Alert title="Review selesai" tone="info">
        Report berstatus {report.status} dan tidak memiliki tindakan lanjutan.
      </Alert>
    );
  }
  if (report.status === 'IN_REVIEW' && !isReviewer && !canClaim) {
    return (
      <Alert title="Diklaim administrator lain" tone="warning">
        {reviewer?.email ?? 'Administrator lain'} memegang review sampai{' '}
        {reviewer ? new Date(reviewer.claimExpiresAt).toLocaleString('id-ID') : 'lease berakhir'}.
      </Alert>
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      {canClaim ? (
        <Dialog
          description="Klaim memiliki lease 30 menit dan dicatat dalam audit log."
          title={report.status === 'PENDING' ? 'Ambil report ini?' : 'Pulihkan lease review?'}
          trigger={<Button>Ambil review</Button>}
        >
          <p className="text-sm">
            Report versi {report.version} akan diklaim atas nama akun admin ini.
          </p>
          <Feedback action="claim" feedback={feedback} />
          <div className="mt-6 flex justify-end">
            <Button
              loading={pending === 'claim'}
              loadingLabel="Mengambil…"
              onClick={() => execute('claim', { expectedVersion: report.version })}
            >
              Konfirmasi klaim
            </Button>
          </div>
        </Dialog>
      ) : null}
      {report.status === 'IN_REVIEW' && isReviewer ? (
        <>
          <ResolutionDialog
            action="reject"
            execute={execute}
            feedback={feedback}
            pending={pending}
            report={report}
          />
          <ResolutionDialog
            action="apply"
            execute={execute}
            feedback={feedback}
            pending={pending}
            report={report}
          />
        </>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {pending ? 'Menyimpan perubahan.' : feedback?.message}
      </p>
    </div>
  );
}

function ResolutionDialog({
  action,
  execute,
  feedback,
  pending,
  report,
}: Readonly<{
  action: 'apply' | 'reject';
  execute: (action: Action, body: unknown) => Promise<void>;
  feedback: { action: Action; message: string } | null;
  pending: Action | null;
  report: AdminReportDetail;
}>) {
  const [resolution, setResolution] = useState('');
  const error =
    resolution.length > 0 && resolution.trim().length < 10
      ? 'Resolusi minimal 10 karakter.'
      : undefined;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = resolution.trim();
    if (normalized.length < 10) return;
    void execute(
      action,
      action === 'apply'
        ? {
            approvedPatch: report.proposal,
            expectedPlaceVersion: report.currentPlace.version,
            expectedReportVersion: report.version,
            resolution: normalized,
          }
        : { expectedVersion: report.version, resolution: normalized },
    );
  }

  return (
    <Dialog
      description={
        action === 'apply'
          ? 'Patch yang terlihat akan diterapkan secara atomik bersama history dan audit.'
          : 'Place tidak akan berubah dan resolusi aman terlihat oleh reporter.'
      }
      title={action === 'apply' ? 'Terapkan perubahan?' : 'Tolak report?'}
      trigger={
        <Button variant={action === 'apply' ? 'primary' : 'destructive'}>
          {action === 'apply' ? 'Apply' : 'Reject'}
        </Button>
      }
    >
      {action === 'apply' ? (
        <Alert title="Mutasi berdampak publik" tone="warning">
          Sistem memvalidasi ulang jenis patch, report version, dan Place version sebelum commit.
          Patch di luar allowlist akan ditolak.
        </Alert>
      ) : null}
      <form className="mt-4 grid gap-4" onSubmit={submit}>
        <FormField
          description={`${resolution.trim().length}/500 karakter`}
          error={error}
          id={`${action}-resolution`}
          label="Resolusi"
          required
        >
          {(field) => (
            <Textarea
              {...field}
              maxLength={500}
              minLength={10}
              onChange={(event) => setResolution(event.target.value)}
              required
              value={resolution}
            />
          )}
        </FormField>
        <Feedback action={action} feedback={feedback} />
        <div className="flex justify-end">
          <Button
            loading={pending === action}
            loadingLabel="Menyimpan…"
            type="submit"
            variant={action === 'apply' ? 'primary' : 'destructive'}
          >
            Konfirmasi {action}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function Feedback({
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
