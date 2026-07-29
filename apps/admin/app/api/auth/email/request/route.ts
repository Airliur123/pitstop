import type { NextRequest } from 'next/server';

import { proxyAdminMutation } from '../../../../../lib/api/mutation-proxy';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return proxyAdminMutation(request, { kind: 'MAGIC_LINK_REQUEST' });
}
