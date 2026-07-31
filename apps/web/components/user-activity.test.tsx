import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { UserActivityView } from './user-activity';

vi.mock('./auth-provider', () => ({
  useAuth: () => ({
    error: null,
    isLoggingOut: false,
    logout: vi.fn(),
    refresh: vi.fn(),
    session: { authenticated: false },
    status: 'unauthenticated',
  }),
}));

function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe('UserActivityView', () => {
  it('shows a private login state to guests without requesting an activity feed', () => {
    render(<UserActivityView />, { wrapper: Wrapper });
    expect(screen.getByRole('heading', { name: 'Aktivitas tersimpan di akun' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Masuk' })).toHaveAttribute(
      'href',
      '/login?returnTo=%2Factivity',
    );
    expect(screen.queryByRole('feed')).not.toBeInTheDocument();
  });
});
