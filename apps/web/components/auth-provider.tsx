'use client';

import type { AuthSession } from '@pitstop/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext } from 'react';

import { getAuthSession, logout as requestLogout } from '../lib/api/client';
import { queryKeys } from '../lib/query-keys';

export type AuthStatus = 'authenticated' | 'error' | 'loading' | 'unauthenticated';

interface AuthContextValue {
  readonly error: Error | null;
  readonly isLoggingOut: boolean;
  readonly logout: () => Promise<void>;
  readonly refresh: () => Promise<void>;
  readonly session: AuthSession | undefined;
  readonly status: AuthStatus;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({
    gcTime: 0,
    queryFn: ({ signal }) => getAuthSession(signal),
    queryKey: queryKeys.authSession(),
    retry: false,
    staleTime: 60_000,
  });
  const logoutMutation = useMutation({
    mutationFn: () => requestLogout(),
    onSuccess: (response) => {
      queryClient.removeQueries({ queryKey: queryKeys.privateData() });
      queryClient.setQueryData(queryKeys.authSession(), response);
    },
  });
  const session = sessionQuery.data?.data;
  const status: AuthStatus = sessionQuery.isPending
    ? 'loading'
    : sessionQuery.isError
      ? 'error'
      : session?.authenticated
        ? 'authenticated'
        : 'unauthenticated';
  const value: AuthContextValue = {
    error: sessionQuery.error,
    isLoggingOut: logoutMutation.isPending,
    logout: async () => {
      await logoutMutation.mutateAsync();
    },
    refresh: async () => {
      await sessionQuery.refetch();
    },
    session,
    status,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
