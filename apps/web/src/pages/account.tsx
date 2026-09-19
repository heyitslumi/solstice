import { Camera, CheckCircle, Clipboard, Trash, WarningCircle } from '@phosphor-icons/react'
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { AppShell } from '@/components/app-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { TextField } from '@/components/ui/field'
import { EMAIL_PATTERN, api, type ApiPasskey, type PendingEmailChange } from '@/lib/api'
import { useSession } from '@/lib/session'

const CHANGE_CODE_LENGTH = 6

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase()
}

function Panel({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-panel border border-border bg-surface">
      <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
        <h2 className="text-[14px] font-semibold text-fg">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function VerifiedBadge({ verified }: { verified: boolean }) {
  if (verified) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success-surface px-2 py-0.5 font-mono text-[11px] text-success">
        <CheckCircle size={11} weight="fill" aria-hidden />
        Confirmed
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-danger-surface px-2 py-0.5 font-mono text-[11px] text-danger">
      <WarningCircle size={11} weight="fill" aria-hidden />
      Not confirmed
    </span>
  )
}

interface SessionRow {
  id: string
  isCurrent: boolean
  userAgent: string | null
  createdAt: string
  expiresAt: string
}

export function AccountPage() {
  const navigate = useNavigate()
  const { user, signOut, refresh } = useSession()
  const verified = !!user?.emailVerifiedAt

  // Profile
  const [name, setName] = useState(user?.name ?? '')
  const [nameError, setNameError] = useState<string | undefined>(undefined)
  const [nameSaving, setNameSaving] = useState(false)
  const [nameSaved, setNameSaved] = useState(false)

  // Avatar
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [avatarSaving, setAvatarSaving] = useState(false)
  const [avatarSaved, setAvatarSaved] = useState(false)

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    if (!file.type.startsWith('image/')) {
      setAvatarError('Please select an image file (PNG, JPG, WebP, GIF).')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Image must be under 5 MB.')
      return
    }

    setAvatarError(null)
    setAvatarSaving(true)
    setAvatarSaved(false)

    const reader = new FileReader()
    reader.onerror = () => {
      setAvatarError('Could not read file.')
      setAvatarSaving(false)
    }
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => {
        setAvatarError('Could not process image.')
        setAvatarSaving(false)
      }
      img.onload = async () => {
        try {
          const canvas = document.createElement('canvas')
          const size = 256
          canvas.width = size
          canvas.height = size
          const ctx = canvas.getContext('2d')
          if (!ctx) throw new Error('Canvas not supported')

          // ponytail: native canvas 256x256 square crop to webp. Upgrade to interactive pan/zoom modal if requested.
          const minDim = Math.min(img.width, img.height)
          const sx = (img.width - minDim) / 2
          const sy = (img.height - minDim) / 2
          ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size)

          const dataUrl = canvas.toDataURL('image/webp', 0.85)
          const result = await api.accountUpdate({ avatarUrl: dataUrl })
          if (!result.ok) {
            setAvatarError(result.error.message ?? 'Could not save profile picture.')
            return
          }
          await refresh()
          setAvatarSaved(true)
        } catch {
          setAvatarError('Failed to resize image.')
        } finally {
          setAvatarSaving(false)
        }
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  }

  async function handleRemoveAvatar() {
    setAvatarError(null)
    setAvatarSaving(true)
    setAvatarSaved(false)
    try {
      const result = await api.accountUpdate({ avatarUrl: null })
      if (!result.ok) {
        setAvatarError(result.error.message ?? 'Could not remove profile picture.')
        return
      }
      await refresh()
      setAvatarSaved(true)
    } catch {
      setAvatarError('Could not remove profile picture.')
    } finally {
      setAvatarSaving(false)
    }
  }

  // Sessions
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  // Email change
  const [pendingChange, setPendingChange] = useState<PendingEmailChange | null>(null)
  const [changeOpen, setChangeOpen] = useState(false)
  const [changeStep, setChangeStep] = useState<'request' | 'verify'>('request')
  const [changeEmail, setChangeEmail] = useState('')
  const [changeErrors, setChangeErrors] = useState<Record<string, string>>({})
  const [changeFormError, setChangeFormError] = useState<string | null>(null)
  const [changeCode, setChangeCode] = useState('')
  const [changeCodeError, setChangeCodeError] = useState<string | undefined>(undefined)
  const [changeSaving, setChangeSaving] = useState(false)
  const [changeSaved, setChangeSaved] = useState(false)
  const [cancellingChange, setCancellingChange] = useState(false)

  // Passkeys
  const [passkeys, setPasskeys] = useState<ApiPasskey[]>([])
  const [passkeysLoading, setPasskeysLoading] = useState(true)
  const [passkeyName, setPasskeyName] = useState('')
  const [passkeyError, setPasskeyError] = useState<string | undefined>(undefined)
  const [passkeyNotice, setPasskeyNotice] = useState<string | null>(null)
  const [passkeySaving, setPasskeySaving] = useState(false)
  const [removingPasskeyId, setRemovingPasskeyId] = useState<string | null>(null)

  // Delete
  const [deleting, setDeleting] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  useEffect(() => {
    if (!user) return

    async function load() {
      const [sessionsResult, pendingResult, passkeysResult] = await Promise.all([
        api.listSessions(),
        api.pendingEmailChange(),
        api.listPasskeys(),
      ])

      if (sessionsResult.ok) {
        setSessions(sessionsResult.data.sessions.filter((s) => !s.isCurrent))
      }
      if (pendingResult.ok) {
        setPendingChange(pendingResult.data.pending)
      }
      if (passkeysResult.ok) {
        setPasskeys(passkeysResult.data.passkeys)
      }
      setSessionsLoading(false)
      setPasskeysLoading(false)
    }

    void load()
  }, [user])

  async function handleNameSave() {
    setNameError(undefined)
    setNameSaved(false)
    if (!name.trim()) {
      setNameError('Enter your name.')
      return
    }

    setNameSaving(true)
    const result = await api.accountUpdate({ name: name.trim() })
    setNameSaving(false)

    if (!result.ok) {
      setNameError(result.error.message ?? 'Could not update your name.')
      return
    }

    setNameSaved(true)
    await refresh()
  }

  async function handleRevoke(sessionId: string) {
    setRevokingId(sessionId)
    await api.revokeSession(sessionId)
    setSessions((prev) => prev.filter((s) => s.id !== sessionId))
    setRevokingId(null)
  }

  function resetChangeForm() {
    setChangeStep('request')
    setChangeEmail('')
    setChangeErrors({})
    setChangeFormError(null)
    setChangeCode('')
    setChangeCodeError(undefined)
  }

  async function handleChangeRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (changeSaving) return

    setChangeErrors({})
    setChangeFormError(null)
    setChangeSaved(false)

    const nextErrors: Record<string, string> = {}
    const nextEmail = changeEmail.trim()
    if (!nextEmail) nextErrors.email = 'Enter the new email address.'
    else if (!EMAIL_PATTERN.test(nextEmail)) nextErrors.email = 'Enter a valid email address.'

    if (Object.keys(nextErrors).length > 0) {
      setChangeErrors(nextErrors)
      return
    }

    setChangeSaving(true)
    const result = await api.changeEmail({ email: nextEmail })
    setChangeSaving(false)

    if (!result.ok) {
      setChangeErrors(result.error.fieldErrors ?? {})
      setChangeFormError(result.error.message ?? null)
      return
    }

    setPendingChange(result.data.pending)
    setChangeStep('verify')
    setChangeCode('')
    setChangeCodeError(undefined)
  }

  async function handleChangeVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (changeSaving) return

    if (changeCode.length !== CHANGE_CODE_LENGTH) {
      setChangeCodeError(`Enter the ${CHANGE_CODE_LENGTH}-digit code from your email.`)
      return
    }

    setChangeCodeError(undefined)
    setChangeFormError(null)
    setChangeSaving(true)
    const result = await api.changeEmailVerify({ code: changeCode })
    setChangeSaving(false)

    if (!result.ok) {
      setChangeCodeError(
        result.error.fieldErrors?.email ?? result.error.message ?? 'That code is not correct.',
      )
      return
    }

    setPendingChange(null)
    setChangeSaved(true)
    setChangeOpen(false)
    resetChangeForm()
    await refresh()
  }

  async function handleCancelChange() {
    setCancellingChange(true)
    await api.cancelEmailChange()
    setCancellingChange(false)
    setPendingChange(null)
    setChangeSaved(false)
    resetChangeForm()
  }

  async function loadPasskeys() {
    const result = await api.listPasskeys()
    if (result.ok) setPasskeys(result.data.passkeys)
    setPasskeysLoading(false)
  }

  async function handleAddPasskey() {
    setPasskeyError(undefined)
    setPasskeyNotice(null)

    setPasskeySaving(true)

    const options = await api.passkeyRegisterOptions()
    if (!options.ok) {
      setPasskeySaving(false)
      setPasskeyError(options.error.message)
      return
    }

    try {
      const attestation = await startRegistration({ optionsJSON: options.data.options })
      const result = await api.passkeyRegisterVerify({
        response: attestation,
        name: passkeyName.trim() || 'Passkey',
      })

      if (!result.ok) {
        setPasskeyError(result.error.message ?? 'Could not register that passkey.')
        return
      }

      setPasskeyNotice('Passkey added.')
      setPasskeyName('')
      await loadPasskeys()
    } catch (error) {
      /*
       * NotAllowedError is what a dismissed prompt looks like, and it is the common
       * case, so it stays quiet. Anything else is a genuine failure and is worth a
       * console entry, because the user only ever sees the neutral line below.
       */
      if (!(error instanceof Error) || error.name !== 'NotAllowedError') {
        console.error('[passkey] registration failed', error)
      }
      setPasskeyError('Adding a passkey was not completed.')
    } finally {
      setPasskeySaving(false)
    }
  }

  async function handleRemovePasskey(id: string) {
    setPasskeyError(undefined)
    setPasskeyNotice(null)

    setRemovingPasskeyId(id)
    const result = await api.removePasskey({ id })
    setRemovingPasskeyId(null)

    if (!result.ok) {
      setPasskeyError(result.error.message)
      return
    }

    setPasskeyNotice('Passkey removed.')
    await loadPasskeys()
  }

  async function handleDelete() {
    setDeleting(true)
    await api.deleteAccount()
    void signOut()
    navigate('/login', { replace: true })
  }

  if (!user) return null

  return (
    <AppShell title="Account" description="Manage your profile, sign-in methods and data.">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex flex-col gap-5">
          <Panel title="Profile">
            <div className="flex flex-col gap-5 px-5 py-4">
              <div className="flex flex-col gap-3">
                <span className="text-[13px] font-medium text-fg-muted">Profile picture</span>
                <div className="flex flex-wrap items-center gap-4 sm:flex-nowrap">
                  <div className="relative size-16 shrink-0 overflow-hidden rounded-full border border-border bg-surface-2">
                    {user.avatarUrl ? (
                      <img
                        src={user.avatarUrl}
                        alt={user.name}
                        className="size-full object-cover"
                      />
                    ) : (
                      <span className="flex size-full items-center justify-center font-mono text-[18px] font-medium text-accent-text">
                        {initials(user.name)}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="sr-only"
                        onChange={handleFileSelect}
                        disabled={avatarSaving}
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={avatarSaving}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Camera size={14} aria-hidden />
                        {avatarSaving ? 'Processing…' : 'Upload photo'}
                      </Button>
                      {user.avatarUrl ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={avatarSaving}
                          onClick={handleRemoveAvatar}
                          className="text-danger hover:bg-danger-surface hover:text-danger"
                        >
                          <Trash size={14} aria-hidden />
                          Remove
                        </Button>
                      ) : null}
                    </div>
                    <span className="text-[12px] text-fg-subtle">
                      JPG, PNG, WebP or GIF up to 5 MB. Center-cropped to a square automatically.
                    </span>
                    {avatarError ? (
                      <span className="text-[12px] text-danger">{avatarError}</span>
                    ) : null}
                    {avatarSaved ? (
                      <span className="flex items-center gap-1 text-[12px] text-success">
                        <CheckCircle size={13} weight="fill" aria-hidden />
                        Photo updated.
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <hr className="border-border/70" />

              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] text-fg-subtle">Email</span>
                    <VerifiedBadge verified={verified} />
                  </div>
                  <span className="truncate font-mono text-[13px] text-fg">{user.email}</span>

                  {pendingChange ? (
                    <span className="text-[12px] leading-relaxed text-fg-muted">
                      Waiting on a code sent to{' '}
                      <span className="font-mono text-fg">{pendingChange.email}</span>.
                    </span>
                  ) : null}

                  {changeSaved ? (
                    <span className="flex items-center gap-1 text-[13px] text-success">
                      <CheckCircle size={14} weight="fill" aria-hidden />
                      Email updated.
                    </span>
                  ) : null}
                </div>

                {pendingChange ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={cancellingChange}
                    onClick={() => {
                      void handleCancelChange()
                    }}
                  >
                    {cancellingChange ? 'Cancelling…' : 'Cancel change'}
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => setChangeOpen(true)}>
                    Change
                  </Button>
                )}
              </div>

              <hr className="border-border/70" />

              <label className="text-[13px] font-medium text-fg-muted">Display name</label>
              <TextField
                id="account-name"
                name="name"
                label=""
                value={name}
                onChange={(event) => {
                  setName(event.target.value)
                  setNameError(undefined)
                  setNameSaved(false)
                }}
                error={nameError}
                disabled={nameSaving}
              />

              {nameSaved ? (
                <span className="flex items-center gap-1 text-[13px] text-success">
                  <CheckCircle size={14} weight="fill" aria-hidden />
                  Name updated.
                </span>
              ) : null}

              <div>
                <Button
                  size="sm"
                  disabled={nameSaving || name === user.name}
                  onClick={handleNameSave}
                >
                  {nameSaving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>
          </Panel>

          <Dialog
            open={changeOpen}
            onOpenChange={(open) => {
              setChangeOpen(open)
              if (!open) resetChangeForm()
            }}
          >
            <DialogContent>
              {changeStep === 'request' ? (
                <>
                  <DialogTitle>Change email address</DialogTitle>
                  <DialogDescription>
                    We will send a code to the new address. Until that code is entered, your account
                    keeps signing in with the current one.
                  </DialogDescription>

                  <form
                    onSubmit={handleChangeRequest}
                    className="mt-5 flex flex-col gap-4"
                    noValidate
                  >
                    {changeFormError ? <Alert tone="danger">{changeFormError}</Alert> : null}

                    <TextField
                      id="change-email-new"
                      name="email"
                      type="email"
                      label="New email address"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={changeEmail}
                      onChange={(event) => {
                        setChangeEmail(event.target.value)
                        setChangeErrors((errors) => ({ ...errors, email: '' }))
                      }}
                      error={changeErrors.email}
                      disabled={changeSaving}
                    />

                    <div className="flex justify-end gap-2">
                      <DialogClose asChild>
                        <Button type="button" variant="ghost" size="sm" disabled={changeSaving}>
                          Cancel
                        </Button>
                      </DialogClose>
                      <Button type="submit" size="sm" disabled={changeSaving}>
                        {changeSaving ? 'Sending…' : 'Send code'}
                      </Button>
                    </div>
                  </form>
                </>
              ) : (
                <>
                  <DialogTitle>Enter the code</DialogTitle>
                  <DialogDescription>
                    We sent a {CHANGE_CODE_LENGTH}-digit code to{' '}
                    {pendingChange?.email ?? changeEmail}. Enter it to finish the change.
                  </DialogDescription>

                  <form
                    onSubmit={handleChangeVerify}
                    className="mt-5 flex flex-col gap-4"
                    noValidate
                  >
                    {changeFormError ? <Alert tone="danger">{changeFormError}</Alert> : null}

                    <TextField
                      id="change-email-code"
                      name="code"
                      label="Confirmation code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={CHANGE_CODE_LENGTH}
                      autoFocus
                      placeholder={'0'.repeat(CHANGE_CODE_LENGTH)}
                      value={changeCode}
                      onChange={(event) => {
                        setChangeCode(
                          event.target.value.replace(/\D/g, '').slice(0, CHANGE_CODE_LENGTH),
                        )
                        setChangeCodeError(undefined)
                      }}
                      error={changeCodeError}
                      disabled={changeSaving}
                      className="h-12 pl-[0.35em] text-center font-mono text-[1.25rem] tracking-[0.35em]"
                    />

                    <div className="flex justify-between gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={changeSaving}
                        onClick={() => setChangeStep('request')}
                      >
                        Back
                      </Button>
                      <Button type="submit" size="sm" disabled={changeSaving}>
                        {changeSaving ? 'Confirming…' : 'Confirm change'}
                      </Button>
                    </div>
                  </form>
                </>
              )}
            </DialogContent>
          </Dialog>

          <Panel
            title="Passkeys"
            action={
              passkeys.length > 0 ? (
                <span className="font-mono text-[11px] text-fg-subtle">
                  {passkeys.length} registered
                </span>
              ) : undefined
            }
          >
            <div className="flex flex-col gap-4 px-5 py-4">
              <p className="text-[13px] leading-relaxed text-fg-muted">
                Sign in without a password using your fingerprint, face, security key or password
                manager. A passkey already proves it is you, so no code is asked for after it.
              </p>

              {passkeyNotice ? <Alert tone="success">{passkeyNotice}</Alert> : null}
              {passkeyError ? <Alert tone="danger">{passkeyError}</Alert> : null}

              {passkeysLoading ? null : passkeys.length > 0 ? (
                <ul className="flex flex-col divide-y divide-border/70 rounded-control border border-border">
                  {passkeys.map((passkey) => (
                    <li
                      key={passkey.id}
                      className="flex items-center justify-between gap-4 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px] text-fg">{passkey.name}</p>
                        <p className="text-[12px] text-fg-subtle">
                          Added {formatDate(passkey.createdAt)}
                          {passkey.backedUp ? ' · synced across devices' : ''}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={removingPasskeyId === passkey.id || passkeySaving}
                        onClick={() => {
                          void handleRemovePasskey(passkey.id)
                        }}
                      >
                        {removingPasskeyId === passkey.id ? 'Removing…' : 'Remove'}
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}

              <TextField
                id="passkey-name"
                name="passkeyName"
                label="Name (optional)"
                placeholder="Laptop, YubiKey…"
                value={passkeyName}
                onChange={(event) => setPasskeyName(event.target.value)}
                disabled={passkeySaving}
              />

              <div>
                <Button
                  size="sm"
                  disabled={passkeySaving || !browserSupportsWebAuthn()}
                  onClick={() => {
                    void handleAddPasskey()
                  }}
                >
                  {passkeySaving ? 'Waiting for your device…' : 'Add a passkey'}
                </Button>
              </div>
            </div>
          </Panel>

          <Panel
            title="Active sessions"
            action={
              <Button
                size="sm"
                variant="secondary"
                disabled={sessionsLoading}
                onClick={async () => {
                  setSessionsLoading(true)
                  const result = await api.listSessions()
                  if (result.ok) {
                    setSessions(result.data.sessions.filter((s) => !s.isCurrent))
                  }
                  setSessionsLoading(false)
                }}
              >
                <Clipboard size={14} aria-hidden />
                Refresh
              </Button>
            }
          >
            {sessionsLoading ? (
              <div className="px-5 py-8 text-center text-[13px] text-fg-subtle">
                Loading sessions…
              </div>
            ) : sessions.length === 0 ? (
              <div className="px-5 py-8 text-center text-[13px] text-fg-subtle">
                No other active sessions.
              </div>
            ) : (
              <ul className="flex flex-col">
                {sessions.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-3 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] text-fg">
                        {s.userAgent ?? 'Unknown device'}
                      </p>
                      <p className="font-mono text-[11px] text-fg-subtle">
                        Started {formatDate(s.createdAt)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={revokingId === s.id}
                      onClick={() => {
                        void handleRevoke(s.id)
                      }}
                    >
                      {revokingId === s.id ? '…' : 'Revoke'}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Danger zone">
            <div className="px-5 py-4">
              <p className="mb-3 text-[13px] leading-relaxed text-fg-muted">
                Permanently deletes your account and all its data. This cannot be undone.
              </p>

              <Dialog
                onOpenChange={(open) => {
                  if (!open) setDeleteConfirmText('')
                }}
              >
                <DialogTrigger asChild>
                  <Button variant="secondary">
                    <Trash size={14} aria-hidden />
                    Delete account
                  </Button>
                </DialogTrigger>

                <DialogContent>
                  <DialogTitle>Delete your account?</DialogTitle>
                  <DialogDescription>
                    This removes your account and everything attached to it. Nothing can be
                    recovered afterwards.
                  </DialogDescription>

                  <ul className="mt-4 flex list-disc flex-col gap-1.5 pl-4 text-[13px] text-fg-muted">
                    <li>Your servers, snapshots and network allocations</li>
                    <li>Every active session, on all devices</li>
                    <li>Your registered passkeys</li>
                  </ul>

                  <div className="mt-5">
                    <TextField
                      id="delete-confirm"
                      label="Type your email address to confirm"
                      autoComplete="off"
                      placeholder={user.email}
                      value={deleteConfirmText}
                      onChange={(event) => {
                        setDeleteConfirmText(event.target.value)
                      }}
                      disabled={deleting}
                    />
                  </div>

                  <div className="mt-5 flex justify-end gap-3">
                    <DialogClose asChild>
                      <Button variant="secondary" disabled={deleting}>
                        Cancel
                      </Button>
                    </DialogClose>

                    <Button
                      variant="danger"
                      disabled={
                        deleting ||
                        deleteConfirmText.trim().toLowerCase() !== user.email.toLowerCase()
                      }
                      onClick={() => {
                        void handleDelete()
                      }}
                    >
                      {deleting ? 'Deleting…' : 'Delete account'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  )
}