import type { ElementType, HTMLAttributes, ReactNode } from 'react';

import { cn } from '../utilities';

interface LayoutProps extends HTMLAttributes<HTMLElement> {
  readonly as?: ElementType;
  readonly children: ReactNode;
}

export function PageContainer({ as: Component = 'div', className, ...properties }: LayoutProps) {
  return (
    <Component
      className={cn(
        'mx-auto w-full max-w-[var(--pitstop-admin-content-max)] px-4 sm:px-6',
        className,
      )}
      {...properties}
    />
  );
}

export function Stack({ as: Component = 'div', className, ...properties }: LayoutProps) {
  return <Component className={cn('flex flex-col gap-4', className)} {...properties} />;
}

export function Inline({ as: Component = 'div', className, ...properties }: LayoutProps) {
  return (
    <Component className={cn('flex flex-wrap items-center gap-3', className)} {...properties} />
  );
}

export function Grid({ as: Component = 'div', className, ...properties }: LayoutProps) {
  return <Component className={cn('grid gap-4', className)} {...properties} />;
}

export function VisuallyHidden({ as: Component = 'span', className, ...properties }: LayoutProps) {
  return (
    <Component
      className={cn(
        'absolute size-px overflow-hidden whitespace-nowrap [clip-path:inset(50%)]',
        className,
      )}
      {...properties}
    />
  );
}

export function SkipLink({ href = '#main-content' }: Readonly<{ href?: string }>) {
  return (
    <a
      className="fixed left-4 top-4 z-[var(--pitstop-z-modal)] -translate-y-24 rounded-button bg-surface px-4 py-3 font-semibold text-foreground shadow-overlay transition-transform focus:translate-y-0"
      href={href}
    >
      Lewati ke konten utama
    </a>
  );
}

export function MobilePageShell({
  children,
  className,
  ...properties
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'mx-auto flex min-h-dvh w-full max-w-[430px] flex-col overflow-x-clip bg-app pb-[calc(4.5rem+env(safe-area-inset-bottom))]',
        className,
      )}
      {...properties}
    >
      {children}
    </div>
  );
}

export function AdminPageShell({
  children,
  className,
  ...properties
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('min-h-dvh bg-app lg:grid lg:grid-cols-[260px_1fr]', className)}
      {...properties}
    >
      {children}
    </div>
  );
}
