'use client';

import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { Check, ChevronDown, Search } from 'lucide-react';
import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
} from 'react';

import { cn } from '../utilities';

const fieldControl =
  'min-h-12 w-full rounded-button border border-border bg-surface px-3.5 text-base text-foreground outline-none transition-colors placeholder:text-muted hover:border-border-strong focus-visible:border-border-brand focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:bg-app disabled:text-disabled aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger read-only:bg-app';

export function Label({
  children,
  className,
  required,
  ...properties
}: React.LabelHTMLAttributes<HTMLLabelElement> & Readonly<{ required?: boolean }>) {
  return (
    <label
      className={cn(
        'text-[length:var(--pitstop-type-label-medium-size)] font-semibold leading-[var(--pitstop-type-label-medium-line)]',
        className,
      )}
      {...properties}
    >
      {children}
      {required ? (
        <>
          <span aria-hidden="true" className="text-danger">
            {' '}
            *
          </span>
          <span className="sr-only"> (wajib)</span>
        </>
      ) : null}
    </label>
  );
}

export function FieldDescription({
  className,
  ...properties
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-[13px] leading-[18px] text-muted', className)} {...properties} />;
}

export function FieldError({
  className,
  ...properties
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn('flex items-center gap-1 text-[13px] leading-[18px] text-danger', className)}
      {...properties}
    />
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...properties }, ref) {
    return <input className={cn(fieldControl, className)} ref={ref} {...properties} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, rows = 4, ...properties }, ref) {
  return (
    <textarea
      className={cn(fieldControl, 'min-h-28 resize-y py-3', className)}
      ref={ref}
      rows={rows}
      {...properties}
    />
  );
});

export function FormField({
  children,
  className,
  description,
  error,
  id: providedId,
  label,
  required = false,
}: Readonly<{
  children: (properties: {
    'aria-describedby': string | undefined;
    'aria-invalid': boolean | undefined;
    id: string;
  }) => ReactNode;
  className?: string;
  description?: string;
  error?: string;
  id?: string;
  label: string;
  required?: boolean;
}>) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      {children({
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        id,
      })}
      {description ? <FieldDescription id={descriptionId}>{description}</FieldDescription> : null}
      {error ? (
        <FieldError id={errorId} role="alert">
          {error}
        </FieldError>
      ) : null}
    </div>
  );
}

export const SearchField = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>
>(function SearchField({ className, ...properties }, ref) {
  return (
    <div className="relative">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted"
      />
      <Input className={cn('pl-11', className)} ref={ref} type="search" {...properties} />
    </div>
  );
});

export function Checkbox({
  checked,
  defaultChecked,
  disabled,
  label,
  name,
  onCheckedChange,
}: Readonly<{
  checked?: boolean | 'indeterminate';
  defaultChecked?: boolean;
  disabled?: boolean;
  label: string;
  name?: string;
  onCheckedChange?: (checked: boolean | 'indeterminate') => void;
}>) {
  const id = useId();
  return (
    <div className="flex items-center gap-3">
      <CheckboxPrimitive.Root
        className="flex size-12 items-center justify-center rounded-button border border-border bg-surface text-inverse outline-none focus-visible:ring-2 focus-visible:ring-focus data-[state=checked]:border-interactive data-[state=checked]:bg-interactive disabled:bg-app disabled:text-disabled"
        disabled={disabled}
        id={id}
        {...(checked === undefined ? {} : { checked })}
        {...(defaultChecked === undefined ? {} : { defaultChecked })}
        {...(name === undefined ? {} : { name })}
        {...(onCheckedChange === undefined ? {} : { onCheckedChange })}
      >
        <CheckboxPrimitive.Indicator>
          <Check aria-hidden="true" className="size-5" />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <Label className="text-sm" htmlFor={id}>
        {label}
      </Label>
    </div>
  );
}

export function RadioGroup({
  defaultValue,
  label,
  name,
  options,
}: Readonly<{
  defaultValue?: string;
  label: string;
  name?: string;
  options: ReadonlyArray<{ label: string; value: string }>;
}>) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-[13px] font-semibold">{label}</legend>
      <RadioGroupPrimitive.Root
        className="grid gap-2"
        {...(defaultValue === undefined ? {} : { defaultValue })}
        {...(name === undefined ? {} : { name })}
      >
        {options.map((option) => {
          const id = `${name ?? 'radio'}-${option.value}`;
          return (
            <div className="flex items-center gap-3" key={option.value}>
              <RadioGroupPrimitive.Item
                className="flex size-12 items-center justify-center rounded-full border border-border bg-surface outline-none focus-visible:ring-2 focus-visible:ring-focus data-[state=checked]:border-interactive"
                id={id}
                value={option.value}
              >
                <RadioGroupPrimitive.Indicator className="size-3 rounded-full bg-interactive" />
              </RadioGroupPrimitive.Item>
              <Label className="text-sm" htmlFor={id}>
                {option.label}
              </Label>
            </div>
          );
        })}
      </RadioGroupPrimitive.Root>
    </fieldset>
  );
}

export function Switch({
  defaultChecked,
  label,
  name,
}: Readonly<{ defaultChecked?: boolean; label: string; name?: string }>) {
  const id = useId();
  return (
    <div className="flex items-center gap-3">
      <SwitchPrimitive.Root
        className="relative h-12 w-16 rounded-full border border-border bg-border-strong outline-none focus-visible:ring-2 focus-visible:ring-focus data-[state=checked]:bg-interactive"
        id={id}
        {...(defaultChecked === undefined ? {} : { defaultChecked })}
        {...(name === undefined ? {} : { name })}
      >
        <SwitchPrimitive.Thumb className="block size-9 translate-x-1 rounded-full bg-surface shadow-card transition-transform data-[state=checked]:translate-x-[26px]" />
      </SwitchPrimitive.Root>
      <Label className="text-sm" htmlFor={id}>
        {label}
      </Label>
    </div>
  );
}

export function Select({
  defaultValue,
  disabled,
  label,
  name,
  options,
  placeholder = 'Pilih opsi',
}: Readonly<{
  defaultValue?: string;
  disabled?: boolean;
  label: string;
  name?: string;
  options: ReadonlyArray<{ label: string; value: string }>;
  placeholder?: string;
}>) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <SelectPrimitive.Root
        {...(defaultValue === undefined ? {} : { defaultValue })}
        {...(disabled === undefined ? {} : { disabled })}
        {...(name === undefined ? {} : { name })}
      >
        <SelectPrimitive.Trigger
          className={cn(fieldControl, 'flex items-center justify-between text-left')}
          id={id}
        >
          <SelectPrimitive.Value placeholder={placeholder} />
          <SelectPrimitive.Icon>
            <ChevronDown aria-hidden="true" className="size-5 text-muted" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content className="z-[var(--pitstop-z-modal)] overflow-hidden rounded-button border border-border bg-surface p-1 shadow-floating">
            <SelectPrimitive.Viewport>
              {options.map((option) => (
                <SelectPrimitive.Item
                  className="relative flex min-h-12 cursor-default select-none items-center rounded-small px-9 text-sm outline-none focus:bg-surface-success data-[state=checked]:font-semibold data-[state=checked]:text-brand"
                  key={option.value}
                  value={option.value}
                >
                  <SelectPrimitive.ItemIndicator className="absolute left-3">
                    <Check aria-hidden="true" className="size-4" />
                  </SelectPrimitive.ItemIndicator>
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </div>
  );
}

export type NativeSelectProps = SelectHTMLAttributes<HTMLSelectElement>;
