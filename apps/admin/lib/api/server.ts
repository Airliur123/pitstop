import { randomUUID } from 'node:crypto';

import type {
  AdminContributionDetail,
  AdminContributionQueue,
  AdminDashboard,
  AdminGoogleFormIntegrationStatus,
  AdminGoogleFormSubmissionList,
  AdminReportDetail,
  AdminReportQueue,
  AdminSystemDiagnostics,
  AuditLogPage,
  AuthSession,
} from '@pitstop/contracts';
import { cookies, headers } from 'next/headers';
import type { z } from 'zod';

import { AdminApiProblem, normalizeApiBaseUrl } from './client';
import {
  adminContributionDetailResponseSchema,
  adminContributionQueueResponseSchema,
  adminDashboardResponseSchema,
  adminReportDetailResponseSchema,
  adminReportQueueResponseSchema,
  adminSystemDiagnosticsResponseSchema,
  auditLogPageResponseSchema,
  authSessionResponseSchema,
  googleFormIntegrationStatusResponseSchema,
  googleFormSubmissionListResponseSchema,
  problemDetailsSchema,
} from './schemas';

async function serverRequest<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const [cookieStore, incomingHeaders] = await Promise.all([cookies(), headers()]);
  const requestId = safeTransportIdentifier(incomingHeaders.get('x-request-id')) ?? randomUUID();
  const correlationId =
    safeCorrelationIdentifier(incomingHeaders.get('x-correlation-id')) ??
    safeCorrelationIdentifier(requestId) ??
    randomUUID();
  const response = await fetch(
    `${normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL)}${path}`,
    {
      cache: 'no-store',
      headers: {
        Accept: 'application/json, application/problem+json',
        Cookie: cookieStore.toString(),
        'X-Correlation-Id': correlationId,
        'X-Request-Id': requestId,
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

function safeTransportIdentifier(value: string | null): string | null {
  return value !== null && /^[A-Za-z0-9](?:[A-Za-z0-9._:-]{0,127})$/.test(value) ? value : null;
}

function safeCorrelationIdentifier(value: string | null): string | null {
  return value !== null && /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,63})$/.test(value) ? value : null;
}

export async function getAuthSession(): Promise<AuthSession> {
  const response = await serverRequest('/auth/session', authSessionResponseSchema);
  return response.data;
}

export async function getAdminDashboard(): Promise<AdminDashboard> {
  const response = await serverRequest('/admin/dashboard', adminDashboardResponseSchema);
  return response.data;
}

export async function getAdminSystemDiagnostics(): Promise<AdminSystemDiagnostics> {
  const response = await serverRequest('/admin/diagnostics', adminSystemDiagnosticsResponseSchema);
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

export async function getAdminReports(query: URLSearchParams): Promise<AdminReportQueue> {
  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  const response = await serverRequest(`/admin/reports${suffix}`, adminReportQueueResponseSchema);
  return response.data;
}

export async function getAdminReport(id: string): Promise<AdminReportDetail> {
  const response = await serverRequest(
    `/admin/reports/${encodeURIComponent(id)}`,
    adminReportDetailResponseSchema,
  );
  return response.data;
}

export async function getAuditLog(query: URLSearchParams): Promise<AuditLogPage> {
  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  const response = await serverRequest(`/admin/audit${suffix}`, auditLogPageResponseSchema);
  return response.data;
}

export async function getGoogleFormIntegrationStatus(): Promise<AdminGoogleFormIntegrationStatus> {
  const response = await serverRequest(
    '/admin/integrations/google-form/status',
    googleFormIntegrationStatusResponseSchema,
  );
  return response.data;
}

export async function getGoogleFormSubmissions(
  query: URLSearchParams,
): Promise<AdminGoogleFormSubmissionList> {
  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  const response = await serverRequest(
    `/admin/integrations/google-form/submissions${suffix}`,
    googleFormSubmissionListResponseSchema,
  );
  return response.data;
}
