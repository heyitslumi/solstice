import { CircleNotch, Key } from '@phosphor-icons/react'
import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { AuthForm } from '@/components/auth/auth-form'
import { AuthHeading } from '@/components/auth/auth-heading'
import { CaptchaWidget } from '@/components/captcha-widget'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { CheckboxField, TextField } from '@/components/ui/field'
import { EMAIL_PATTERN, api, type PublicOAuthProvider } from '@/lib/api'
import { useAppConfig } from '@/lib/config'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'

const CODE_LENGTH = 6

export function LoginPage() {
  const navigate = useNavigate()
  const { user, loading: sessionLoading, refresh } = useSession()
  const { config } = useAppConfig()
  const [searchParams] = useSearchParams()

  useEffect(() => {
    if (!sessionLoading && user) {
      navigate('/dashboard', { replace: true })
    }
  }, [user, sessionLoading, navigate])

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

  const [captchaToken, setCaptchaToken] = useState<string | undefined>(undefined)

  const [passkeyPending, setPasskeyPending] = useState(false)
  const [passkeyError, setPasskeyError] = useState<string | null>(null)

  const [oauthProviders, setOauthProviders] = useState<PublicOAuthProvider[]>([])
  const [oauthStarting, setOauthStarting] = useState<string | null>(null)

  useEffect(() => {
    const oauthError = searchParams.get('oauth_error')
    if (oauthError) {
      setFormError(oauthError)
      searchParams.delete('oauth_error')
      navigate('/login', { replace: true })
    }
    void (async () => {
      const res = await api.listOAuthProviders()
      if (res.ok) setOauthProviders(res.data || [])
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleOAuthSignIn(providerId: string) {
    if (oauthStarting) return
    setOauthStarting(providerId)
    setFormError(null)
    const res = await api.startOAuth(providerId, 'login')
    if (!res.ok) {
      setFormError(res.error.message ?? 'Could not start OAuth sign-in.')
      setOauthStarting(null)
      return
    }
    window.location.href = res.data.url
  }

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

    if (config.captchaProvider && config.captchaProvider !== 'none' && !captchaToken) {
      setFormError('Please complete the captcha verification.')
      return
    }

    setPending(true)
    const result = await api.login({
      email: trimmedEmail,
      name: needsName ? trimmedName : undefined,
      remember,
      captchaToken,
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

    if (result.data.directLogin) {
      await completeSignIn()
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

  async function handlePasskeySignIn(forEmail?: string) {
    if (passkeyPending) return

    const targetEmail = (forEmail ?? email).trim()
    if (!config.allowUsernamelessLogin && !targetEmail) {
      setErrors({ email: 'Enter your email address to sign in with a passkey.' })
      return
    }

    setPasskeyError(null)
    setFormError(null)
    setPasskeyPending(true)

    const options = await api.passkeyLoginOptions(targetEmail ? { email: targetEmail } : undefined)
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

  if (linking || (!sessionLoading && user)) {
    return (
      <div className="auth-stack flex flex-col gap-7">
        <AuthHeading title="Signing you in" description={user ? "Redirecting to dashboard..." : "Verifying the link from your email."} />
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

        {config.enableSecurityKeys !== false && browserSupportsWebAuthn() ? (
          <>
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-[12px] text-fg-subtle">or</span>
              <span className="h-px flex-1 bg-border" />
            </div>

            {passkeyError ? <Alert tone="danger">{passkeyError}</Alert> : null}

            <Button
              type="button"
              variant="secondary"
              className="w-full"
              disabled={verifying || passkeyPending}
              onClick={() => {
                void handlePasskeySignIn(email.trim())
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
                  Sign in with passkey instead
                </>
              )}
            </Button>
          </>
        ) : null}
      </div>
    )
  }

  return (
    <div className="auth-stack flex flex-col gap-7">
      <AuthHeading
        title={`Sign in to ${config.name || 'VPS Panel'}`}
        description="Access your servers, snapshots and network allocations."
      />

      {!config.enableRegistration ? (
        <div className="rounded-control border border-sun-500/30 bg-sun-500/10 px-3.5 py-2.5 text-[12px] text-fg-muted">
          Public registration is disabled. Only existing accounts can sign in.
        </div>
      ) : null}

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

        <CaptchaWidget
          provider={config.captchaProvider}
          siteKey={config.captchaSiteKey}
          apiUrl={config.captchaApiUrl}
          onVerify={(token) => setCaptchaToken(token)}
          onError={() => setFormError('Captcha failed to load.')}
        />

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

      {config.enableSecurityKeys !== false &&
      browserSupportsWebAuthn() &&
      config.allowUsernamelessLogin ? (
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

      {oauthProviders.length > 0 ? (
        <>
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[12px] text-fg-subtle">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          {oauthProviders.map((provider) => (
            <Button
              key={provider.id}
              type="button"
              variant="secondary"
              className="w-full"
              disabled={pending || passkeyPending || oauthStarting !== null}
              onClick={() => {
                void handleOAuthSignIn(provider.id)
              }}
            >
              {oauthStarting === provider.id ? (
                <>
                  <CircleNotch size={16} weight="bold" className="animate-spin" aria-hidden />
                  Redirecting to {provider.name}
                </>
              ) : (
                <>Continue with {provider.name}</>
              )}
            </Button>
          ))}
        </>
      ) : null}
    </div>
  )
}