'use client';

import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../utilities';
import { Button, IconButton } from './button';

const overlay =
  'fixed inset-0 z-[var(--pitstop-z-overlay)] bg-surface-navy/50 data-[state=open]:animate-in data-[state=closed]:animate-out';
const content =
  'fixed z-[var(--pitstop-z-modal)] border border-border bg-surface p-6 shadow-overlay outline-none';

export function Dialog({
  children,
  description,
  title,
  trigger,
}: Readonly<{ children: ReactNode; description?: string; title: string; trigger: ReactNode }>) {
  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlay} />
        <DialogPrimitive.Content
          className={cn(
            content,
            'left-1/2 top-1/2 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[30rem] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-modal',
          )}
        >
          <div className="pr-12">
            <DialogPrimitive.Title className="text-[length:var(--pitstop-type-heading-h2-size)] font-semibold leading-[var(--pitstop-type-heading-h2-line)]">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description
              className={description ? 'mt-2 text-sm text-muted' : 'sr-only'}
            >
              {description ?? 'Dialog interaktif.'}
            </DialogPrimitive.Description>
          </div>
          <div className="mt-5">{children}</div>
          <DialogPrimitive.Close asChild>
            <IconButton aria-label="Tutup dialog" className="absolute right-3 top-3">
              <X aria-hidden="true" className="size-5" />
            </IconButton>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function Sheet({
  children,
  description,
  title,
  trigger,
}: Readonly<{ children: ReactNode; description?: string; title: string; trigger: ReactNode }>) {
  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlay} />
        <DialogPrimitive.Content
          className={cn(
            content,
            'bottom-0 left-0 max-h-[80dvh] w-full overflow-y-auto rounded-t-modal pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:left-1/2 sm:max-w-[430px] sm:-translate-x-1/2',
          )}
        >
          <div aria-hidden="true" className="mx-auto mb-4 h-1 w-12 rounded-full bg-border-strong" />
          <div className="pr-12">
            <DialogPrimitive.Title className="text-[length:var(--pitstop-type-heading-h2-size)] font-semibold">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description
              className={description ? 'mt-2 text-sm text-muted' : 'sr-only'}
            >
              {description ?? 'Lembar interaktif.'}
            </DialogPrimitive.Description>
          </div>
          <div className="mt-5">{children}</div>
          <DialogPrimitive.Close asChild>
            <IconButton aria-label="Tutup lembar" className="absolute right-3 top-3">
              <X aria-hidden="true" className="size-5" />
            </IconButton>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function AlertDialog({
  cancelLabel = 'Batal',
  confirmLabel = 'Lanjutkan',
  description,
  onConfirm,
  title,
  trigger,
}: Readonly<{
  cancelLabel?: string;
  confirmLabel?: string;
  description: string;
  onConfirm?: () => void;
  title: string;
  trigger: ReactNode;
}>) {
  return (
    <AlertDialogPrimitive.Root>
      <AlertDialogPrimitive.Trigger asChild>{trigger}</AlertDialogPrimitive.Trigger>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className={overlay} />
        <AlertDialogPrimitive.Content
          className={cn(
            content,
            'left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-modal',
          )}
        >
          <AlertDialogPrimitive.Title className="text-[length:var(--pitstop-type-heading-h2-size)] font-semibold">
            {title}
          </AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description className="mt-2 text-sm text-muted">
            {description}
          </AlertDialogPrimitive.Description>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogPrimitive.Cancel asChild>
              <Button variant="secondary">{cancelLabel}</Button>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild>
              <Button onClick={onConfirm} variant="destructive">
                {confirmLabel}
              </Button>
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}

export function Tooltip({
  children,
  content: tooltipContent,
}: Readonly<{ children: ReactNode; content: string }>) {
  return (
    <TooltipPrimitive.Provider delayDuration={350}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            className="z-[var(--pitstop-z-modal)] rounded-small bg-surface-navy px-3 py-2 text-[13px] text-inverse shadow-floating"
            sideOffset={6}
          >
            {tooltipContent}
            <TooltipPrimitive.Arrow className="fill-surface-navy" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
