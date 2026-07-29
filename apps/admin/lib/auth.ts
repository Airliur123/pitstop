import type { AuthUser } from '@pitstop/contracts';
import { redirect } from 'next/navigation';

import { getAuthSession } from './api/server';

export async function requireAuthenticatedUser(): Promise<AuthUser> {
  const session = await getAuthSession();
  if (!session.authenticated) redirect('/login');
  return session.user;
}
