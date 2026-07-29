import type { AdminNavigationValue } from '@pitstop/ui';
import { AdminPageShell, AdminSidebar, SkipLink } from '@pitstop/ui';
import type { ReactNode } from 'react';

import { AdminLogout } from './admin-logout';

export function AdminShell({
  children,
  current,
  userEmail,
}: Readonly<{ children: ReactNode; current: AdminNavigationValue; userEmail?: string }>) {
  return (
    <>
      <SkipLink />
      <AdminPageShell>
        <AdminSidebar
          current={current}
          footer={userEmail ? <AdminLogout email={userEmail} /> : undefined}
        />
        <main className="min-w-0 px-4 py-6 sm:px-8 sm:py-7" id="main-content">
          {children}
        </main>
      </AdminPageShell>
    </>
  );
}
