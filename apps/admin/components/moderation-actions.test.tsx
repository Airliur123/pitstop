import type { AdminContributionDetail } from '@pitstop/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ModerationActions } from './moderation-actions';

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock('../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../lib/api/client')>('../lib/api/client');
  return { ...actual, mutateContribution: mocks.mutate };
});

const adminId = '01K00000000000000000000001';
const contribution: AdminContributionDetail = {
  approvedAt: null,
  createdAt: '2026-07-29T00:00:00.000Z',
  currentReviewer: null,
  contributor: {
    email: 'ko***@example.test',
    id: '01K00000000000000000000003',
  },
  decisionReason: null,
  duplicateHints: [],
  history: [],
  id: '01K00000000000000000000002',
  mergedAt: null,
  mergedPlaceId: null,
  payload: {
    address: 'Jl. Pengujian No. 8',
    category: 'MAKAN_MURAH',
    facilities: [],
    mainMenu: { name: 'Nasi telur', priceAmount: 12_000 },
    operatingHours: [],
    placeName: 'Warung Uji',
  },
  publicationTarget: null,
  source: 'APPLICATION',
  status: 'PENDING',
  submittedAt: '2026-07-29T01:00:00.000Z',
  updatedAt: '2026-07-29T01:00:00.000Z',
  verifiedLocation: null,
  version: 3,
};

const activeReviewer = {
  claimExpired: false,
  claimExpiresAt: '2026-07-29T02:00:00.000Z',
  claimedAt: '2026-07-29T01:30:00.000Z',
  email: 'ad***@example.test',
  id: adminId,
};

describe('ModerationActions', () => {
  beforeEach(() => {
    mocks.mutate.mockReset().mockResolvedValue({
      contribution,
      replayed: false,
    });
    mocks.refresh.mockReset();
  });

  it('only offers a claim for a pending contribution', () => {
    render(<ModerationActions adminId={adminId} contribution={contribution} />);
    expect(screen.getByRole('button', { name: 'Ambil review' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Setujui' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tolak' })).not.toBeInTheDocument();
  });

  it('protects a live review held by another administrator', () => {
    render(
      <ModerationActions
        adminId={adminId}
        contribution={{
          ...contribution,
          currentReviewer: { ...activeReviewer, id: '01K00000000000000000000009' },
          status: 'IN_REVIEW',
        }}
      />,
    );
    expect(screen.getByText('Sedang ditinjau administrator lain')).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('requires a bounded reason and sends the optimistic version with an idempotency key', async () => {
    render(
      <ModerationActions
        adminId={adminId}
        contribution={{ ...contribution, currentReviewer: activeReviewer, status: 'IN_REVIEW' }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Minta perbaikan' }));
    const reason = await screen.findByRole('textbox', { name: /Alasan keputusan/ });
    fireEvent.change(reason, { target: { value: 'kurang' } });
    fireEvent.click(screen.getByRole('button', { name: 'Konfirmasi minta perbaikan' }));
    expect(screen.getByText('Alasan minimal 10 karakter.')).toBeVisible();
    expect(mocks.mutate).not.toHaveBeenCalled();

    fireEvent.change(reason, { target: { value: 'Alamat belum lengkap.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Konfirmasi minta perbaikan' }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(1));
    expect(mocks.mutate).toHaveBeenCalledWith(
      contribution.id,
      'needs-revision',
      { expectedVersion: 3, reason: 'Alamat belum lengkap.' },
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it('requires an explicit warning confirmation before publishing an approved contribution', async () => {
    render(
      <ModerationActions
        adminId={adminId}
        contribution={{
          ...contribution,
          approvedAt: '2026-07-29T02:00:00.000Z',
          currentReviewer: activeReviewer,
          publicationTarget: { mode: 'CREATE_NEW', targetPlaceId: null },
          status: 'APPROVED',
          verifiedLocation: {
            city: 'Jakarta Barat',
            district: 'Tambora',
            latitude: -6.1468,
            longitude: 106.8061,
            postalCode: '11220',
            province: 'DKI Jakarta',
          },
          version: 5,
        }}
      />,
    );
    expect(mocks.mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Publikasikan' }));
    expect(await screen.findByText('Tindakan berdampak publik')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Ya, publikasikan' }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(1));
    expect(mocks.mutate).toHaveBeenCalledWith(
      contribution.id,
      'merge',
      { expectedVersion: 5 },
      expect.any(String),
    );
  });
});
