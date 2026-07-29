import type {
  AdminContributionDetail,
  AdminContributionQueue,
  AdminDashboard,
  AuthSession,
} from '@pitstop/contracts';
import { cookies } from 'next/headers';
import type { z } from 'zod';

import { AdminApiProblem, normalizeApiBaseUrl } from './client';
import {
  adminContributionDetailResponseSchema,
  adminContributionQueueResponseSchema,
  adminDashboardResponseSchema,
  authSessionResponseSchema,
  problemDetailsSchema,
} from './schemas';

async function serverRequest<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const cookieStore = await cookies();
  const response = await fetch(
    `${normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL)}${path}`,
    {
      cache: 'no-store',
      headers: {
        Accept: 'application/json, application/problem+json',
        Cookie: cookieStore.toString(),
      },
    },
  );
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new AdminApiProblem(
      'Respons layanan tidak dapat dibaca.',
      response.status || 502,
      'INVALID_JSON',
      response.headers.get('x-request-id'),
    );
  }
  if (!response.ok) {
    const problem = problemDetailsSchema.safeParse(payload);
    throw new AdminApiProblem(
      problem.success ? problem.data.detail : 'Layanan admin tidak tersedia.',
      response.status,
      problem.success ? problem.data.code : 'INVALID_PROBLEM_DETAILS',
      problem.success ? (problem.data.requestId ?? null) : response.headers.get('x-request-id'),
      problem.success ? (problem.data.validationErrors ?? []) : [],
    );
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new AdminApiProblem(
      'Struktur respons layanan tidak sesuai kontrak.',
      502,
      'INVALID_RESPONSE',
      response.headers.get('x-request-id'),
    );
  }
  return parsed.data;
}

export async function getAuthSession(): Promise<AuthSession> {
  const response = await serverRequest('/auth/session', authSessionResponseSchema);
  return response.data;
}

export async function getAdminDashboard(): Promise<AdminDashboard> {
  const response = await serverRequest('/admin/dashboard', adminDashboardResponseSchema);
  return response.data;
}

export async function getAdminContributions(
  query: URLSearchParams,
): Promise<AdminContributionQueue> {
  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  const response = await serverRequest(
    `/admin/contributions${suffix}`,
    adminContributionQueueResponseSchema,
  );
  return response.data;
}

export async function getAdminContribution(id: string): Promise<AdminContributionDetail> {
  const response = await serverRequest(
    `/admin/contributions/${encodeURIComponent(id)}`,
    adminContributionDetailResponseSchema,
  );
  return response.data;
}
