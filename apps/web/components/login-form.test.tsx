import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthStatus } from './auth-provider';
import { LoginForm } from './login-form';

const authMock = vi.hoisted(() => ({
  error: null,
  isLoggingOut: false,
  logout: vi.fn(),
  refresh: vi.fn(),
  session: { authenticated: false } as AuthSession,
  status: 'unauthenticated' as AuthStatus,
}));

vi.mock('./auth-provider', () => ({ useAuth: () => authMock }));

function QueryWrapper({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

describe('LoginForm', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:3001/api/v1');
    authMock.session = { authenticated: false };
    authMock.status = 'unauthenticated';
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('validates email before sending and keeps an accessible error association', () => {
    render(<LoginForm returnTo="/" />, { wrapper: QueryWrapper });
    const emailInput = screen.getByRole('textbox', { name: /^Email/ });
    fireEvent.change(emailInput, { target: { value: 'invalid' } });
    const form = screen.getByRole('button', { name: 'Kirim tautan masuk' }).closest('form');
    if (!form) throw new Error('Login form is unavailable');
    fireEvent.submit(form);
    expect(emailInput).toHaveAccessibleDescription(
      'Kami hanya menggunakan email ini untuk mengirim tautan masuk. Masukkan alamat email yang valid.',
    );
  });

  it('normalizes the email and renders the generic anti-enumeration success message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { accepted: true },
          meta: { generatedAt: new Date().toISOString(), requestId: 'request-id' },
          requestId: 'request-id',
          success: true,
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 202 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<LoginForm returnTo="/activity" />, { wrapper: QueryWrapper });
    fireEvent.change(screen.getByRole('textbox', { name: /^Email/ }), {
      target: { value: '  Person@Example.TEST  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Kirim tautan masuk' }));

    expect(
      await screen.findByText('Jika email dapat digunakan, tautan masuk telah dikirim.'),
    ).toBeVisible();
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(requestInit.credentials).toBe('include');
    expect(JSON.parse(String(requestInit.body))).toEqual({
      email: 'person@example.test',
      returnTo: '/activity',
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Gunakan email lain' })).toBeEnabled(),
    );
  });

  it('explains invalid and expired callback states without echoing a token', () => {
    const { rerender } = render(<LoginForm returnTo="/" state="invalid" />, {
      wrapper: QueryWrapper,
    });
    expect(screen.getByText(/tidak valid atau sudah pernah digunakan/i)).toBeVisible();
    rerender(<LoginForm returnTo="/" state="expired" />);
    expect(screen.getByText(/sudah kedaluwarsa/i)).toBeVisible();
    expect(document.body.textContent).not.toContain('token=');
    expect(
      screen.getByText('Tautan tidak dapat digunakan').closest('[tabindex="-1"]'),
    ).toHaveFocus();
  });

  it('prevents duplicate submission while the request is pending', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => undefined)));
    render(<LoginForm returnTo="/" />, { wrapper: QueryWrapper });
    fireEvent.change(screen.getByRole('textbox', { name: /^Email/ }), {
      target: { value: 'person@example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Kirim tautan masuk' }));
    const loading = await screen.findByRole('button', { name: 'Mengirim tautan…' });
    expect(loading).toBeDisabled();
    expect(loading).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(loading);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('renders an authenticated return state', () => {
    authMock.status = 'authenticated';
    authMock.session = {
      authenticated: true,
      user: { email: 'pe****@example.test', id: 'user-id', role: 'USER' },
    };
    render(<LoginForm returnTo="/activity" />, { wrapper: QueryWrapper });
    expect(screen.getByRole('heading', { name: 'Kamu sudah masuk' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Lanjutkan' })).toHaveAttribute('href', '/activity');
  });
});
import type { AuthSession } from '@pitstop/contracts';
