import type { ApiSuccess, ContributionDetail, RequestId } from '@pitstop/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getContribution } from '../lib/api/client';
import type { AuthStatus } from './auth-provider';
import { ContributionDetailView } from './contribution-detail';
import { ContributionSuccessView } from './contribution-success';

const contributionId = '01K00000000000000000000002';
const requestId = 'contribution-detail-request' as RequestId;
const mocks = vi.hoisted(() => ({
  auth: {
    error: null as Error | null,
    isLoggingOut: false,
    logout: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    session: {
      authenticated: true as const,
      user: {
        email: 'ow***@example.test',
        id: '01K00000000000000000000001',
        role: 'USER' as const,
      },
    },
    status: 'authenticated' as AuthStatus,
  },
  replace: vi.fn(),
}));

vi.mock('./auth-provider', () => ({ useAuth: () => mocks.auth }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock('../lib/api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/api/client')>();
  return { ...original, getContribution: vi.fn() };
});

const pending: ContributionDetail = {
  createdAt: '2026-07-28T00:00:00.000Z',
  id: contributionId,
  payload: {
    address: 'Jl. Uji Detail No. 7',
    category: 'TOILET',
    facilities: [{ code: 'TOILET', status: 'AVAILABLE' }],
    placeName: 'Toilet Uji Detail',
  },
  status: 'PENDING',
  submittedAt: '2026-07-28T00:02:00.000Z',
  updatedAt: '2026-07-28T00:02:00.000Z',
  version: 2,
};

function response(data: ContributionDetail): ApiSuccess<ContributionDetail> {
  return {
    data,
    meta: { generatedAt: '2026-07-28T00:02:00.000Z', requestId },
    requestId,
    success: true,
  };
}

function TestQueryProvider({ children }: Readonly<{ children: ReactNode }>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('contribution detail and success states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getContribution).mockResolvedValue(response(pending));
  });

  it('renders a PENDING contribution as read-only server state', async () => {
    render(<ContributionDetailView contributionId={contributionId} />, {
      wrapper: TestQueryProvider,
    });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Menunggu pemeriksaan' }),
    ).toBeVisible();
    expect(screen.getByText('Toilet Uji Detail')).toBeVisible();
    expect(screen.getByText('Data bersifat read-only')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Lanjutkan edit' })).not.toBeInTheDocument();
  });

  it('shows success only after the server returns PENDING with submittedAt', async () => {
    render(<ContributionSuccessView contributionId={contributionId} />, {
      wrapper: TestQueryProvider,
    });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Kontribusi berhasil dikirim' }),
    ).toBeVisible();
    expect(screen.getByText('Menunggu pemeriksaan')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Lihat detail kontribusi' })).toHaveAttribute(
      'href',
      `/contributions/${contributionId}`,
    );
  });
});
