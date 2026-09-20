import {
  ArrowClockwise,
  Camera,
  CaretDown,
  CaretLeft,
  CaretRight,
  CheckCircle,
  Clock,
  Clipboard,
  DownloadSimple,
  Envelope,
  Gear,
  Globe,
  Key,
  ListBullets,
  MagnifyingGlass,
  ShieldCheck,
  SignOut,
  Terminal,
  Trash,
  User,
  WarningCircle,
} from '@phosphor-icons/react'
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
import { EMAIL_PATTERN, api, type ApiActivity, type ApiEmailLog, type ApiPasskey, type PendingEmailChange } from '@/lib/api'
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

type TabKey = 'profile' | 'settings' | 'security' | 'ssh' | 'api' | 'activity' | 'emails'

const TABS: { key: TabKey; label: string; icon: typeof User }[] = [
  { key: 'profile', label: 'Profile', icon: User },
  { key: 'settings', label: 'Settings', icon: Gear },
  { key: 'security', label: 'Security & Auth', icon: ShieldCheck },
  { key: 'ssh', label: 'SSH Keys', icon: Terminal },
  { key: 'api', label: 'API Keys', icon: Key },
  { key: 'activity', label: 'Activity Log', icon: ListBullets },
  { key: 'emails', label: 'Mail List', icon: Envelope },
]

