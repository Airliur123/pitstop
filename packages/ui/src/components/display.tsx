import { cva, type VariantProps } from 'class-variance-authority';
import { CheckCircle2, CircleAlert, MapPin, X } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../utilities';
import { Button, LinkButton } from './button';

const badgeVariants = cva(
  'inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-[length:var(--pitstop-type-label-medium-size)] font-semibold leading-[var(--pitstop-type-label-medium-line)]',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-surface text-foreground',
        success: 'border-border bg-surface-success text-success',
        warning: 'border-border bg-surface-warning text-warning',
        danger: 'border-danger bg-surface text-danger',
        info: 'border-border bg-surface text-brand',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...properties }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...properties} />;
}

export type Status =
  | 'open'
  | 'soon'
  | 'closed'
  | 'unknown'
  | 'pending'
  | 'reviewing'
  | 'revision'
  | 'approved'
  | 'rejected';

const statusContent: Record<Status, { label: string; tone: NonNullable<BadgeProps['tone']> }> = {
  approved: { label: 'Disetujui', tone: 'success' },
  closed: { label: 'Tutup', tone: 'neutral' },
  open: { label: 'Buka', tone: 'success' },
  pending: { label: 'Menunggu pemeriksaan', tone: 'warning' },
  rejected: { label: 'Ditolak', tone: 'danger' },
  revision: { label: 'Perlu perbaikan', tone: 'warning' },
  reviewing: { label: 'Sedang diperiksa', tone: 'info' },
  soon: { label: 'Segera tutup', tone: 'warning' },
  unknown: { label: 'Tidak diketahui', tone: 'neutral' },
};

export function StatusBadge({
  className,
  status,
}: Readonly<{ className?: string; status: Status }>) {
  const content = statusContent[status];
  return (
    <Badge className={className} tone={content.tone}>
      <span aria-hidden="true" className="size-2 rounded-full bg-current" />
      {content.label}
    </Badge>
  );
}

export function FacilityChip({
  label,
  state,
}: Readonly<{ label: string; state: 'available' | 'unavailable' | 'unknown' }>) {
  const Icon = state === 'available' ? CheckCircle2 : state === 'unavailable' ? X : CircleAlert;
  const tone = state === 'available' ? 'success' : state === 'unavailable' ? 'neutral' : 'warning';
  const stateLabel =
    state === 'available'
      ? 'Tersedia'
      : state === 'unavailable'
        ? 'Tidak tersedia'
        : 'Belum diketahui';
  return (
    <Badge tone={tone}>
      <Icon aria-hidden="true" className="size-4" />
      {label}: {stateLabel}
    </Badge>
  );
}

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  readonly selected?: boolean;
}

export function Chip({ className, selected = false, ...properties }: ChipProps) {
  return (
    <span
      className={cn(
        'inline-flex min-h-12 items-center justify-center rounded-full border px-4 text-[length:var(--pitstop-type-label-medium-size)] font-semibold',
        selected
          ? 'border-interactive bg-interactive text-inverse'
          : 'border-border bg-surface text-foreground',
        className,
      )}
      {...properties}
    />
  );
}

export function Divider({ className, ...properties }: HTMLAttributes<HTMLHRElement>) {
  return <hr className={cn('m-0 border-0 border-t border-border', className)} {...properties} />;
}

export function Surface({ className, ...properties }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-card border border-border bg-surface', className)}
      {...properties}
    />
  );
}

export function Card({ className, ...properties }: HTMLAttributes<HTMLElement>) {
  return (
    <article
      className={cn('rounded-card border border-border bg-surface p-4 shadow-card', className)}
      {...properties}
    />
  );
}

export function SectionHeader({
  action,
  className,
  description,
  title,
}: Readonly<{
  action?: ReactNode;
  className?: string;
  description?: string;
  title: string;
}>) {
  return (
    <header className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="text-[length:var(--pitstop-type-heading-h2-size)] font-semibold leading-[var(--pitstop-type-heading-h2-line)]">
          {title}
        </h2>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function AdminStatCard({
  label,
  tone = 'neutral',
  value,
}: Readonly<{
  label: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
  value: string;
}>) {
  return (
    <Surface
      className={cn(
        'flex min-h-36 flex-col gap-2 p-[18px]',
        tone === 'success' && 'bg-surface-success',
        tone === 'warning' && 'bg-surface-warning',
        tone === 'danger' && 'border-danger',
      )}
    >
      <span className={cn('text-sm text-muted', tone === 'warning' && 'text-foreground')}>
        {label}
      </span>
      <strong
        className={cn(
          'text-[2rem] leading-10',
          tone === 'success' && 'text-success',
          tone === 'warning' && 'text-warning',
          tone === 'danger' && 'text-danger',
        )}
      >
        {value}
      </strong>
    </Surface>
  );
}

export function Avatar({ label, name }: Readonly<{ label?: string; name: string }>) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
  return (
    <span
      aria-label={label ?? name}
      className="inline-flex size-12 items-center justify-center rounded-full bg-surface-navy text-sm font-semibold text-inverse"
      role="img"
    >
      {initials}
    </span>
  );
}

export function ContributionListItem({
  meta,
  status,
  title,
}: Readonly<{ meta: string; status: Status; title: string }>) {
  return (
    <article className="flex min-h-[6.5rem] flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-4">
      <div className="min-w-48 flex-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-[13px] text-muted">{meta}</p>
      </div>
      <StatusBadge status={status} />
      <LinkButton className="min-w-0" href="#preview-contribution" variant="ghost">
        Tinjau
      </LinkButton>
    </article>
  );
}

export function PlaceCard({
  distance,
  menu,
  price,
  status = 'open',
  title,
}: Readonly<{
  distance: string;
  menu: string;
  price: string;
  status?: Status;
  title: string;
}>) {
  return (
    <Card className="flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-[length:var(--pitstop-type-heading-h3-size)] font-semibold leading-[var(--pitstop-type-heading-h3-line)]">
          {title}
        </h3>
        <StatusBadge status={status} />
      </div>
      <p className="flex items-center gap-1 text-[13px] text-muted">
        <MapPin aria-hidden="true" className="size-4" />
        {distance}
      </p>
      <p className="font-semibold text-brand">{price}</p>
      <p className="text-sm">{menu}</p>
      <p className="text-[13px] text-muted">Informasi utama tetap tersedia tanpa foto.</p>
      <div className="grid grid-cols-2 gap-2">
        <LinkButton className="min-w-0" href="#preview-detail" variant="ghost">
          Detail
        </LinkButton>
        <Button className="min-w-0" variant="ghost">
          Arahkan Sekarang
        </Button>
      </div>
    </Card>
  );
}

export { badgeVariants };
