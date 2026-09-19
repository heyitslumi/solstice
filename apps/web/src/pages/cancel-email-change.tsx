import { CircleNotch } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { AuthHeading } from '@/components/auth/auth-heading'
import { StatusPanel } from '@/components/auth/status-panel'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'

export function CancelEmailChangePage() {
  const [searchParams] = useSearchParams()
  const token = (searchParams.get('token') ?? '').trim()

  const [state, setState] = useState<'working' | 'done' | 'failed'>(token ? 'working' : 'failed')
  const [error, setError] = useState<string | null>(null)
  const attempted = useRef(false)

  useEffect(() => {
    // StrictMode runs effects twice in development and the token is single-use,
    // so a second request would burn it and report a good link as invalid.
    if (!token || attempted.current) return
    attempted.current = true

    void api.cancelEmailChangeByToken({ token }).then((result) => {
      if (!result.ok) {
        setError(result.error.message ?? 'That link is no longer valid.')
        setState('failed')
        return
      }

      setState('done')
    })
  }, [token])

  if (state === 'working') {
    return (
      <div className="auth-stack flex flex-col gap-7">
        <AuthHeading
          title="Stopping the change"
          description="One moment while we check that link."
        />
        <p role="status" className="flex items-center gap-2 text-[13px] text-fg-muted">
          <CircleNotch size={16} weight="bold" className="animate-spin" aria-hidden />
          Working…
        </p>
      </div>
    )
  }

  if (state === 'failed') {
    return (
      <StatusPanel
        tone="warning"
        title="Nothing to stop"
        description={
          error ??
          'That link is incomplete, or the change it referred to has already been cancelled or completed.'
        }
      >
        <Link to="/account" className="w-full">
          <Button className="w-full">Go to your account</Button>
        </Link>
        <Link
          to="/login"
          className="text-center text-[13px] font-medium text-accent-text underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </StatusPanel>
    )
  }

  return (
    <StatusPanel
      tone="success"
      title="Address change stopped"
      description="The account keeps its current email address, and the code that was sent to the new one no longer works."
    >
      <p className="text-[13px] leading-relaxed text-fg-muted">
        If you did not ask for the change, someone else was signed in as you. Sign in again from a device
        you trust and review your sessions.
      </p>
      <Link to="/login" className="w-full">
        <Button className="w-full">Back to sign in</Button>
      </Link>
    </StatusPanel>
  )
}
