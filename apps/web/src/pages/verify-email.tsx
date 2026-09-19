import { ArrowClockwise, CircleNotch } from '@phosphor-icons/react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { AuthForm } from '@/components/auth/auth-form'
import { AuthHeading, AuthSwitch } from '@/components/auth/auth-heading'
import { StatusPanel } from '@/components/auth/status-panel'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/field'
import { api } from '@/lib/api'
import { useSession } from '@/lib/session'

const CODE_LENGTH = 6
const RESEND_COOLDOWN_SECONDS = 30

export function VerifyEmailPage() {
  const navigate = useNavigate()
  const { refresh } = useSession()
  const [searchParams] = useSearchParams()
  const email = (searchParams.get('email') ?? '').trim()
  const token = (searchParams.get('token') ?? '').trim()

  const [linkState, setLinkState] = useState<'idle' | 'working' | 'failed'>(
    token ? 'working' : 'idle',
  )
  const [linkError, setLinkError] = useState<string | null>(null)
  const attempted = useRef(false)

  useEffect(() => {
    // StrictMode runs effects twice in development and the token is single-use,
    // so a second request would burn it and report a perfectly good link invalid.
    if (!token || attempted.current) return
    attempted.current = true

    void api.verifyEmailLink({ token }).then(async (result) => {
      if (!result.ok) {
        setLinkError(result.error.message ?? 'That confirmation link is invalid.')
        setLinkState('failed')
        return
      }

      await refresh()
      navigate('/dashboard', { replace: true })
    })
  }, [token, refresh, navigate])

  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | undefined>(undefined)
  const [pending, setPending] = useState(false)
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return

    const timer = window.setInterval(() => {
      setCooldown((seconds) => (seconds <= 1 ? 0 : seconds - 1))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [cooldown])

  if (!email) {
    return (
      <StatusPanel
        tone="warning"
        title="This page needs an email address"
        description="Open it from the link we emailed you, or create the account again to receive a new code."
      >
        <Link to="/login" className="w-full">
          <Button className="w-full">Back to sign in</Button>
        </Link>
      </StatusPanel>
    )
  }

  if (linkState === 'working') {
    return (
      <div className="auth-stack flex flex-col gap-7">
        <AuthHeading
          title="Confirming your email"
          description="One moment while we check that link."
        />
        <p role="status" className="flex items-center gap-2 text-[13px] text-fg-muted">
          <CircleNotch size={16} weight="bold" className="animate-spin" aria-hidden />
          Confirming…
        </p>
      </div>
    )
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    if (code.length !== CODE_LENGTH) {
      setCodeError(`Enter the ${CODE_LENGTH}-digit code from your email.`)
      return
    }

    setCodeError(undefined)
    setPending(true)
    const result = await api.verifyEmail({ email, code })
    setPending(false)

    if (!result.ok) {
      setCodeError(result.error.message ?? 'That code is not correct.')
      return
    }

    await refresh()
    navigate('/dashboard', { replace: true })
  }

  async function handleResend() {
    if (resending || cooldown > 0) return

    setResending(true)
    setResent(false)
    const result = await api.resendVerification({ email })
    setResending(false)

    if (!result.ok) {
      setCodeError(result.error.message ?? 'Could not send a new code. Try again.')
      return
    }

    setResent(true)
    setCooldown(RESEND_COOLDOWN_SECONDS)
  }

  return (
    <div className="auth-stack flex flex-col gap-7">
      <AuthHeading
        title="Confirm your email"
        description={`Enter the ${CODE_LENGTH}-digit code we sent to ${email}.`}
      />

      {linkError ? <Alert tone="danger">{linkError}</Alert> : null}

      {resent ? <Alert tone="success">A new code is on its way to {email}.</Alert> : null}

      <AuthForm onSubmit={handleSubmit} noValidate>
        <TextField
          id="verify-code"
          name="code"
          label="Verification code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={CODE_LENGTH}
          autoFocus
          placeholder={'0'.repeat(CODE_LENGTH)}
          value={code}
          onChange={(event) => {
            setCode(event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))
            setCodeError(undefined)
          }}
          error={codeError}
          disabled={pending}
          className="h-12 pl-[0.35em] text-center font-mono text-[1.25rem] tracking-[0.35em]"
        />

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? (
            <>
              <CircleNotch size={16} weight="bold" className="animate-spin" aria-hidden />
              Confirming
            </>
          ) : (
            'Confirm email'
          )}
        </Button>

        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-fg-subtle">Did not get it?</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={resending || cooldown > 0}
            onClick={handleResend}
          >
            {resending ? (
              <>
                <CircleNotch size={14} weight="bold" className="animate-spin" aria-hidden />
                Sending
              </>
            ) : cooldown > 0 ? (
              <>
                <ArrowClockwise size={14} aria-hidden />
                Resend in {cooldown}s
              </>
            ) : (
              'Send a new code'
            )}
          </Button>
        </div>
      </AuthForm>

      <AuthSwitch prompt="Already confirmed?" linkLabel="Sign in" to="/login" />
    </div>
  )
}
