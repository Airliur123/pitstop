import type {
  ApiSuccess,
  ContributionDetail,
  ContributionDraftPayload,
  RequestId,
} from '@pitstop/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createContribution,
  getContribution,
  submitContribution,
  updateContribution,
} from '../lib/api/client';
import type { AuthStatus } from './auth-provider';
import { changeCategoryDraft, ContributionFlow, sanitizeDraftForApi } from './contribution-flow';

const contributionId = '01K00000000000000000000002';
const requestId = 'contribution-component-request' as RequestId;

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
  refresh: vi.fn(),
  replace: vi.fn(),
  search: 'id=01K00000000000000000000002&step=1',
}));

vi.mock('./auth-provider', () => ({ useAuth: () => mocks.auth }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));
vi.mock('../lib/api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/api/client')>();
  return {
    ...original,
    createContribution: vi.fn(),
    getContribution: vi.fn(),
    submitContribution: vi.fn(),
    updateContribution: vi.fn(),
  };
});

const draft: ContributionDetail = {
  createdAt: '2026-07-28T00:00:00.000Z',
  id: contributionId,
  payload: {
    address: 'Jl. Uji Komponen No. 7',
    category: 'MAKAN_MURAH',
    facilities: [
      { code: 'PARKING', status: 'AVAILABLE' },
      { code: 'TOILET', status: 'UNKNOWN' },
    ],
    mainMenu: { name: 'Nasi telur', priceAmount: 12_000 },
    notes: 'Masuk dari sisi timur.',
    operatingHours: [
      {
        closesAt: '02:00',
        dayOfWeek: 0,
        is24Hours: false,
        isClosed: false,
        opensAt: '18:00',
      },
    ],
    placeName: 'Warung Uji Komponen',
  },
  status: 'DRAFT',
  submittedAt: null,
  updatedAt: '2026-07-28T00:00:00.000Z',
  version: 1,
};

function apiResponse(data: ContributionDetail): ApiSuccess<ContributionDetail> {
  return {
    data,
    meta: { generatedAt: '2026-07-28T00:00:00.000Z', requestId },
    requestId,
    success: true,
  };
}

function TestQueryProvider({ children }: Readonly<{ children: ReactNode }>) {
  const client = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false, staleTime: 0 },
    },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderStep(step: 1 | 2 | 3) {
  mocks.search = `id=${contributionId}&step=${step}`;
  return render(<ContributionFlow />, { wrapper: TestQueryProvider });
}

describe('ContributionFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.search = `id=${contributionId}&step=1`;
    vi.mocked(getContribution).mockResolvedValue(apiResponse(draft));
    vi.mocked(updateContribution).mockResolvedValue(
      apiResponse({
        ...draft,
        updatedAt: '2026-07-28T00:01:00.000Z',
        version: 2,
      }),
    );
    vi.mocked(createContribution).mockResolvedValue(apiResponse(draft));
    vi.mocked(submitContribution).mockResolvedValue(
      apiResponse({
        ...draft,
        status: 'PENDING',
        submittedAt: '2026-07-28T00:02:00.000Z',
        version: 2,
      }),
    );
  });

  it('renders all three server-backed wizard steps with conditional fields and review data', async () => {
    const first = renderStep(1);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ceritakan tempatnya' }),
    ).toBeVisible();
    expect(screen.getByRole('textbox', { name: /^Nama tempat/ })).toHaveValue(
      'Warung Uji Komponen',
    );
    expect(screen.getByRole('button', { name: 'Makan Murah' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    first.unmount();

    const second = renderStep(2);
    expect(await screen.findByRole('heading', { level: 1, name: 'Lengkapi detail' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: /^Nama menu termurah/ })).toHaveValue('Nasi telur');
    expect(screen.getByRole('combobox', { name: 'Jadwal Senin' })).toHaveValue('OPEN');
    expect(screen.getByRole('combobox', { name: 'Parkir tersedia' })).toHaveValue('AVAILABLE');
    second.unmount();

    renderStep(3);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Tinjau kontribusi' }),
    ).toBeVisible();
    expect(await screen.findByText('Warung Uji Komponen')).toBeVisible();
    expect(await screen.findByText(/12\.000/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Kirim kontribusi' })).toBeEnabled();
  });

  it('validates, saves the canonical draft to the server, then advances', async () => {
    renderStep(1);
    await screen.findByRole('heading', { level: 1, name: 'Ceritakan tempatnya' });
    fireEvent.click(screen.getByRole('button', { name: 'Lanjutkan' }));

    await waitFor(() =>
      expect(updateContribution).toHaveBeenCalledWith(
        contributionId,
        expect.objectContaining({
          expectedVersion: 1,
          payload: expect.objectContaining({
            address: 'Jl. Uji Komponen No. 7',
            placeName: 'Warung Uji Komponen',
          }),
        }),
      ),
    );
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(`/contribute?id=${contributionId}&step=2`),
    );
  });

  it('distinguishes a draft network failure and offers a retry', async () => {
    vi.mocked(getContribution).mockRejectedValue(new TypeError('offline'));
    renderStep(1);
    expect(await screen.findByText('Draft belum dapat dimuat')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Coba lagi' })).toBeEnabled();
  });

  it('normalizes unknown facilities and clears category-specific data safely', () => {
    const payload: ContributionDraftPayload = {
      address: '  Jl. Uji  ',
      category: 'MAKAN_MURAH',
      facilities: [
        { code: 'PARKING', status: 'AVAILABLE' },
        { code: 'WIFI', status: 'AVAILABLE' },
      ],
      landmark: '   ',
      mainMenu: { name: '  Nasi telur  ', priceAmount: 12_000 },
      placeName: '  Warung Uji  ',
    };
    const sanitized = sanitizeDraftForApi(payload);
    expect(sanitized).toMatchObject({
      address: 'Jl. Uji',
      mainMenu: { name: 'Nasi telur', priceAmount: 12_000 },
      placeName: 'Warung Uji',
    });
    expect(sanitized.landmark).toBeUndefined();
    expect(sanitized.facilities).toHaveLength(7);

    const changed = changeCategoryDraft(payload, 'TOILET');
    expect(changed.losesData).toBe(true);
    expect(changed.payload.mainMenu).toBeUndefined();
    expect(changed.payload.facilities).toContainEqual({ code: 'WIFI', status: 'UNKNOWN' });
  });
});
