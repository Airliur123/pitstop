import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithoutRef } from 'react';

import { cn } from './utilities';

const badge = cva(
  'inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-sm font-semibold',
  {
    variants: {
      tone: {
        neutral: 'border-slate-300 bg-slate-50 text-slate-700',
        success: 'border-green-300 bg-green-50 text-green-800',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface FoundationBadgeProps
  extends ComponentPropsWithoutRef<'span'>, VariantProps<typeof badge> {
  readonly asChild?: boolean;
}

export function FoundationBadge({
  asChild = false,
  className,
  tone,
  ...properties
}: FoundationBadgeProps) {
  const Component = asChild ? Slot : 'span';
  return <Component className={cn(badge({ tone }), className)} {...properties} />;
}