export function AccountPage() {
  const navigate = useNavigate()
  const { user, signOut, refresh } = useSession()
  const verified = !!user?.emailVerifiedAt

  const [activeTab, setActiveTab] = useState<TabKey>('profile')

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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteCode, setDeleteCode] = useState('')
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteSendingCode, setDeleteSendingCode] = useState(false)

  async function handleRequestDeletionCode() {
    setDeleteSendingCode(true)
    setDeleteError(null)
    const res = await api.requestAccountDeletion()
    setDeleteSendingCode(false)
    if (!res.ok) {
      setDeleteError(res.error.message ?? 'Could not send deletion confirmation code.')
      return
    }
  }

  function handleOpenDeleteDialog(open: boolean) {
    setDeleteDialogOpen(open)
    if (open) {
      setDeleteCode('')
      setDeleteConfirmText('')
      setDeleteError(null)
      void handleRequestDeletionCode()
    }
  }

  // Settings
  const [timezone, setTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  )
  const [exportingData, setExportingData] = useState(false)

  async function handleExportData() {
    setExportingData(true)
    const res = await api.exportData()
    setExportingData(false)
    if (res.ok) {
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `solstice-data-export-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  }

  // Activity Log
  const [activities, setActivities] = useState<ApiActivity[]>([])
  const [activityTotal, setActivityTotal] = useState(0)
  const [activityPage, setActivityPage] = useState(1)
  const [activityLoading, setActivityLoading] = useState(false)
  const [activitySearch, setActivitySearch] = useState('')

  // Mail List / Email Log
  const [emails, setEmails] = useState<ApiEmailLog[]>([])
  const [emailTotal, setEmailTotal] = useState(0)
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailSearch, setEmailSearch] = useState('')
  const [viewingEmail, setViewingEmail] = useState<ApiEmailLog | null>(null)

  const PAGE_SIZE = 10

  async function loadActivities(page = activityPage) {
    setActivityLoading(true)
    const offset = (page - 1) * PAGE_SIZE
    const res = await api.listActivities({ limit: PAGE_SIZE, offset })
    if (res.ok) {
      setActivities(res.data.activities)
      setActivityTotal(res.data.total)
    }
    setActivityLoading(false)
  }

  async function loadEmails() {
    setEmailLoading(true)
    const res = await api.listEmails({ limit: 50 })
    if (res.ok) {
      setEmails(res.data.emails)
      setEmailTotal(res.data.total)
    }
    setEmailLoading(false)
  }

  async function handleClearEmails() {
    setEmailLoading(true)
    const res = await api.clearEmails()
    if (res.ok) {
      setEmails([])
      setEmailTotal(0)
    }
    setEmailLoading(false)
  }

  async function handleDeleteEmail(id: string) {
    const res = await api.deleteEmail(id)
    if (res.ok) {
      setEmails((prev) => prev.filter((e) => e.id !== id))
      setEmailTotal((prev) => Math.max(prev - 1, 0))
    }
  }

  useEffect(() => {
    if (activeTab === 'activity') {
      void loadActivities(activityPage)
    } else if (activeTab === 'emails') {
      void loadEmails()
    }
  }, [activeTab, activityPage])

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
    if (deleteConfirmText.trim() !== 'DELETE') {
      setDeleteError('Type DELETE in uppercase to confirm.')
      return
    }
    if (!deleteCode.trim()) {
      setDeleteError('Enter the 6-digit confirmation code sent to your email.')
      return
    }
    setDeleting(true)
    setDeleteError(null)
    const res = await api.deleteAccount({
      code: deleteCode.trim(),
      confirmation: deleteConfirmText.trim(),
    })
    setDeleting(false)
    if (!res.ok) {
      setDeleteError(res.error.message ?? 'Could not delete your account.')
      return
    }
    void signOut()
    navigate('/login', { replace: true })
  }

  if (!user) return null

  return (
    <AppShell title="Account" description="Manage your profile, sign-in methods and data.">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        {/* Profile Header Card */}
        <section className="relative overflow-hidden rounded-panel border border-border bg-surface p-6 shadow-sm">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-5">
              <div className="relative size-20 shrink-0 overflow-hidden rounded-full border border-border bg-surface-2 shadow-inner">
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    className="size-full object-cover"
                  />
                ) : (
                  <span className="flex size-full items-center justify-center font-mono text-[24px] font-medium text-accent-text">
                    {initials(user.name)}
                  </span>
                )}
              </div>

              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2.5">
                  <h1 className="truncate text-xl font-bold tracking-tight text-fg">{user.name}</h1>
                  <VerifiedBadge verified={verified} />
                </div>
                <p className="truncate font-mono text-sm text-fg-subtle">{user.email}</p>
                <p className="mt-1 text-xs text-fg-muted">
                  Member since {formatDate(user.createdAt)}
                </p>
              </div>
            </div>

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
                {avatarSaving ? 'Processing…' : 'Change avatar'}
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
          </div>
          {avatarError ? <p className="mt-3 text-xs text-danger">{avatarError}</p> : null}
          {avatarSaved ? (
            <p className="mt-3 flex items-center gap-1 text-xs text-success">
              <CheckCircle size={13} weight="fill" aria-hidden />
              Avatar updated.
            </p>
          ) : null}
        </section>

        {/* Mobile Tab Dropdown */}
        <div className="sm:hidden">
          <label htmlFor="account-tab-select" className="sr-only">
            Select category
          </label>
          <div className="relative">
            <select
              id="account-tab-select"
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value as TabKey)}
              className="w-full appearance-none rounded-control border border-border bg-surface px-4 py-2.5 pr-10 text-sm font-medium text-fg shadow-sm transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            >
              {TABS.map((tab) => (
                <option key={tab.key} value={tab.key} className="bg-surface text-fg py-1.5">
                  {tab.label}
                </option>
              ))}
            </select>
            <CaretDown
              size={15}
              className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-fg-subtle"
              aria-hidden
            />
          </div>
        </div>

        {/* Desktop Tab Navigation */}
        <div className="hidden sm:flex items-center gap-1 border-b border-border pb-px overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                  isActive
                    ? 'border-accent text-fg font-semibold'
                    : 'border-transparent text-fg-muted hover:text-fg hover:border-border-strong'
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Tab Content */}
        {activeTab === 'profile' && (
          <div className="space-y-6">
            <Panel title="Personal Information">
              <div className="flex flex-col gap-5 px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] text-fg-subtle">Email address</span>
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
                    {nameSaving ? 'Saving…' : 'Save changes'}
                  </Button>
                </div>
              </div>
            </Panel>

            <Panel title="Danger zone">
              <div className="px-5 py-4">
                <p className="mb-3 text-[13px] leading-relaxed text-fg-muted">
                  Permanently deletes your account and all its data. This cannot be undone.
                </p>

                <Dialog open={deleteDialogOpen} onOpenChange={handleOpenDeleteDialog}>
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

                    {deleteError ? (
                      <div className="mt-4">
                        <Alert tone="danger">{deleteError}</Alert>
                      </div>
                    ) : null}

                    <div className="mt-4 rounded-control border border-border bg-surface-2 p-3 text-xs">
                      {deleteSendingCode ? (
                        <span className="text-fg-subtle">Sending confirmation code to your email...</span>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-fg">
                            Confirmation code sent to <strong className="font-mono">{user.email}</strong>.
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleRequestDeletionCode()}
                            disabled={deleteSendingCode}
                            className="shrink-0 font-semibold text-accent hover:underline disabled:opacity-50"
                          >
                            Resend code
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 space-y-3">
                      <TextField
                        id="delete-code"
                        label="6-digit email confirmation code"
                        autoComplete="one-time-code"
                        placeholder="123456"
                        value={deleteCode}
                        onChange={(event) => setDeleteCode(event.target.value.trim())}
                        disabled={deleting}
                      />

                      <TextField
                        id="delete-confirm"
                        label="Type DELETE in capital letters to confirm"
                        autoComplete="off"
                        placeholder="DELETE"
                        value={deleteConfirmText}
                        onChange={(event) => setDeleteConfirmText(event.target.value)}
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
                          deleteConfirmText !== 'DELETE' ||
                          deleteCode.length !== 6
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
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <Panel title="Display Preferences">
              <div className="flex flex-col gap-4 p-5">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Clock size={16} className="text-fg-subtle" />
                    <span className="text-xs font-semibold text-fg">Timezone</span>
                  </div>
                  <p className="text-xs text-fg-muted">
                    Dates and timestamps shown in the console will format according to your preference.
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="max-w-md w-full rounded-control border border-field-border bg-field-bg px-3 py-2 text-xs text-fg focus:border-accent focus:outline-none"
                  >
                    {Intl.supportedValuesOf('timeZone').map((tz) => (
                      <option key={tz} value={tz}>
                        {tz.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>

                  <span className="text-xs text-fg-subtle">
                    Preview: {new Date().toLocaleTimeString('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            </Panel>

            <Panel title="Privacy & Personal Data">
              <div className="flex flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <h4 className="text-xs font-semibold text-fg">Request Your Data</h4>
                    <p className="text-xs text-fg-muted max-w-md">
                      Download a JSON package of all stored personal records including account details, activity audits, email logs, and authentication credentials.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={exportingData}
                    onClick={() => void handleExportData()}
                  >
                    <DownloadSimple size={14} className={exportingData ? 'animate-spin' : ''} />
                    {exportingData ? 'Generating...' : 'Export Data'}
                  </Button>
                </div>
              </div>
            </Panel>

            <Panel title="Session Management">
              <div className="flex items-center justify-between p-5">
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-fg">Current Session</h4>
                  <p className="text-xs text-fg-muted">Sign out of this browser immediately.</p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void signOut()
                    navigate('/login', { replace: true })
                  }}
                >
                  <SignOut size={14} />
                  Logout
                </Button>
              </div>
            </Panel>
          </div>
        )}

        {/* Security & Auth Tab */}
        {activeTab === 'security' && (
          <div className="space-y-6">
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
          </div>
        )}

        {/* SSH Keys Tab */}
        {activeTab === 'ssh' && (
          <Panel title="SSH Keys">
            <div className="flex flex-col gap-4 px-5 py-8 text-center sm:py-12">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-surface-2 text-fg-subtle">
                <Terminal size={24} />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-fg">Public SSH Keys</h3>
                <p className="text-xs text-fg-muted max-w-sm mx-auto">
                  Add public SSH keys to automatically inject into newly provisioned Incus instances
                  and containers.
                </p>
              </div>
              <div className="pt-2">
                <Button size="sm" variant="secondary" disabled>
                  Add SSH Key (Coming in Incus Phase)
                </Button>
              </div>
            </div>
          </Panel>
        )}

        {/* API Keys Tab */}
        {activeTab === 'api' && (
          <Panel title="API Tokens">
            <div className="flex flex-col gap-4 px-5 py-8 text-center sm:py-12">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-surface-2 text-fg-subtle">
                <Key size={24} />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-fg">Personal Access Tokens</h3>
                <p className="text-xs text-fg-muted max-w-sm mx-auto">
                  Authenticate programmatic CLI and SDK requests to the Solstice API without interactive login.
                </p>
              </div>
              <div className="pt-2">
                <Button size="sm" variant="secondary" disabled>
                  Generate Token (Coming soon)
                </Button>
              </div>
            </div>
          </Panel>
        )}

        {/* Activity Log Tab */}
        {activeTab === 'activity' && (
          <div className="space-y-4">
            <Panel
              title="Activity Log"
              action={
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={activityLoading}
                  onClick={() => void loadActivities(activityPage)}
                >
                  <ArrowClockwise size={14} className={activityLoading ? 'animate-spin' : ''} aria-hidden />
                  Refresh
                </Button>
              }
            >
              <div className="flex flex-col gap-4 p-5">
                <p className="text-xs text-fg-muted">View your recent account and authentication activity.</p>

                <div className="relative">
                  <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
                  <input
                    type="text"
                    placeholder="Search activity..."
                    value={activitySearch}
                    onChange={(e) => setActivitySearch(e.target.value)}
                    className="w-full rounded-control border border-field-border bg-field-bg py-2 pl-9 pr-4 text-xs text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>

                {(() => {
                  const filtered = activities.filter((a) => {
                    const q = activitySearch.toLowerCase()
                    return a.action.toLowerCase().includes(q) || a.details.toLowerCase().includes(q) || (a.ipAddress && a.ipAddress.includes(q))
                  })

                  if (activityLoading && activities.length === 0) {
                    return <div className="py-12 text-center text-xs text-fg-subtle">Loading activity log...</div>
                  }

                  if (filtered.length === 0) {
                    return <div className="py-12 text-center text-xs text-fg-subtle">No activity records found.</div>
                  }

                  const totalPages = Math.ceil(activityTotal / PAGE_SIZE) || 1

                  return (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between text-xs text-fg-subtle">
                        <span>
                          Showing {Math.min((activityPage - 1) * PAGE_SIZE + 1, activityTotal)} to{' '}
                          {Math.min(activityPage * PAGE_SIZE, activityTotal)} of {activityTotal} activities
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={activityPage <= 1 || activityLoading}
                            onClick={() => setActivityPage((p) => Math.max(p - 1, 1))}
                          >
                            <CaretLeft size={14} />
                            Previous
                          </Button>
                          <span className="font-mono text-xs text-fg">
                            {activityPage} / {totalPages}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={activityPage >= totalPages || activityLoading}
                            onClick={() => setActivityPage((p) => Math.min(p + 1, totalPages))}
                          >
                            Next
                            <CaretRight size={14} />
                          </Button>
                        </div>
                      </div>

                      <div className="divide-y divide-border/60 rounded-control border border-border">
                        {filtered.map((item) => (
                          <div key={item.id} className="flex items-center justify-between gap-4 p-3.5 hover:bg-surface-2/40 transition-colors">
                            <div className="flex items-start gap-3 min-w-0">
                              <div className="mt-1 flex size-2.5 shrink-0 rounded-full bg-accent" />
                              <div className="min-w-0 space-y-0.5">
                                <p className="font-mono text-xs font-semibold text-fg">{item.action}</p>
                                <p className="text-xs text-fg-muted">{item.details}</p>
                                {item.ipAddress ? (
                                  <div className="flex items-center gap-1 font-mono text-[11px] text-fg-subtle">
                                    <Globe size={11} />
                                    <span>{item.ipAddress}</span>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                            <span className="shrink-0 text-xs text-fg-subtle">{formatDate(item.createdAt)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </div>
            </Panel>
          </div>
        )}

        {/* Mail List Tab */}
        {activeTab === 'emails' && (
          <div className="space-y-4">
            <Panel
              title="Mail List"
              action={
                <div className="flex items-center gap-2">
                  {emails.length > 0 ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={emailLoading}
                      onClick={() => void handleClearEmails()}
                      className="text-danger hover:text-danger"
                    >
                      <Trash size={14} />
                      Clear all
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={emailLoading}
                    onClick={() => void loadEmails()}
                  >
                    <ArrowClockwise size={14} className={emailLoading ? 'animate-spin' : ''} aria-hidden />
                    Refresh
                  </Button>
                </div>
              }
            >
              <div className="flex flex-col gap-4 p-5">
                <p className="text-xs text-fg-muted">View emails sent by the system to your address.</p>

                <div className="relative">
                  <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
                  <input
                    type="text"
                    placeholder="Search emails..."
                    value={emailSearch}
                    onChange={(e) => setEmailSearch(e.target.value)}
                    className="w-full rounded-control border border-field-border bg-field-bg py-2 pl-9 pr-4 text-xs text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>

                {(() => {
                  const filtered = emails.filter((m) => {
                    const q = emailSearch.toLowerCase()
                    return m.subject.toLowerCase().includes(q) || m.bodyText.toLowerCase().includes(q) || m.recipient.toLowerCase().includes(q)
                  })

                  if (emailLoading && emails.length === 0) {
                    return <div className="py-12 text-center text-xs text-fg-subtle">Loading sent emails...</div>
                  }

                  if (filtered.length === 0) {
                    return <div className="py-12 text-center text-xs text-fg-subtle">No emails found.</div>
                  }

                  return (
                    <div className="space-y-4">
                      <div className="text-xs text-fg-subtle">
                        Showing {filtered.length} of {emailTotal} emails
                      </div>

                      <div className="divide-y divide-border/60 rounded-control border border-border">
                        {filtered.map((email) => (
                          <div key={email.id} className="flex items-center justify-between gap-4 p-4 hover:bg-surface-2/40 transition-colors">
                            <div className="space-y-1.5 min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-semibold text-fg truncate">{email.subject}</h4>
                                <span className="rounded-full bg-success-surface px-2 py-0.5 font-mono text-[10px] text-success capitalize">
                                  {email.status}
                                </span>
                              </div>
                              <p className="text-xs text-fg-subtle">To: {email.recipient}</p>
                              <p className="text-xs text-fg-muted line-clamp-1">{email.bodyText}</p>
                              <p className="text-[11px] text-fg-subtle">{formatDate(email.createdAt)}</p>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => setViewingEmail(email)}
                              >
                                <Envelope size={14} />
                                View Full Email
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void handleDeleteEmail(email.id)}
                                title="Delete email"
                                className="text-fg-subtle hover:text-danger"
                              >
                                <Trash size={14} />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </div>
            </Panel>

            {/* View Full Email Dialog */}
            <Dialog open={!!viewingEmail} onOpenChange={(open) => !open && setViewingEmail(null)}>
              <DialogContent className="max-w-2xl">
                <DialogTitle>{viewingEmail?.subject}</DialogTitle>
                <DialogDescription>
                  Sent to <span className="font-mono text-fg">{viewingEmail?.recipient}</span> on{' '}
                  {viewingEmail ? formatDate(viewingEmail.createdAt) : ''}
                </DialogDescription>

                <div className="mt-4 max-h-[60vh] overflow-y-auto rounded-control border border-border bg-surface-2 p-4 font-mono text-xs whitespace-pre-wrap text-fg">
                  {viewingEmail?.bodyText}
                </div>

                <div className="mt-5 flex justify-end">
                  <DialogClose asChild>
                    <Button variant="secondary" size="sm">
                      Close
                    </Button>
                  </DialogClose>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* Email Change Modal */}
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
      </div>
    </AppShell>
  )
}