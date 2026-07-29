import type { NextRequest } from 'next/server';

import {
  createModerationMutationTarget,
  problemResponse,
  proxyAdminMutation,
} from '../../../../../../lib/api/mutation-proxy';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: Readonly<{ params: Promise<{ action: string; id: string }> }>,
) {
  const { action, id } = await context.params;
  const target = createModerationMutationTarget(id, action);
  if (!target) {
    return problemResponse(request, {
      code: 'ADMIN_MUTATION_ROUTE_INVALID',
      detail: 'The requested admin mutation is not available.',
      status: 404,
      title: 'Admin mutation not found',
    });
  }
  return proxyAdminMutation(request, target);
}
