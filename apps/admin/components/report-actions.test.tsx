import type { AdminReportDetail } from '@pitstop/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReportActions } from './report-actions';

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../lib/api/client')>('../lib/api/client');
  return { ...actual, mutateReport: mocks.mutate };
});

const adminId = '01K00000000000000000000001';
const report: AdminReportDetail = {
  appliedChangeSummary: null,
  audit: [],
  currentPlace: {
    address: 'Jl. Lama',
    categories: ['MAKAN_MURAH'],
    description: null,
    facilities: [],
    id: '01K00000000000000000000002',
    latitude: -6.2,
    longitude: 106.8,
    menus: [],
    name: 'Place Uji',
    operatingHours: [],
    slug: 'place-uji',
    verificationStatus: 'STALE',
    version: 5,
  },
  currentReviewer: {
    claimExpired: false,
    claimExpiresAt: '2026-07-30T13:00:00.000Z',
    claimedAt: '2026-07-30T12:30:00.000Z',
    email: 'ad***@example.test',
    id: adminId,
  },
  evidenceReference: null,
  evidenceUrl: null,
  explanation: 'Alamat Place ini perlu diperbaiki berdasarkan kunjungan.',
  history: [],
  id: '01K00000000000000000000003',
  place: {
    address: 'Jl. Lama',
    id: '01K00000000000000000000002',
    name: 'Place Uji',
    slug: 'place-uji',
    verificationStatus: 'STALE',
    version: 5,
  },
  placeHistory: [],
  proposal: { address: 'Jl. Baru', kind: 'LOCATION_INCORRECT' },
  relatedPendingReports: [],
  reporter: { id: '01K00000000000000000000004', maskedEmail: 'us***@example.test' },
  reportType: 'LOCATION_INCORRECT',
  resolution: null,
  reviewedAt: null,
  status: 'IN_REVIEW',
  submittedAt: '2026-07-30T12:00:00.000Z',
  version: 2,
};

describe('ReportActions', () => {
  beforeEach(() => {
    mocks.mutate.mockReset().mockResolvedValue({ replayed: false, report });
    mocks.refresh.mockReset();
  });

  it('applies only the visible structured patch with both optimistic versions', async () => {
    render(<ReportActions adminId={adminId} report={report} />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    fireEvent.change(await screen.findByRole('textbox', { name: /Resolusi/ }), {
      target: { value: 'Alamat disetujui setelah pemeriksaan bukti.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Konfirmasi apply' }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledOnce());
    expect(mocks.mutate).toHaveBeenCalledWith(
      report.id,
      'apply',
      {
        approvedPatch: report.proposal,
        expectedPlaceVersion: 5,
        expectedReportVersion: 2,
        resolution: 'Alamat disetujui setelah pemeriksaan bukti.',
      },
      expect.any(String),
    );
  });

  it('does not expose decisions to a competing reviewer', () => {
    if (!report.currentReviewer) throw new Error('Reviewer fixture is required.');
    render(
      <ReportActions
        adminId={adminId}
        report={{
          ...report,
          currentReviewer: {
            ...report.currentReviewer,
            id: '01K00000000000000000000009',
          },
        }}
      />,
    );
    expect(screen.getByText('Diklaim administrator lain')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeInTheDocument();
  });
});
