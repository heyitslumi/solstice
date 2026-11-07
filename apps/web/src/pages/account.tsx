import {
  ArrowClockwise,
  Camera,
  CaretDown,
  CaretLeft,
  CaretRight,
  CheckCircle,
  Clock,
  Clipboard,
  Copy,
  DownloadSimple,
  Envelope,
  Gear,
  Globe,
  Key,
  ListBullets,
  MagnifyingGlass,
  PaintBrush,
  Plus,
  ShieldCheck,
  SignOut,
  Terminal,
  Trash,
  User,
  WarningCircle,
} from '@phosphor-icons/react'
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

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
import { EMAIL_PATTERN, api, type ApiActivity, type ApiEmailLog, type ApiPasskey, type ApiSshKey, type OAuthLink, type PendingEmailChange, type PublicOAuthProvider } from '@/lib/api'
import { useAppConfig } from '@/lib/config'
import { generateSshKeyPair, type GeneratedKeyType } from '@/lib/ssh-generate'
import { useSession } from '@/lib/session'
import { THEME_PRESETS } from '@/lib/theme-utils'
import { cn } from '@/lib/utils'

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
  const { config } = useAppConfig()
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
          const uploadRes = await api.upload({ dataUrl, folder: 'avatars' })
          const targetUrl = uploadRes.ok ? uploadRes.data.url : dataUrl
          const result = await api.accountUpdate({ avatarUrl: targetUrl })
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

  // Appearance (synced from the account whenever it loads)
  const [themeMode, setThemeMode] = useState('system')
  const [themePreset, setThemePreset] = useState('')
  const [themeSaving, setThemeSaving] = useState(false)
  const [themeSaved, setThemeSaved] = useState(false)
  const [themeError, setThemeError] = useState<string | null>(null)

  useEffect(() => {
    if (user) {
      setThemeMode(user.themeMode ?? 'system')
      setThemePreset(user.themePreset ?? '')
    }
  }, [user?.id])

  async function handleExportData() {
    setExportingData(true)
    const res = await api.exportData()
    setExportingData(false)
    if (res.ok) {
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `panel-data-export-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  }

  async function handleSaveTheme() {
    setThemeSaving(true)
    setThemeError(null)
    setThemeSaved(false)
    const res = await api.accountUpdate({ themeMode, themePreset })
    setThemeSaving(false)
    if (res.ok) {
      setThemeSaved(true)
      await refresh()
    } else {
      setThemeError(res.error.message ?? 'Could not save appearance settings.')
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

  // API keys
  interface ApiKeyRow {
    id: string
    name: string
    prefix: string
    lastUsedAt: string | null
    expiresAt: string | null
    createdAt: string
  }
  const [apiKeys, setApiKeys] = useState<ApiKeyRow[]>([])
  const [apiLoading, setApiLoading] = useState(false)
  const [apiDialogOpen, setApiDialogOpen] = useState(false)
  const [apiKeyName, setApiKeyName] = useState('')
  const [apiKeyExpiry, setApiKeyExpiry] = useState('never')
  const [apiError, setApiError] = useState<string | null>(null)
  const [apiSubmitting, setApiSubmitting] = useState(false)
  const [apiNewToken, setApiNewToken] = useState<string | null>(null)
  const [apiRevoking, setApiRevoking] = useState<string | null>(null)

  // SSH Keys
  const [sshKeys, setSshKeys] = useState<ApiSshKey[]>([])
  const [sshLoading, setSshLoading] = useState(false)
  const [sshDialogOpen, setSshDialogOpen] = useState(false)
  const [sshKeyName, setSshKeyName] = useState('')
  const [sshPublicKey, setSshPublicKey] = useState('')
  const [sshError, setSshError] = useState<string | null>(null)
  const [sshSubmitting, setSshSubmitting] = useState(false)
  // Key pair generation (client-side; private key never leaves the browser)
  const [genType, setGenType] = useState<GeneratedKeyType>('ed25519')
  const [genSize, setGenSize] = useState<number>(2048)
  const [genPrivateKey, setGenPrivateKey] = useState<string | null>(null)
  const [genFingerprint, setGenFingerprint] = useState<string | null>(null)
  const [genGenerating, setGenGenerating] = useState(false)
  const [genCopied, setGenCopied] = useState(false)

  // OAuth links
  const [searchParams, setSearchParams] = useSearchParams()
  const [oauthLinks, setOauthLinks] = useState<OAuthLink[]>([])
  const [oauthLinksLoading, setOauthLinksLoading] = useState(true)
  const [oauthProviders, setOauthProviders] = useState<PublicOAuthProvider[]>([])
  const [oauthProviderId, setOauthProviderId] = useState('')
  const [oauthNotice, setOauthNotice] = useState<string | null>(null)
  const [oauthError, setOauthError] = useState<string | null>(null)
  const [oauthConnecting, setOauthConnecting] = useState(false)
  const [removingLinkId, setRemovingLinkId] = useState<string | null>(null)

  async function loadOAuthLinks() {
    setOauthLinksLoading(true)
    const [linksRes, providersRes] = await Promise.all([
      api.listOAuthLinks(),
      api.listOAuthProviders(),
    ])
    if (linksRes.ok) setOauthLinks(linksRes.data.links || [])
    if (providersRes.ok) setOauthProviders(providersRes.data || [])
    setOauthLinksLoading(false)
  }

  async function handleConnectOAuth(e: FormEvent) {
    e.preventDefault()
    if (!oauthProviderId || oauthConnecting) return
    setOauthConnecting(true)
    setOauthError(null)
    const res = await api.startOAuth(oauthProviderId, 'link')
    if (!res.ok) {
      setOauthError(res.error.message ?? 'Could not start linking.')
      setOauthConnecting(false)
      return
    }
    window.location.href = res.data.url
  }

  async function handleRemoveOAuthLink(linkId: string) {
    setRemovingLinkId(linkId)
    setOauthError(null)
    const res = await api.deleteOAuthLink(linkId)
    if (res.ok) {
      setOauthLinks((prev) => prev.filter((l) => l.id !== linkId))
    } else {
      setOauthError(res.error.message ?? 'Could not remove link.')
    }
    setRemovingLinkId(null)
  }

  async function loadSshKeys() {
    setSshLoading(true)
    const res = await api.listSshKeys()
    if (res.ok) {
      setSshKeys(res.data.keys)
    }
    setSshLoading(false)
  }

  async function handleAddSshKey(e: FormEvent) {
    e.preventDefault()
    setSshError(null)
    const name = sshKeyName.trim()
    const publicKey = sshPublicKey.trim()

    if (!name) {
      setSshError('Key name is required.')
      return
    }
    if (!publicKey) {
      setSshError('Public key content is required.')
      return
    }

    setSshSubmitting(true)
    try {
      const res = await api.addSshKey({ name, publicKey })
      if (!res.ok) {
        setSshError(res.error.message || 'Failed to add SSH key.')
        return
      }
      setSshDialogOpen(false)
      setSshKeyName('')
      setSshPublicKey('')
      setGenPrivateKey(null)
      setGenFingerprint(null)
      await loadSshKeys()
    } finally {
      setSshSubmitting(false)
    }
  }

  async function handleGenerateKeyPair() {
    setGenGenerating(true)
    setSshError(null)
    setGenCopied(false)
    try {
      const pair = await generateSshKeyPair({
        type: genType,
        size: genSize,
        comment: sshKeyName.trim() || undefined,
      })
      setSshPublicKey(pair.publicKey)
      setGenPrivateKey(pair.privateKeyPem)
      setGenFingerprint(pair.fingerprint)
      if (!sshKeyName.trim()) {
        setSshKeyName(`generated-${pair.typeLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`)
      }
    } catch (err) {
      setSshError(
        err instanceof Error
          ? `Key generation failed: ${err.message}`
          : 'Key generation failed in this browser.',
      )
    } finally {
      setGenGenerating(false)
    }
  }

  function handleCopyPrivateKey() {
    if (!genPrivateKey) return
    navigator.clipboard?.writeText(genPrivateKey).then(() => {
      setGenCopied(true)
      setTimeout(() => setGenCopied(false), 2000)
    })
  }

  async function handleDeleteSshKey(id: string) {
    const res = await api.deleteSshKey(id)
    if (res.ok) {
      setSshKeys((prev) => prev.filter((k) => k.id !== id))
    }
  }

  async function loadApiKeys() {
    setApiLoading(true)
    const res = await api.listApiKeys()
    if (res.ok) {
      setApiKeys(res.data.keys)
    }
    setApiLoading(false)
  }

  async function handleCreateApiKey(e: FormEvent) {
    e.preventDefault()
    setApiError(null)
    const name = apiKeyName.trim()
    if (!name) {
      setApiError('Key name is required.')
      return
    }
    setApiSubmitting(true)
    const res = await api.createApiKey({
      name,
      ...(apiKeyExpiry === 'never' ? {} : { expiresInDays: Number(apiKeyExpiry) }),
    })
    if (res.ok) {
      setApiNewToken(res.data.token)
      setApiKeys((prev) => [
        {
          id: res.data.id,
          name: res.data.name,
          prefix: res.data.prefix,
          lastUsedAt: null,
          expiresAt: res.data.expiresAt,
          createdAt: res.data.createdAt,
        },
        ...prev,
      ])
      setApiKeyName('')
      setApiKeyExpiry('never')
    } else {
      setApiError(res.error.message || 'Failed to create API key.')
    }
    setApiSubmitting(false)
  }

  async function handleRevokeApiKey(id: string) {
    setApiRevoking(id)
    const res = await api.revokeApiKey(id)
    if (res.ok) {
      setApiKeys((prev) => prev.filter((k) => k.id !== id))
    }
    setApiRevoking(null)
  }

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
    } else if (activeTab === 'ssh') {
      void loadSshKeys()
    } else if (activeTab === 'api') {
      void loadApiKeys()
    }
  }, [activeTab, activityPage])

  useEffect(() => {
    if (!user) return

    async function load() {
      const [sessionsResult, pendingResult, passkeysResult, sshKeysResult, apiKeysResult] = await Promise.all([
        api.listSessions(),
        api.pendingEmailChange(),
        api.listPasskeys(),
        api.listSshKeys(),
        api.listApiKeys(),
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
      if (sshKeysResult.ok) {
        setSshKeys(sshKeysResult.data.keys)
      }
      if (apiKeysResult.ok) {
        setApiKeys(apiKeysResult.data.keys)
      }
      setSessionsLoading(false)
      setPasskeysLoading(false)
      setSshLoading(false)
      setApiLoading(false)
    }

    void load()
    void loadOAuthLinks()

    if (searchParams.get('oauth') === 'linked') {
      setOauthNotice('OAuth account linked successfully.')
      searchParams.delete('oauth')
      setSearchParams(searchParams, { replace: true })
    }
    const oauthErrorParam = searchParams.get('oauth_error')
    if (oauthErrorParam) {
      setOauthError(oauthErrorParam)
      searchParams.delete('oauth_error')
      setSearchParams(searchParams, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <div className="w-full">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-[250px_1fr] lg:grid-cols-[270px_1fr]">
          {/* Left Sidebar Column */}
          <aside className="flex flex-col gap-6">
            {/* User Profile Mini Badge Card */}
            <div className="rounded-panel border border-border bg-surface p-5 shadow-2xs">
              <div className="flex flex-col items-center text-center">
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

                <div className="mt-3.5 flex flex-col items-center min-w-0 w-full">
                  <div className="flex items-center justify-center gap-1.5 w-full">
                    <h2 className="truncate font-bold tracking-tight text-fg text-[16px]">{user.name}</h2>
                    <VerifiedBadge verified={verified} />
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[12px] text-fg-subtle w-full">{user.email}</p>
                  <p className="mt-1 text-[11px] text-fg-muted">
                    Member since {formatDate(user.createdAt)}
                  </p>
                </div>

                <div className="mt-4 flex w-full flex-col gap-2">
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
                    className="w-full gap-1.5 text-[12px]"
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
                      className="w-full text-danger hover:bg-danger-surface hover:text-danger text-[12px]"
                    >
                      <Trash size={14} aria-hidden />
                      Remove
                    </Button>
                  ) : null}
                </div>

                {avatarError ? <p className="mt-2 text-[11px] text-danger">{avatarError}</p> : null}
                {avatarSaved ? (
                  <p className="mt-2 flex items-center justify-center gap-1 text-[11px] text-success">
                    <CheckCircle size={12} weight="fill" aria-hidden />
                    Avatar updated.
                  </p>
                ) : null}
              </div>
            </div>

            {/* Mobile Tab Dropdown */}
            <div className="md:hidden">
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

            {/* Vertical Sidebar Navigation */}
            <nav className="hidden md:flex flex-col gap-1 rounded-panel border border-border bg-surface p-1.5 shadow-2xs">
              {TABS.map((tab) => {
                const Icon = tab.icon
                const isActive = activeTab === tab.key
                const badgeCount =
                  tab.key === 'ssh'
                    ? sshKeys.length
                    : tab.key === 'api'
                      ? apiKeys.length
                      : tab.key === 'security'
                        ? passkeys.length
                        : undefined

                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={cn(
                      'flex items-center justify-between rounded-control px-3.5 py-2 text-[13px] font-medium transition-all text-left',
                      isActive
                        ? 'bg-surface-2 text-fg font-semibold shadow-xs'
                        : 'text-fg-subtle hover:text-fg hover:bg-surface-2/40',
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon size={16} className={isActive ? 'text-accent' : 'text-fg-subtle'} />
                      <span>{tab.label}</span>
                    </div>
                    {badgeCount !== undefined && badgeCount > 0 ? (
                      <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle">
                        {badgeCount}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </nav>

            {/* Quick Summary Widget */}
            <div className="hidden md:flex flex-col gap-2 rounded-panel border border-border bg-surface p-4 text-[12px] shadow-2xs">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-fg-subtle">
                Account Status
              </span>
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <span className="text-fg-muted">Role</span>
                <span className="font-medium text-fg">{user.isAdmin ? 'Administrator' : 'Standard User'}</span>
              </div>
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <span className="text-fg-muted">Verification</span>
                <span className="font-medium text-fg">{verified ? 'Verified' : 'Pending'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-fg-muted">SSH Keys</span>
                <span className="font-mono font-medium text-fg">{sshKeys.length}</span>
              </div>
            </div>
          </aside>

          {/* Right Main Content Column */}
          <main className="min-w-0 flex-1 space-y-6">
            {/* Tab Content */}
            {activeTab === 'profile' && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="flex flex-col gap-6 lg:col-span-2">
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
                </div>

                {/* Right Column: Account Details & Danger Zone */}
                <div className="flex flex-col gap-6">
                  <Panel title="Account Details">
                    <div className="flex flex-col divide-y divide-border/60 p-4 text-[12px]">
                      <div className="flex items-center justify-between pb-3">
                        <span className="text-fg-subtle">User ID</span>
                        <span className="font-mono text-[11px] text-fg truncate max-w-[140px]" title={user.id}>{user.id}</span>
                      </div>
                      <div className="flex items-center justify-between py-3">
                        <span className="text-fg-subtle">Account Status</span>
                        <span className="font-medium text-emerald-400">Active</span>
                      </div>
                      <div className="flex items-center justify-between py-3">
                        <span className="text-fg-subtle">Created</span>
                        <span className="text-fg">{formatDate(user.createdAt)}</span>
                      </div>
                      <div className="flex items-center justify-between pt-3">
                        <span className="text-fg-subtle">Passkeys Active</span>
                        <span className="font-mono text-fg">{passkeys.length}</span>
                      </div>
                    </div>
                  </Panel>

                  <Panel title="Danger zone">
                    <div className="p-4">
                      <p className="mb-3 text-[12px] leading-relaxed text-fg-muted">
                        Permanently deletes your account and all associated servers, snapshots, and data.
                      </p>

                      <Dialog open={deleteDialogOpen} onOpenChange={handleOpenDeleteDialog}>
                        <DialogTrigger asChild>
                          <Button variant="danger" size="sm" className="w-full">
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
              </div>
            )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <Panel title="Appearance">
              <div className="flex flex-col gap-4 p-5">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <PaintBrush size={16} className="text-fg-subtle" />
                    <span className="text-xs font-semibold text-fg">Theme</span>
                  </div>
                  <p className="text-xs text-fg-muted">
                    Choose how the panel looks for you. A theme replaces the administrator's
                    default styling; System follows your device and the quick toggle.
                  </p>
                </div>

                {themeError ? <Alert tone="danger">{themeError}</Alert> : null}
                {themeSaved ? <Alert tone="success">Appearance settings saved.</Alert> : null}

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-fg">Mode</span>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        { id: 'system', label: 'System' },
                        { id: 'light', label: 'Light' },
                        { id: 'dark', label: 'Dark' },
                      ] as const
                    ).map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          setThemeMode(option.id)
                          setThemeSaved(false)
                        }}
                        className={
                          themeMode === option.id
                            ? 'rounded-control border border-accent bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent-text'
                            : 'rounded-control border border-border bg-surface px-3 py-1.5 text-xs text-fg-muted hover:border-accent hover:text-fg'
                        }
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-fg">Theme</span>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => {
                        setThemePreset('')
                        setThemeSaved(false)
                      }}
                      className={
                        themePreset === ''
                          ? 'rounded-control border border-accent bg-accent/10 p-3 text-left'
                          : 'rounded-control border border-border bg-surface p-3 text-left hover:border-accent'
                      }
                    >
                      <span className="block text-xs font-semibold text-fg">Panel default</span>
                      <span className="mt-0.5 block text-[11px] text-fg-muted">
                        Use the administrator's theme.
                      </span>
                    </button>
                    {THEME_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setThemePreset(preset.id)
                          setThemeSaved(false)
                        }}
                        className={
                          themePreset === preset.id
                            ? 'rounded-control border border-accent bg-accent/10 p-3 text-left'
                            : 'rounded-control border border-border bg-surface p-3 text-left hover:border-accent'
                        }
                      >
                        <span className="flex items-center gap-2 text-xs font-semibold text-fg">
                          <span
                            className="size-3 rounded-full border border-border"
                            style={{ backgroundColor: preset.accentColor }}
                          />
                          {preset.name}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-fg-muted">
                          {preset.description}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <Button size="sm" disabled={themeSaving} onClick={() => void handleSaveTheme()}>
                    {themeSaving ? 'Saving...' : 'Save Appearance'}
                  </Button>
                </div>
              </div>
            </Panel>

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

                {config.enableSecurityKeys === false ? (
                  <Alert tone="warning">Security keys are currently disabled by the administrator.</Alert>
                ) : null}

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

                {config.enableSecurityKeys !== false ? (
                  <>
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
                  </>
                ) : null}
              </div>
            </Panel>

            <Panel
              title="OAuth links"
              action={
                oauthLinks.length > 0 ? (
                  <span className="font-mono text-[11px] text-fg-subtle">
                    {oauthLinks.length} linked
                  </span>
                ) : undefined
              }
            >
              <div className="flex flex-col gap-4 px-5 py-4">
                <p className="text-[13px] leading-relaxed text-fg-muted">
                  Sign in with a third-party account instead of waiting for an email code.
                </p>

                {oauthNotice ? <Alert tone="success">{oauthNotice}</Alert> : null}
                {oauthError ? <Alert tone="danger">{oauthError}</Alert> : null}

                {oauthLinksLoading ? null : oauthLinks.length > 0 ? (
                  <ul className="flex flex-col divide-y divide-border/70 rounded-control border border-border">
                    {oauthLinks.map((link) => (
                      <li
                        key={link.id}
                        className="flex items-center justify-between gap-4 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[13px] text-fg">{link.providerName}</p>
                          <p className="text-[12px] text-fg-subtle">
                            {link.identifier ?? 'Identifier hidden by administrator'}
                            {link.lastUsedAt ? ` · last used ${formatDate(link.lastUsedAt)}` : ''}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={removingLinkId === link.id || !link.userManageable}
                          title={
                            link.userManageable
                              ? undefined
                              : 'This provider does not allow removing the link'
                          }
                          onClick={() => {
                            void handleRemoveOAuthLink(link.id)
                          }}
                        >
                          {removingLinkId === link.id ? 'Removing…' : 'Remove'}
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13px] text-fg-subtle">No linked accounts yet.</p>
                )}

                {oauthProviders.length > 0 ? (
                  <form onSubmit={handleConnectOAuth} className="flex items-end gap-2.5">
                    <div className="flex-1">
                      <label
                        htmlFor="oauth-provider"
                        className="mb-1 block text-[12px] font-medium text-fg-muted"
                      >
                        Provider
                      </label>
                      <select
                        id="oauth-provider"
                        value={oauthProviderId}
                        onChange={(event) => setOauthProviderId(event.target.value)}
                        disabled={oauthConnecting}
                        className="h-9 w-full rounded-control border border-field-border bg-field px-2.5 text-[13px] text-fg focus:border-accent focus:outline-none"
                      >
                        <option value="">Select a provider…</option>
                        {oauthProviders.map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button size="sm" type="submit" disabled={!oauthProviderId || oauthConnecting}>
                      {oauthConnecting ? 'Redirecting…' : 'Connect'}
                    </Button>
                  </form>
                ) : null}
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
          <Panel
            title="SSH Keys"
            action={
              <Dialog open={sshDialogOpen} onOpenChange={(open) => { setSshDialogOpen(open); if (!open) { setGenPrivateKey(null); setGenFingerprint(null) } }}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="secondary">
                    <Plus size={15} aria-hidden />
                    Add SSH Key
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md" style={{ width: 'min(30rem, calc(100vw - 2rem))' }}>
                  <DialogTitle>Add Public SSH Key</DialogTitle>
                  <DialogDescription>
                    Paste your OpenSSH public key. It will be injected via cloud-init into all new
                    instances.
                  </DialogDescription>

                  <form onSubmit={handleAddSshKey} className="mt-4 flex flex-col gap-4">
                    {sshError ? <Alert tone="danger">{sshError}</Alert> : null}

                    <TextField
                      id="ssh-name"
                      label="Key Name"
                      placeholder="e.g. MacBook Pro, Workstation"
                      value={sshKeyName}
                      onChange={(e) => setSshKeyName(e.target.value)}
                      required
                    />

                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="ssh-key-val" className="text-[13px] font-medium text-fg-muted">
                        Public Key
                      </label>
                      <textarea
                        id="ssh-key-val"
                        rows={4}
                        placeholder="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5... user@host"
                        value={sshPublicKey}
                        onChange={(e) => setSshPublicKey(e.target.value)}
                        className="w-full rounded-control border border-border bg-field-bg p-3 font-mono text-xs text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
                        required
                      />
                    </div>

                    {/* Generate Key Pair (client-side; private key is never sent to the server) */}
                    <div className="flex flex-col gap-3 rounded-control border border-border bg-field-bg p-3">
                      <p className="text-[13px] font-semibold text-fg">Generate Key Pair</p>

                      <div className="flex flex-col gap-1.5">
                        <span className="text-[12px] font-medium text-fg-muted">Key Type</span>
                        <div className="flex flex-wrap gap-2">
                          {(
                            [
                              ['ed25519', 'Ed25519'],
                              ['rsa', 'RSA'],
                              ['ecdsa', 'ECDSA'],
                            ] as Array<[GeneratedKeyType, string]>
                          ).map(([value, label]) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setGenType(value)}
                              className={
                                genType === value
                                  ? 'rounded-control border border-accent bg-accent/15 px-2.5 py-1 text-[12px] font-medium text-fg'
                                  : 'rounded-control border border-border bg-field-bg px-2.5 py-1 text-[12px] text-fg-muted hover:text-fg'
                              }
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {genType !== 'ed25519' && (
                        <div className="flex flex-col gap-1.5">
                          <span className="text-[12px] font-medium text-fg-muted">Key Size</span>
                          <div className="flex flex-wrap gap-2">
                            {(genType === 'rsa' ? [2048, 4096] : [256, 384]).map((bits) => (
                              <button
                                key={bits}
                                type="button"
                                onClick={() => setGenSize(bits)}
                                className={
                                  genSize === bits
                                    ? 'rounded-control border border-accent bg-accent/15 px-2.5 py-1 text-[12px] font-medium text-fg'
                                    : 'rounded-control border border-border bg-field-bg px-2.5 py-1 text-[12px] text-fg-muted hover:text-fg'
                                }
                              >
                                {bits} bit
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={handleGenerateKeyPair}
                          disabled={genGenerating}
                        >
                          {genGenerating ? 'Generating...' : 'Generate'}
                        </Button>
                      </div>
                    </div>

                    {genPrivateKey && (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <label htmlFor="ssh-private-key" className="text-[13px] font-medium text-fg-muted">
                            Private Key {genFingerprint ? <span className="text-fg-subtle">({genFingerprint})</span> : null}
                          </label>
                          <button
                            type="button"
                            onClick={handleCopyPrivateKey}
                            className="inline-flex items-center gap-1 text-[12px] text-fg-muted hover:text-fg"
                          >
                            <Copy size={13} aria-hidden />
                            {genCopied ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                        <textarea
                          id="ssh-private-key"
                          rows={6}
                          readOnly
                          value={genPrivateKey}
                          className="w-full rounded-control border border-border bg-field-bg p-3 font-mono text-xs text-fg focus:border-accent focus:outline-none"
                        />
                        <div className="rounded-control border border-warning/50 bg-warning/10 p-3 text-[12px] leading-snug text-fg-muted">
                          Copy the generated private key to a safe place. It won't be shown again and
                          won't be stored on our system. The public key will be saved on our system
                          ready for use when installing a server.
                        </div>
                      </div>
                    )}

                    <div className="mt-2 flex justify-end gap-2.5">
                      <DialogClose asChild>
                        <Button type="button" variant="secondary" disabled={sshSubmitting}>
                          Cancel
                        </Button>
                      </DialogClose>
                      <Button type="submit" disabled={sshSubmitting}>
                        {sshSubmitting ? 'Adding...' : 'Save SSH Key'}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            }
          >
            {sshLoading ? (
              <div className="flex justify-center p-8">
                <ArrowClockwise size={20} className="animate-spin text-fg-subtle" />
              </div>
            ) : sshKeys.length === 0 ? (
              <div className="flex flex-col gap-4 px-5 py-8 text-center sm:py-12">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-surface-2 text-fg-subtle">
                  <Terminal size={24} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-fg">No SSH keys added</h3>
                  <p className="text-xs text-fg-muted max-w-sm mx-auto">
                    Add public SSH keys to automatically inject into newly provisioned Incus instances
                    and containers via cloud-init.
                  </p>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {sshKeys.map((key) => (
                  <li key={key.id} className="flex items-center justify-between gap-4 px-5 py-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <Terminal size={16} className="text-fg-subtle" />
                        <span className="text-sm font-medium text-fg">{key.name}</span>
                      </div>
                      <p className="font-mono text-xs text-fg-muted truncate max-w-md">
                        {key.fingerprint}
                      </p>
                      <p className="text-[11px] text-fg-subtle">Added {formatDate(key.createdAt)}</p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => void handleDeleteSshKey(key.id)}
                      title="Delete SSH key"
                      className="text-danger hover:bg-danger-surface"
                    >
                      <Trash size={16} />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}

        {/* API Keys Tab */}
        {activeTab === 'api' && (
          <Panel
            title="API Keys"
            action={
              <Button size="sm" variant="secondary" onClick={() => { setApiError(null); setApiNewToken(null); setApiDialogOpen(true) }}>
                <Plus size={14} /> New Key
              </Button>
            }
          >
            <p className="px-5 pt-4 text-[12px] text-fg-subtle">
              Personal access tokens for scripts and automation. Send as{' '}
              <code className="font-mono text-[11px] text-fg">Authorization: Bearer solstice_...</code>{' '}
              Tokens act as you, but can never grant admin.
            </p>

            {apiNewToken && (
              <div className="mx-5 mt-4 rounded-control border border-amber-500/30 bg-amber-500/10 p-3.5">
                <p className="text-[12px] font-semibold text-amber-600 dark:text-amber-400">
                  Copy this token now — it is never shown again.
                </p>
                <div className="mt-2 flex items-center justify-between gap-2 rounded-control border border-border bg-surface px-3 py-2.5 font-mono text-[12px]">
                  <span className="truncate text-fg">{apiNewToken}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0"
                    onClick={() => void navigator.clipboard.writeText(apiNewToken)}
                  >
                    <Copy size={13} />
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2 px-5 py-4">
              {apiLoading ? (
                <p className="py-6 text-center text-[13px] text-fg-subtle">Loading keys...</p>
              ) : apiKeys.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <Key size={28} className="text-fg-subtle/50" aria-hidden />
                  <p className="text-[14px] font-semibold text-fg">No API keys yet</p>
                  <p className="max-w-sm text-[12px] text-fg-subtle">
                    Create one to automate snapshots, forwards, or power actions from your own scripts.
                  </p>
                </div>
              ) : (
                apiKeys.map((key) => (
                  <div
                    key={key.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border px-3.5 py-3"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-[13px] font-semibold text-fg">{key.name}</span>
                      <span className="font-mono text-[11px] text-fg-subtle">
                        {key.prefix}... · created {new Date(key.createdAt).toLocaleDateString()}
                        {key.lastUsedAt ? ` · last used ${new Date(key.lastUsedAt).toLocaleDateString()}` : ' · never used'}
                        {key.expiresAt ? ` · expires ${new Date(key.expiresAt).toLocaleDateString()}` : ' · never expires'}
                      </span>
                    </div>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={apiRevoking === key.id}
                      onClick={() => void handleRevokeApiKey(key.id)}
                      className="h-7 px-2 text-[11px]"
                    >
                      {apiRevoking === key.id ? 'Revoking...' : 'Revoke'}
                    </Button>
                  </div>
                ))
              )}
            </div>

            <Dialog open={apiDialogOpen} onOpenChange={setApiDialogOpen}>
              <DialogContent className="max-w-md">
                <DialogTitle>New API Key</DialogTitle>
                <DialogDescription>
                  Name it after the script or machine that will use it.
                </DialogDescription>
                <form onSubmit={handleCreateApiKey} className="mt-4 flex flex-col gap-4">
                  {apiError && <Alert tone="danger">{apiError}</Alert>}
                  <div>
                    <label className="text-[12px] font-semibold text-fg">Key name</label>
                    <input
                      type="text"
                      required
                      value={apiKeyName}
                      onChange={(e) => setApiKeyName(e.target.value)}
                      placeholder="e.g. nightly snapshots"
                      maxLength={60}
                      className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 text-[13px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[12px] font-semibold text-fg">Expires</label>
                    <select
                      value={apiKeyExpiry}
                      onChange={(e) => setApiKeyExpiry(e.target.value)}
                      className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 text-[13px] text-fg focus:border-accent focus:outline-none"
                    >
                      <option value="never">Never</option>
                      <option value="30">30 days</option>
                      <option value="90">90 days</option>
                      <option value="365">1 year</option>
                    </select>
                  </div>
                  <div className="flex justify-end gap-2.5">
                    <Button type="button" variant="secondary" onClick={() => setApiDialogOpen(false)}>
                      Cancel
                    </Button>
                    {apiNewToken ? (
                      <Button
                        type="button"
                        variant="primary"
                        onClick={() => { setApiNewToken(null); setApiDialogOpen(false) }}
                      >
                        Done
                      </Button>
                    ) : (
                      <Button type="submit" variant="primary" disabled={apiSubmitting}>
                        {apiSubmitting ? 'Creating...' : 'Create Key'}
                      </Button>
                    )}
                  </div>
                </form>
              </DialogContent>
            </Dialog>
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
      </main>
    </div>

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