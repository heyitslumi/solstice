import { CheckCircle, WarningCircle } from '@phosphor-icons/react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface AlertProps {
  tone: 'danger' | 'success'
  children: ReactNode
}

export function Alert({ tone, children }: AlertProps) {
  const isDanger = tone === 'danger'
  const Icon = isDanger ? WarningCircle : CheckCircle

  return (
    <div
      role={isDanger ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2.5 rounded-control border px-3 py-2.5 text-[13px] leading-snug',
        isDanger ? 'animate-shake' : 'animate-scale-in',
        isDanger
          ? 'border-danger/35 bg-danger-surface text-danger'
          : 'border-success/35 bg-success-surface text-success',
      )}
    >
      <Icon size={17} weight="fill" className="mt-px shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  )
}
