import { CircleNotch, Key } from '@phosphor-icons/react'
import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { AuthForm } from '@/components/auth/auth-form'
import { AuthHeading } from '@/components/auth/auth-heading'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { CheckboxField, TextField } from '@/components/ui/field'
import { EMAIL_PATTERN, api } from '@/lib/api'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'

const CODE_LENGTH = 6

export function LoginPage() {
  const navigate = useNavigate()
  const { refresh } = useSession()
  const [searchParams] = useSearchParams()

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [needsName, setNeedsName] = useState(false)
  const [remember, setRemember] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  // The emailed magic link lands here with its token in the query string.
  const [sent, setSent] = useState(false)
  const [linking, setLinking] = useState(false)

  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | undefined>(undefined)
  const [verifying, setVerifying] = useState(false)
  const [resent, setResent] = useState(false)

  const [passkeyPending, setPasskeyPending] = useState(false)
  const [passkeyError, setPasskeyError] = useState<string | null>(null)

  async function completeSignIn() {
    await refresh()
    navigate('/dashboard', { replace: true })
  }

  const attempted = useRef(false)

  useEffect(() => {
    const token = searchParams.get('token')

    // StrictMode runs effects twice in dev and login tokens are single-use;
    // a second request would burn it and report the link invalid.
    if (!token || attempted.current) return
    attempted.current = true

    setLinking(true)
    void (async () => {
      const result = await api.loginLink({ token })
      setLinking(false)

      if (!result.ok) {
        setFormError(result.error.message ?? 'That sign-in link is invalid or has expired.')
        searchParams.delete('token')
        navigate('/login', { replace: true })
        return
      }

      await completeSignIn()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const trimmedEmail = email.trim()
    const trimmedName = name.trim()
    const nextErrors: Record<string, string> = {}

    if (!trimmedEmail) nextErrors.email = 'Enter your email address.'
    else if (!EMAIL_PATTERN.test(trimmedEmail))
      nextErrors.email = 'That does not look like a valid email address.'

    if (needsName && !trimmedName) {
      nextErrors.name = 'Enter your full name.'
    }

    setErrors(nextErrors)
    setFormError(null)
    if (Object.keys(nextErrors).length > 0) return

    setPending(true)
    const result = await api.login({
      email: trimmedEmail,
      name: needsName ? trimmedName : undefined,
      remember,
    })
    setPending(false)

    if (!result.ok) {
      console.error('[login error]', result.error)
      setErrors(result.error.fieldErrors ?? {})
      setFormError(result.error.message ?? 'Something went wrong. Try again.')
      return
    }

    if (result.data.needsName) {
      setNeedsName(true)
      return
    }

    setSent(true)
    setCode('')
    setCodeError(undefined)
    setResent(false)
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (verifying) return

    if (code.length !== CODE_LENGTH) {
      setCodeError(`Enter the ${CODE_LENGTH}-digit code from your email.`)
      return
    }

    setCodeError(undefined)
    setVerifying(true)
    const result = await api.loginVerify({ email: email.trim(), code })
    setVerifying(false)

    if (!result.ok) {
      setCodeError(result.error.message ?? 'That code is not correct.')
      return
    }

    await completeSignIn()
  }

  async function handleResend() {
    if (verifying) return

    setResent(false)
    const result = await api.loginResend({ email: email.trim(), remember })

    if (!result.ok) {
      setCodeError(result.error.message ?? 'Could not send a new code. Try again.')
      return
    }

    setResent(true)
  }

  async function handlePasskeySignIn() {
    if (passkeyPending) return

    setPasskeyError(null)
    setFormError(null)
    setPasskeyPending(true)

    const options = await api.passkeyLoginOptions()
    if (!options.ok) {
      setPasskeyPending(false)
      setPasskeyError(options.error.message ?? 'Could not start passkey sign-in.')
      return
    }

    try {
      const assertion = await startAuthentication({ optionsJSON: options.data.options })
      const result = await api.passkeyLoginVerify({ response: assertion, remember })

      if (!result.ok) {
        setPasskeyError(result.error.message ?? 'Could not verify that passkey.')
        return
      }

      await completeSignIn()
    } catch {
      // Dismissing the browser prompt is the common case here, so this stays neutral
      // rather than reporting a failure the user caused deliberately.
      setPasskeyError('Passkey sign-in was not completed.')
    } finally {
      setPasskeyPending(false)
    }
  }

  if (linking) {
    return (
      <div className="auth-stack flex flex-col gap-7">
        <AuthHeading title="Signing you in" description="Verifying the link from your email." />
      </div>
    )
  }

  if (sent) {
    return (
      <div className="auth-stack flex flex-col gap-7">
        <AuthHeading
          title="Check your email"
          description={`We sent a sign-in link and a ${CODE_LENGTH}-digit code to ${email.trim()}.`}
        />

        {resent ? <Alert tone="success">A new code is on its way.</Alert> : null}

        <AuthForm onSubmit={handleVerify} noValidate>
          <TextField
            id="login-code"
            name="code"
            label="Sign-in code"
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
            disabled={verifying}
            className={cn('h-12 text-center font-mono text-[1.25rem] pl-[0.35em] tracking-[0.35em]')}
          />

          <Button type="submit" disabled={verifying} className="w-full">
            {verifying ? (
              <>
                <CircleNotch size={16} weight="bold" className="animate-spin" aria-hidden />
                Signing in
              </>
            ) : (
              'Sign in'
            )}
          </Button>

          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={verifying}
              onClick={() => {
                setSent(false)
                setCode('')
              }}
            >
              Use a different email
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={verifying}
              onClick={() => {
                void handleResend()
              }}
            >
              Send a new code
            </Button>
          </div>
        </AuthForm>
      </div>
    )
  }

  return (
    <div className="auth-stack flex flex-col gap-7">
      <AuthHeading
        title="Sign in"
        description="Access your servers, snapshots and network allocations."
      />

      {formError ? <Alert tone="danger">{formError}</Alert> : null}

      {passkeyError ? <Alert tone="danger">{passkeyError}</Alert> : null}

      <AuthForm onSubmit={handleSubmit} noValidate>
        <TextField
          id="login-email"
          name="email"
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value)
            setNeedsName(false)
          }}
          error={errors.email}
          disabled={pending}
        />

        {needsName ? (
          <TextField
            id="login-name"
            name="name"
            label="Full name"
            type="text"
            autoComplete="name"
            autoFocus
            placeholder="Ada Lovelace"
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={errors.name}
            disabled={pending}
          />
        ) : null}

        <CheckboxField
          id="login-remember"
          checked={remember}
          onCheckedChange={setRemember}
          disabled={pending}
        >
          Keep me signed in on this device
        </CheckboxField>

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? (
            <>
              <CircleNotch size={16} weight="bold" className="animate-spin" aria-hidden />
              {needsName ? 'Creating account' : 'Sending link'}
            </>
          ) : needsName ? (
            'Continue to verification'
          ) : (
            'Continue with email'
          )}
        </Button>
      </AuthForm>

      {browserSupportsWebAuthn() ? (
        <>
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[12px] text-fg-subtle">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={pending || passkeyPending}
            onClick={() => {
              void handlePasskeySignIn()
            }}
          >
            {passkeyPending ? (
              <>
                <CircleNotch size={16} weight="bold" className="animate-spin" aria-hidden />
                Waiting for your device
              </>
            ) : (
              <>
                <Key size={16} aria-hidden />
                Sign in with a passkey
              </>
            )}
          </Button>
        </>
      ) : null}
    </div>
  )
}