import { CheckCircle, WarningCircle } from '@phosphor-icons/react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface AlertProps {
  tone: 'danger' | 'success' | 'warning'
  children: ReactNode
}

export function Alert({ tone, children }: AlertProps) {
  const Icon = tone === 'success' ? CheckCircle : WarningCircle

  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2.5 rounded-control border px-3 py-2.5 text-[13px] leading-snug',
        tone === 'danger' && 'animate-shake border-danger/35 bg-danger-surface text-danger',
        tone === 'success' && 'animate-scale-in border-success/35 bg-success-surface text-success',
        tone === 'warning' && 'border-amber-500/35 bg-amber-500/10 text-amber-300',
      )}
    >
      <Icon size={17} weight="fill" className="mt-px shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  )
}
