import type { MergeContributionResult, ModerationMutationResult } from '@pitstop/contracts';
import type { z } from 'zod';

import {
  magicLinkRequestResponseSchema,
  mergeMutationResponseSchema,
  moderationMutationResponseSchema,
  problemDetailsSchema,
} from './schemas';

export class AdminApiProblem extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly requestId: string | null,
    readonly validationErrors: readonly { readonly field: string; readonly message: string }[] = [],
  ) {
    super(message);
    this.name = 'AdminApiProblem';
  }
}

export function normalizeApiBaseUrl(value: string | undefined): string {
  if (!value) throw new Error('NEXT_PUBLIC_API_BASE_URL is required');
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

async function readResponse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
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
    const parsed = problemDetailsSchema.safeParse(payload);
    if (!parsed.success) {
      throw new AdminApiProblem(
        'Terjadi kendala saat menghubungi layanan.',
        response.status,
        'INVALID_PROBLEM_DETAILS',
        response.headers.get('x-request-id'),
      );
    }
    throw new AdminApiProblem(
      parsed.data.detail,
      parsed.data.status,
      parsed.data.code,
      parsed.data.requestId ?? null,
      parsed.data.validationErrors ?? [],
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

export async function requestMagicLink(email: string, signal?: AbortSignal): Promise<void> {
  const response = await fetch(
    `${normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL)}/auth/email/request`,
    {
      body: JSON.stringify({ email, returnTo: '/admin' }),
      credentials: 'include',
      headers: {
        Accept: 'application/json, application/problem+json',
        'Content-Type': 'application/json',
      },
      method: 'POST',
      ...(signal ? { signal } : {}),
    },
  );
  await readResponse(response, magicLinkRequestResponseSchema);
}

export async function mutateContribution(
  contributionId: string,
  action: 'approve' | 'claim' | 'merge' | 'needs-revision' | 'reject',
  body: unknown,
  idempotencyKey: string,
): Promise<MergeContributionResult | ModerationMutationResult> {
  const response = await fetch(
    `${normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL)}/admin/contributions/${encodeURIComponent(contributionId)}/${action}`,
    {
      body: JSON.stringify(body),
      credentials: 'include',
      headers: {
        Accept: 'application/json, application/problem+json',
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      method: 'POST',
    },
  );
  const result =
    action === 'merge'
      ? await readResponse(response, mergeMutationResponseSchema)
      : await readResponse(response, moderationMutationResponseSchema);
  return result.data;
}
