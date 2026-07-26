'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { LocationProvider } from '../hooks/use-location';
import { ApiClientValidationError, ApiProblem } from '../lib/api/client';

export function shouldRetry(failureCount: number, error: Error) {
  if (failureCount >= 2) return false;
  if (error instanceof ApiClientValidationError) return false;
  if (error instanceof ApiProblem && error.status < 500 && error.status !== 429) return false;
  return true;
}

function retryDelay(failureCount: number, error: Error) {
  if (error instanceof ApiProblem && error.status === 429 && error.retryAfterSeconds !== null) {
    return Math.min(error.retryAfterSeconds * 1_000, 30_000);
  }
  return Math.min(500 * 2 ** failureCount, 2_000);
}

export function Providers({ children }: Readonly<{ children: ReactNode }>) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            gcTime: 10 * 60_000,
            refetchOnWindowFocus: false,
            retry: shouldRetry,
            retryDelay,
            staleTime: 30_000,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <LocationProvider>{children}</LocationProvider>
    </QueryClientProvider>
  );
}
