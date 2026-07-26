import { AppHeader, MobileBottomNavigation, MobilePageShell, SkipLink } from '@pitstop/ui';
import type { ReactNode } from 'react';

export function GuestShell({
  backHref,
  bottomNavigation = false,
  children,
  title,
}: Readonly<{
  backHref?: string;
  bottomNavigation?: boolean;
  children: ReactNode;
  title?: string;
}>) {
  return (
    <>
      <SkipLink />
      <MobilePageShell className={bottomNavigation ? undefined : 'pb-0'}>
        <AppHeader {...(backHref ? { backHref } : {})} {...(title ? { title } : {})} />
        {children}
        {bottomNavigation ? <MobileBottomNavigation /> : null}
      </MobilePageShell>
    </>
  );
}
