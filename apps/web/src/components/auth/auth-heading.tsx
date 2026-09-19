import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface AuthHeadingProps {
  title: string
  description: string
  children?: ReactNode
}

export function AuthHeading({ title, description, children }: AuthHeadingProps) {
  return (
    <div className="animate-fade-up flex flex-col gap-2">
      <h1 className="text-[1.6rem] leading-tight font-semibold tracking-tight text-fg">
        {title}
      </h1>
      <p className="text-[14px] leading-relaxed text-fg-muted">{description}</p>
      {children}
    </div>
  )
}

interface AuthSwitchProps {
  prompt: string
  linkLabel: string
  to: string
}

export function AuthSwitch({ prompt, linkLabel, to }: AuthSwitchProps) {
  return (
    <p className="animate-fade-up text-[13px] text-fg-muted" style={{ animationDelay: '280ms' }}>
      {prompt}{' '}
      <Link to={to} className="font-medium text-accent-text underline-offset-4 hover:underline">
        {linkLabel}
      </Link>
    </p>
  )
}
