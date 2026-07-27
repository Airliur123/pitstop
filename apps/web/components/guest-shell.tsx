import {
  AppHeader,
  MobileBottomNavigation,
  type MobileNavigationValue,
  MobilePageShell,
  SkipLink,
} from '@pitstop/ui';
import type { ReactNode } from 'react';

export function GuestShell({
  backHref,
  bottomNavigation = false,
  children,
  navigationCurrent,
  title,
}: Readonly<{
  backHref?: string;
  bottomNavigation?: boolean;
  children: ReactNode;
  navigationCurrent?: MobileNavigationValue;
  title?: string;
}>) {
  return (
    <>
      <SkipLink />
      <MobilePageShell className={bottomNavigation ? undefined : 'pb-0'}>
        <AppHeader {...(backHref ? { backHref } : {})} {...(title ? { title } : {})} />
        {children}
        {bottomNavigation ? (
          <MobileBottomNavigation {...(navigationCurrent ? { current: navigationCurrent } : {})} />
        ) : null}
      </MobilePageShell>
    </>
  );
}
