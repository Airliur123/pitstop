import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mapActivityItem, UserActivityView } from './user-activity';

const mocks = vi.hoisted(() => ({
  auth: {
    error: null,
    isLoggingOut: false,
    logout: vi.fn(),
    refresh: vi.fn(),
    session: { authenticated: false },
    status: 'unauthenticated' as 'authenticated' | 'error' | 'loading' | 'unauthenticated',
  },
  getActivity: vi.fn(),
}));

vi.mock('./auth-provider', () => ({
  useAuth: () => mocks.auth,
}));

vi.mock('../lib/api/client', () => ({
  getActivity: mocks.getActivity,
}));

function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe('UserActivityView', () => {
  const authenticatedSession = {
    authenticated: true as const,
    user: {
      email: 'driver@example.test',
      id: 'user-1',
      role: 'USER' as const,
    },
  };

  function useAuthenticatedState() {
    mocks.auth.status = 'authenticated';
    mocks.auth.session = authenticatedSession;
  }

  function emptyActivityResponse() {
    return {
      data: { items: [], pagination: { hasMore: false, nextCursor: null } },
      meta: { generatedAt: '2026-08-01T00:00:00.000Z', requestId: 'activity-1' },
      requestId: 'activity-1',
      success: true as const,
    };
  }

  beforeEach(() => {
    mocks.auth.status = 'unauthenticated';
    mocks.auth.session = { authenticated: false };
    mocks.getActivity.mockReset();
  });

  it('shows a private login state to guests without requesting an activity feed', () => {
    render(<UserActivityView />, { wrapper: Wrapper });
    expect(screen.getByRole('heading', { name: 'Aktivitas tersimpan di akun' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Masuk' })).toHaveAttribute(
      'href',
      '/login?returnTo=%2Factivity',
    );
    expect(screen.queryByRole('feed')).not.toBeInTheDocument();
  });

  it('renders authenticated Activity data and sends the default query', async () => {
    useAuthenticatedState();
    mocks.getActivity.mockResolvedValue({
      data: {
        items: [
          {
            createdAt: '2026-08-01T00:00:00.000Z',
            id: 'report-1',
            placeId: 'place-1',
            placeName: 'Tempat Uji',
            reportType: 'OTHER',
            status: 'APPLIED',
            type: 'REPORT',
            updatedAt: '2026-08-01T00:00:00.000Z',
          },
        ],
        pagination: { hasMore: false, nextCursor: null },
      },
      meta: { generatedAt: '2026-08-01T00:00:00.000Z', requestId: 'activity-2' },
      requestId: 'activity-2',
      success: true,
    });

    render(<UserActivityView />, { wrapper: Wrapper });

    expect(await screen.findByText('Tempat Uji')).toBeVisible();
    expect(mocks.getActivity).toHaveBeenCalledWith({}, expect.any(AbortSignal));
  });

  it('renders a CONTRIBUTION DRAFT when its place name is nullable', async () => {
    useAuthenticatedState();
    const item = {
      createdAt: '2026-07-31T19:37:21.290Z',
      id: '01KYWTWRM9Q7YFN8R6F5AP6Z16',
      placeId: null,
      placeName: null,
      status: 'DRAFT' as const,
      type: 'CONTRIBUTION' as const,
      updatedAt: '2026-07-31T19:37:21.290Z',
    };
    mocks.getActivity.mockResolvedValue({
      data: { items: [item], pagination: { hasMore: false, nextCursor: null } },
      meta: { generatedAt: '2026-07-31T19:37:21.322Z', requestId: 'activity-draft' },
      requestId: 'activity-draft',
      success: true,
    });

    render(<UserActivityView />, { wrapper: Wrapper });

    expect(
      await screen.findByRole('heading', { name: 'Kontribusi belum diberi nama' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Lihat detail' })).toHaveAttribute(
      'href',
      `/contributions/${item.id}`,
    );
    expect(mapActivityItem(item)).toEqual({
      href: `/contributions/${item.id}`,
      placeName: 'Kontribusi belum diberi nama',
    });
  });

  it('renders an empty state for an authenticated user without Activity', async () => {
    useAuthenticatedState();
    mocks.getActivity.mockResolvedValue(emptyActivityResponse());

    render(<UserActivityView />, { wrapper: Wrapper });

    expect(await screen.findByRole('heading', { name: 'Aktivitas masih kosong' })).toBeVisible();
    expect(screen.getByText('Belum ada data milikmu untuk filter ini.')).toBeVisible();
  });

  it('renders a safe retry state when response parsing rejects malformed Activity data', async () => {
    useAuthenticatedState();
    mocks.getActivity.mockRejectedValue(new Error('INVALID_RESPONSE'));

    render(<UserActivityView />, { wrapper: Wrapper });

    expect(await screen.findByRole('alert')).toHaveTextContent('Periksa koneksi lalu coba lagi.');
    expect(screen.getByRole('button', { name: 'Coba lagi' })).toBeVisible();
  });

  it('keeps API failures in a retry state and applies valid filters', async () => {
    useAuthenticatedState();
    mocks.getActivity
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValue(emptyActivityResponse());

    render(<UserActivityView />, { wrapper: Wrapper });

    expect(await screen.findByRole('alert')).toHaveTextContent('Periksa koneksi lalu coba lagi.');
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Aktivitas masih kosong' })).toBeVisible(),
    );

    fireEvent.change(screen.getByLabelText('Jenis'), { target: { value: 'REPORT' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'APPLIED' } });
    await waitFor(() =>
      expect(mocks.getActivity).toHaveBeenLastCalledWith(
        { status: 'APPLIED', type: 'REPORT' },
        expect.any(AbortSignal),
      ),
    );
  });
});
