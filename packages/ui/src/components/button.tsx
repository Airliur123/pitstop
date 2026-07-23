import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';
import {
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  forwardRef,
  type ReactNode,
} from 'react';

import { cn } from '../utilities';

const buttonVariants = cva(
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-button px-4 text-[length:var(--pitstop-type-label-large-size)] font-semibold leading-[var(--pitstop-type-label-large-line)] transition-colors duration-[var(--pitstop-duration-fast)] ease-[var(--pitstop-easing-standard)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:pointer-events-none disabled:border-border disabled:bg-app disabled:text-disabled aria-disabled:pointer-events-none aria-disabled:border-border aria-disabled:bg-app aria-disabled:text-disabled',
  {
    variants: {
      variant: {
        primary:
          'bg-interactive text-inverse hover:bg-interactive-hover active:bg-interactive-active',
        secondary:
          'border border-border-brand bg-surface text-brand hover:bg-surface-success active:bg-surface-success',
        ghost: 'bg-transparent text-brand hover:bg-surface-success active:bg-surface-success',
        destructive: 'bg-surface-danger text-inverse hover:brightness-95 active:brightness-90',
      },
      size: {
        default: 'min-w-32',
        compact: 'min-w-0 px-3',
        full: 'w-full',
      },
    },
    defaultVariants: {
      size: 'default',
      variant: 'primary',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  readonly asChild?: boolean;
  readonly loading?: boolean;
  readonly loadingLabel?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    asChild = false,
    children,
    className,
    disabled,
    loading = false,
    loadingLabel = 'Memuat…',
    size,
    type = 'button',
    variant,
    ...properties
  },
  ref,
) {
  const Component = asChild ? Slot : 'button';

  return (
    <Component
      aria-busy={loading || undefined}
      aria-disabled={loading || disabled || undefined}
      className={cn(buttonVariants({ size, variant }), className)}
      disabled={asChild ? undefined : loading || disabled}
      ref={ref}
      type={asChild ? undefined : type}
      {...properties}
    >
      {loading ? (
        <>
          <span>{loadingLabel}</span>
          <LoaderCircle
            aria-hidden="true"
            className="size-4 animate-spin motion-reduce:animate-none"
          />
        </>
      ) : (
        children
      )}
    </Component>
  );
});

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-label' | 'children'
> {
  readonly 'aria-label': string;
  readonly children: ReactNode;
  readonly loading?: boolean;
  readonly variant?: NonNullable<VariantProps<typeof buttonVariants>['variant']>;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { children, className, loading = false, variant = 'ghost', ...properties },
  ref,
) {
  return (
    <Button
      className={cn('size-12 min-w-12 p-0', className)}
      loading={loading}
      ref={ref}
      variant={variant}
      {...properties}
    >
      {children}
    </Button>
  );
});

export interface LinkButtonProps
  extends AnchorHTMLAttributes<HTMLAnchorElement>, VariantProps<typeof buttonVariants> {
  readonly children: ReactNode;
}

export const LinkButton = forwardRef<HTMLAnchorElement, LinkButtonProps>(function LinkButton(
  { children, className, size, variant, ...properties },
  ref,
) {
  return (
    <a className={cn(buttonVariants({ size, variant }), className)} ref={ref} {...properties}>
      {children}
    </a>
  );
});

export { buttonVariants };
