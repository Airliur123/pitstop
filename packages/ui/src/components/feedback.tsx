import { AlertCircle, CheckCircle2, CircleAlert, Info, RotateCcw } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../utilities';
import { Button } from './button';

type FeedbackTone = 'info' | 'success' | 'warning' | 'danger';

const toneStyles: Record<FeedbackTone, string> = {
  danger: 'border-danger bg-surface text-danger',
  info: 'border-border bg-surface text-brand',
  success: 'border-border bg-surface-success text-success',
  warning: 'border-border bg-surface-warning text-warning',
};

const toneIcons = {
  danger: AlertCircle,
  info: Info,
  success: CheckCircle2,
  warning: CircleAlert,
};

export function Alert({
  children,
  className,
  title,
  tone = 'info',
}: Readonly<{
  children: ReactNode;
  className?: string;
  title: string;
  tone?: FeedbackTone;
}>) {
  const Icon = toneIcons[tone];
  return (
    <div
      className={cn('flex gap-3 rounded-card border p-4', toneStyles[tone], className)}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        <div className="mt-1 text-sm text-foreground">{children}</div>
      </div>
    </div>
  );
}

export function InlineMessage({
  children,
  tone = 'info',
}: Readonly<{ children: ReactNode; tone?: FeedbackTone }>) {
  return (
    <p className={cn('flex items-start gap-2 text-[13px]', toneStyles[tone])} role="status">
      {children}
    </p>
  );
}

export function Toast({
  children,
  destructive = false,
  title,
}: Readonly<{ children?: ReactNode; destructive?: boolean; title: string }>) {
  return (
    <div
      className={cn(
        'w-full max-w-sm rounded-card border bg-surface p-4 shadow-floating',
        destructive ? 'border-danger' : 'border-border',
      )}
      role={destructive ? 'alert' : 'status'}
    >
      <p className="font-semibold">{title}</p>
      {children ? <div className="mt-1 text-sm text-muted">{children}</div> : null}
    </div>
  );
}

export function Spinner({
  label = 'Memuat',
  ...properties
}: HTMLAttributes<HTMLSpanElement> & Readonly<{ label?: string }>) {
  return (
    <span className="inline-flex items-center gap-2" role="status" {...properties}>
      <span
        aria-hidden="true"
        className="size-5 animate-spin rounded-full border-2 border-border border-t-interactive motion-reduce:animate-none"
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function Progress({ label, value }: Readonly<{ label: string; value: number }>) {
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="mb-2 flex justify-between gap-3 text-[13px]">
        <span>{label}</span>
        <span>{safeValue}%</span>
      </div>
      <div
        aria-label={label}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={safeValue}
        className="h-2 overflow-hidden rounded-full bg-border"
        role="progressbar"
      >
        <div className="h-full bg-interactive" style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  );
}

export function Skeleton({ className }: Readonly<{ className?: string }>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'min-h-20 animate-pulse rounded-card bg-border motion-reduce:animate-none',
        className,
      )}
    />
  );
}

function StateContainer({
  action,
  children,
  icon,
  title,
}: Readonly<{ action?: ReactNode; children: ReactNode; icon: ReactNode; title: string }>) {
  return (
    <section className="mx-auto flex max-w-80 flex-col items-center gap-3 py-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-surface-success text-brand">
        {icon}
      </div>
      <h2 className="text-[length:var(--pitstop-type-heading-h2-size)] font-semibold">{title}</h2>
      <div className="text-sm text-muted">{children}</div>
      {action}
    </section>
  );
}

export function EmptyState({
  action,
  children,
  title,
}: Readonly<{ action?: ReactNode; children: ReactNode; title: string }>) {
  return (
    <StateContainer
      action={action}
      icon={<Info aria-hidden="true" className="size-6" />}
      title={title}
    >
      {children}
    </StateContainer>
  );
}

export function ErrorState({
  onRetry,
  title = 'Terjadi kendala',
}: Readonly<{ onRetry?: () => void; title?: string }>) {
  return (
    <StateContainer
      action={
        onRetry ? (
          <Button onClick={onRetry} variant="secondary">
            <RotateCcw aria-hidden="true" className="size-4" />
            Coba lagi
          </Button>
        ) : undefined
      }
      icon={<AlertCircle aria-hidden="true" className="size-6 text-danger" />}
      title={title}
    >
      Informasi belum dapat dimuat. Periksa koneksi lalu coba lagi.
    </StateContainer>
  );
}
