import * as Slot from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap',
    'rounded-control text-sm font-medium select-none',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-150',
    'ease-[cubic-bezier(0.16,1,0.3,1)]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
    'disabled:pointer-events-none disabled:opacity-55',
    'active:translate-y-px',
  ],
  {
    variants: {
      variant: {
        primary:
          'bg-accent text-accent-fg shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22)] hover:bg-accent-hover active:bg-accent-active',
        secondary:
          'border border-field-border bg-surface text-fg hover:border-accent hover:text-accent-text',
        ghost: 'text-fg-muted hover:bg-surface-2 hover:text-fg',
        danger:
          'bg-danger text-bg shadow-[inset_0_1px_0_0_rgba(255,255,255,0.18)] hover:brightness-110 active:brightness-95',
      },
      size: {
        md: 'h-11 px-4',
        sm: 'h-9 px-3 text-[13px]',
        lg: 'h-12 px-6 text-[15px]',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
)

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Render the child element (e.g. a router Link) with button styling. */
    asChild?: boolean
  }

export function Button({
  className,
  variant,
  size,
  type = 'button',
  asChild,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Slot : 'button'

  return (
    <Comp
      type={asChild ? undefined : type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}
