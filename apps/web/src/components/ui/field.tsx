import { Check, Eye, EyeSlash } from '@phosphor-icons/react'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import * as LabelPrimitive from '@radix-ui/react-label'
import { useId, useState, type ComponentProps, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

const inputBase = [
  'h-11 w-full rounded-control border bg-field-bg px-3 text-sm text-fg',
  'placeholder:text-fg-subtle',
  'transition-[border-color,box-shadow] duration-150',
  'hover:border-field-border-hover',
  'focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring/30 focus-visible:outline-none',
  'disabled:cursor-not-allowed disabled:opacity-60',
].join(' ')

function labelTone(error?: string) {
  return error
    ? 'border-danger focus:border-danger focus:ring-danger/25'
    : 'border-field-border'
}

interface FieldShellProps {
  id: string
  label: string
  hint?: string
  error?: string
  labelAction?: ReactNode
  children: ReactNode
}

function FieldShell({ id, label, hint, error, labelAction, children }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <LabelPrimitive.Root
          htmlFor={id}
          className="text-[13px] font-medium text-fg-muted select-none"
        >
          {label}
        </LabelPrimitive.Root>
        {labelAction}
      </div>

      {children}

      {error ? (
        <p id={`${id}-error`} className="text-[13px] leading-snug text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[13px] leading-snug text-fg-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export interface TextFieldProps extends Omit<ComponentProps<'input'>, 'id'> {
  id: string
  label: string
  hint?: string
  error?: string
  labelAction?: ReactNode
}

export function TextField({
  id,
  label,
  hint,
  error,
  labelAction,
  className,
  ...props
}: TextFieldProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} labelAction={labelAction}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(inputBase, labelTone(error), className)}
        {...props}
      />
    </FieldShell>
  )
}

export function PasswordField({
  id,
  label,
  hint,
  error,
  labelAction,
  className,
  ...props
}: TextFieldProps) {
  const [visible, setVisible] = useState(false)

  return (
    <FieldShell id={id} label={label} hint={hint} error={error} labelAction={labelAction}>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={cn(inputBase, labelTone(error), 'pr-12', className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => {
            setVisible((current) => !current)
          }}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className={cn(
            'absolute top-1 right-1 flex size-9 items-center justify-center',
            'text-fg-subtle transition-colors duration-150',
            'hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45',
          )}
        >
          {visible ? <EyeSlash size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
        </button>
      </div>
    </FieldShell>
  )
}

interface CheckboxFieldProps {
  id?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  children: ReactNode
  error?: string
  disabled?: boolean
}

export function CheckboxField({
  id,
  checked,
  onCheckedChange,
  children,
  error,
  disabled,
}: CheckboxFieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2.5">
        <CheckboxPrimitive.Root
          id={fieldId}
          checked={checked}
          onCheckedChange={(value) => {
            onCheckedChange(value === true)
          }}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fieldId}-error` : undefined}
          className={cn(
            'mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-[6px] border',
            'transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
            'disabled:cursor-not-allowed disabled:opacity-55',
            error ? 'border-danger' : 'border-field-border',
            'data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-accent-fg',
          )}
        >
          <CheckboxPrimitive.Indicator>
            <Check size={12} weight="bold" aria-hidden />
          </CheckboxPrimitive.Indicator>
        </CheckboxPrimitive.Root>

        <LabelPrimitive.Root
          htmlFor={fieldId}
          className="cursor-pointer text-[13px] leading-snug text-fg-muted select-none"
        >
          {children}
        </LabelPrimitive.Root>
      </div>

      {error ? (
        <p id={`${fieldId}-error`} className="text-[13px] leading-snug text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
