import type { ContributionStatus } from '@pitstop/contracts';
import type { Status } from '@pitstop/ui';

export const categoryLabels = {
  ISTIRAHAT: 'Istirahat',
  MAKAN_MURAH: 'Makan murah',
  MUSALA: 'Musala',
  NGOPI: 'Ngopi',
  TOILET: 'Toilet',
} as const;

export const sourceLabels = {
  ADMIN: 'Admin',
  APPLICATION: 'Aplikasi',
  CSV_IMPORT: 'Impor CSV',
  GOOGLE_FORM: 'Google Form',
} as const;

export const actionLabels = {
  APPROVE: 'Menyetujui',
  CLAIM: 'Mengambil review',
  MERGE: 'Mempublikasikan',
  NEEDS_REVISION: 'Meminta perbaikan',
  RECLAIM: 'Mengambil ulang review',
  REJECT: 'Menolak',
} as const;

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value));
}

export function formatMoney(value: number | undefined): string {
  if (value === undefined) return '—';
  return new Intl.NumberFormat('id-ID', {
    currency: 'IDR',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value);
}

export function toUiStatus(status: ContributionStatus): Status {
  const statuses: Record<ContributionStatus, Status> = {
    APPROVED: 'approved',
    DRAFT: 'pending',
    IN_REVIEW: 'reviewing',
    MERGED: 'merged',
    NEEDS_REVISION: 'revision',
    PENDING: 'pending',
    REJECTED: 'rejected',
  };
  return statuses[status];
}
