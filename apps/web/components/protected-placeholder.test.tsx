import type { AuthSession } from '@pitstop/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthStatus } from './auth-provider';
import { ProtectedPlaceholder } from './protected-placeholder';

const mocks = vi.hoisted(() => ({
  auth: {
    error: null as Error | null,
    isLoggingOut: false,
    logout: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    session: { authenticated: false } as AuthSession,
    status: 'loading' as AuthStatus,
  },
  replace: vi.fn(),
}));

vi.mock('./auth-provider', () => ({ useAuth: () => mocks.auth }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }));

function renderActivity() {
  return render(
    <ProtectedPlaceholder
      description="Deskripsi aktivitas"
      navigationCurrent="activity"
      returnTo="/activity"
      title="Aktivitas"
    />,
  );
}

describe('ProtectedPlaceholder', () => {
  beforeEach(() => {
    mocks.auth.error = null;
    mocks.auth.isLoggingOut = false;
    mocks.auth.logout.mockClear();
    mocks.auth.refresh.mockClear();
    mocks.auth.session = { authenticated: false };
    mocks.auth.status = 'loading';
    mocks.replace.mockClear();
  });

  it('announces the session loading state', () => {
    renderActivity();
    expect(screen.getByText('Memeriksa sesi')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
  });

  it('redirects an unauthenticated guest to the allowlisted return destination', async () => {
    mocks.auth.status = 'unauthenticated';
    renderActivity();
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/login?returnTo=%2Factivity'));
  });

  it('renders only the next-phase placeholder and supports logout', async () => {
    mocks.auth.status = 'authenticated';
    mocks.auth.session = {
      authenticated: true,
      user: { email: 'us***@example.test', id: 'user-id', role: 'USER' },
    };
    renderActivity();
    expect(screen.getByRole('heading', { name: 'Aktivitas' })).toBeVisible();
    expect(screen.getByText('Tersedia pada fase berikutnya')).toBeVisible();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keluar' }));
    await waitFor(() => expect(mocks.auth.logout).toHaveBeenCalledOnce());
  });

  it('distinguishes a session network error from unauthenticated', () => {
    mocks.auth.status = 'error';
    mocks.auth.error = new TypeError('offline');
    renderActivity();
    expect(screen.getByText('Layanan akun tidak tersedia')).toBeVisible();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
