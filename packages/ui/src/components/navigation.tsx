'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  FileText,
  Home,
  LayoutDashboard,
  MapPinned,
  Menu,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../utilities';
import { IconButton } from './button';

export function AppHeader({
  backHref,
  title = 'PitStop',
}: Readonly<{ backHref?: string; title?: string }>) {
  return (
    <header className="sticky top-0 z-[var(--pitstop-z-sticky)] flex h-16 items-center gap-3 border-b border-border bg-surface px-4">
      {backHref ? (
        <a
          aria-label="Kembali"
          className="flex size-12 items-center justify-center rounded-button text-muted outline-none focus-visible:ring-2 focus-visible:ring-focus"
          href={backHref}
        >
          <ChevronLeft aria-hidden="true" className="size-6" />
        </a>
      ) : null}
      <span className="text-[length:var(--pitstop-type-heading-h3-size)] font-semibold">
        {title}
      </span>
      <span className="flex-1" />
      {!backHref ? (
        <IconButton aria-label="Profil pengguna">
          <UserRound aria-hidden="true" className="size-6" />
        </IconButton>
      ) : null}
    </header>
  );
}

const mobileItems = [
  { href: '#beranda', icon: Home, label: 'Beranda', value: 'home' },
  { href: '#tambah', icon: CirclePlus, label: 'Tambah', value: 'add' },
  { href: '#aktivitas', icon: Activity, label: 'Aktivitas', value: 'activity' },
] as const;

export function MobileBottomNavigation({
  current = 'home',
}: Readonly<{ current?: (typeof mobileItems)[number]['value'] }>) {
  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed inset-x-0 bottom-0 z-[var(--pitstop-z-sticky)] mx-auto flex h-[calc(4.5rem+env(safe-area-inset-bottom))] max-w-[430px] items-start border-t border-border bg-surface px-2 pb-[env(safe-area-inset-bottom)]"
    >
      {mobileItems.map((item) => {
        const Icon = item.icon;
        const isCurrent = current === item.value;
        return (
          <a
            aria-current={isCurrent ? 'page' : undefined}
            className={cn(
              'flex min-h-16 flex-1 flex-col items-center justify-center gap-0.5 rounded-button text-[13px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-focus',
              isCurrent ? 'bg-surface-success text-brand' : 'text-muted',
            )}
            href={item.href}
            key={item.value}
          >
            <Icon aria-hidden="true" className="size-6" />
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}

export type AdminNavigationValue = 'dashboard' | 'moderation' | 'places' | 'reports';

const adminItems = [
  { href: '#dashboard', icon: LayoutDashboard, label: 'Dashboard', value: 'dashboard' },
  { href: '#moderation', icon: ShieldCheck, label: 'Moderasi', value: 'moderation' },
  { href: '#places', icon: MapPinned, label: 'Tempat aktif', value: 'places' },
  { href: '#reports', icon: FileText, label: 'Laporan', value: 'reports' },
] as const;

export function AdminSidebar({
  current = 'dashboard',
}: Readonly<{ current?: AdminNavigationValue }>) {
  return (
    <aside className="border-b border-white/10 bg-surface-navy px-5 py-5 text-inverse lg:sticky lg:top-0 lg:h-dvh lg:border-b-0 lg:py-7">
      <div className="flex items-center justify-between gap-3">
        <strong className="text-[length:var(--pitstop-type-heading-h2-size)]">PitStop Admin</strong>
        <Menu aria-hidden="true" className="size-6 lg:hidden" />
      </div>
      <nav aria-label="Navigasi admin" className="mt-5 flex gap-2 overflow-x-auto lg:flex-col">
        {adminItems.map((item) => {
          const Icon = item.icon;
          const isCurrent = item.value === current;
          return (
            <a
              aria-current={isCurrent ? 'page' : undefined}
              className={cn(
                'flex min-h-12 shrink-0 items-center gap-2.5 rounded-button px-3.5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-white',
                isCurrent ? 'bg-interactive text-inverse' : 'text-white/75 hover:bg-white/10',
              )}
              href={item.href}
              key={item.value}
            >
              <Icon aria-hidden="true" className="size-5" />
              {item.label}
            </a>
          );
        })}
      </nav>
    </aside>
  );
}

export function AdminTopbar({
  description,
  title,
  trailing,
}: Readonly<{ description?: string; title: string; trailing?: ReactNode }>) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[length:var(--pitstop-type-heading-h1-size)] font-bold leading-[var(--pitstop-type-heading-h1-line)]">
          {title}
        </h1>
        {description ? <p className="mt-1 text-[13px] text-muted">{description}</p> : null}
      </div>
      {trailing}
    </header>
  );
}

export function Tabs({
  defaultValue,
  items,
}: Readonly<{
  defaultValue: string;
  items: ReadonlyArray<{ content: ReactNode; label: string; value: string }>;
}>) {
  return (
    <TabsPrimitive.Root defaultValue={defaultValue}>
      <TabsPrimitive.List
        aria-label="Pilihan tampilan"
        className="flex gap-1 overflow-x-auto border-b border-border"
      >
        {items.map((item) => (
          <TabsPrimitive.Trigger
            className="min-h-12 shrink-0 border-b-2 border-transparent px-4 text-sm font-semibold text-muted outline-none focus-visible:ring-2 focus-visible:ring-focus data-[state=active]:border-interactive data-[state=active]:text-brand"
            key={item.value}
            value={item.value}
          >
            {item.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {items.map((item) => (
        <TabsPrimitive.Content className="py-4 outline-none" key={item.value} value={item.value}>
          {item.content}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}

export function Breadcrumb({
  items,
}: Readonly<{ items: ReadonlyArray<{ href?: string; label: string }> }>) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
        {items.map((item, index) => (
          <li className="flex items-center gap-2" key={`${item.label}-${index}`}>
            {index > 0 ? <span aria-hidden="true">/</span> : null}
            {item.href ? (
              <a
                className="rounded-small underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-focus"
                href={item.href}
              >
                {item.label}
              </a>
            ) : (
              <span aria-current="page" className="font-semibold text-foreground">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Pagination({ current, total }: Readonly<{ current: number; total: number }>) {
  return (
    <nav aria-label="Paginasi" className="flex items-center gap-2">
      <IconButton aria-label="Halaman sebelumnya" disabled={current <= 1}>
        <ChevronLeft aria-hidden="true" className="size-5" />
      </IconButton>
      <span aria-live="polite" className="min-w-24 text-center text-sm">
        {current} dari {total}
      </span>
      <IconButton aria-label="Halaman berikutnya" disabled={current >= total}>
        <ChevronRight aria-hidden="true" className="size-5" />
      </IconButton>
    </nav>
  );
}
