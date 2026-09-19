import { CheckCircle, WarningCircle } from '@phosphor-icons/react'
import type { ReactNode } from 'react'

import { AuthHeading } from '@/components/auth/auth-heading'
import { cn } from '@/lib/utils'

interface StatusPanelProps {
  tone: 'success' | 'warning'
  title: string
  description: string
  children?: ReactNode
}

export function StatusPanel({ tone, title, description, children }: StatusPanelProps) {
  const Icon = tone === 'success' ? CheckCircle : WarningCircle

  return (
    <div className="flex flex-col gap-6">
      <span
        className={cn(
          'animate-pop flex size-11 items-center justify-center rounded-control',
          tone === 'success'
            ? 'bg-success-surface text-success'
            : 'bg-danger-surface text-danger',
        )}
      >
        <Icon size={22} weight="fill" aria-hidden />
      </span>

      <AuthHeading title={title} description={description} />

      {children ? (
        <div className="animate-fade-up flex flex-col gap-4" style={{ animationDelay: '160ms' }}>
          {children}
        </div>
      ) : null}
    </div>
  )
}
