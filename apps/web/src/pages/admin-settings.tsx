import {
  ArrowClockwise,
  At,
  Check,
  Database,
  Fingerprint,
  FloppyDisk,
  Prohibit,
  Stack,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { useAppConfig } from '@/lib/config'
import { cn } from '@/lib/utils'

type SettingsTab = 'application' | 'storage' | 'mail' | 'webauthn' | 'ratelimits'

const SETTINGS_TABS: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: 'application', label: 'Application', icon: Stack },
  { id: 'storage', label: 'Storage', icon: Database },
  { id: 'mail', label: 'Mail', icon: At },
  { id: 'webauthn', label: 'Webauthn', icon: Fingerprint },
  { id: 'ratelimits', label: 'Ratelimits', icon: Prohibit },
]

export function AdminSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { refreshConfig } = useAppConfig()
  const tabParam = searchParams.get('tab') as SettingsTab | null
  const activeTab: SettingsTab =
    tabParam && ['application', 'storage', 'mail', 'webauthn', 'ratelimits'].includes(tabParam)
      ? tabParam
      : 'application'

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Application Settings Form State
  const [appName, setAppName] = useState('')
  const [appLanguage, setAppLanguage] = useState('en')
  const [appIcon, setAppIcon] = useState('/brand/solstice-mark.png')
  const [appBanner, setAppBanner] = useState('')
  const [appUrl, setAppUrl] = useState('')
  const [requireEmailVerification, setRequireEmailVerification] = useState(true)
  const [enableRegistration, setEnableRegistration] = useState(true)

  // Storage Settings Form State
  const [incusSocket, setIncusSocket] = useState('/var/lib/incus/unix.socket')
  const [storagePool, setStoragePool] = useState('default')
  const [mailDir, setMailDir] = useState('./data/mail')

  // Mail Settings Form State
  const [mailFrom, setMailFrom] = useState('')
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState(587)
  const [requireTls, setRequireTls] = useState(false)

  // Webauthn Form State
  const [rpName, setRpName] = useState('')
  const [rpId, setRpId] = useState('')
  const [webauthnOrigin, setWebauthnOrigin] = useState('')

  // Ratelimits Form State
  const [ratelimitWindowSec, setRatelimitWindowSec] = useState(60)
  const [maxRequestsPerMin, setMaxRequestsPerMin] = useState(60)

  const loadData = useCallback(async () => {
    const res = await api.adminSettings()
    if (res.ok && res.data) {
      const app = res.data.application
      setAppName(app.name || 'Solstice')
      setAppLanguage(app.language || 'en')
      setAppIcon(app.icon || '/brand/solstice-mark.png')
      setAppBanner(app.banner || '')
      setAppUrl(app.url || window.location.origin)
      setRequireEmailVerification(app.requireEmailVerification ?? true)
      setEnableRegistration(app.enableRegistration ?? true)

      const storage = res.data.storage
      setIncusSocket(storage.incusSocket || '/var/lib/incus/unix.socket')
      setStoragePool(storage.storagePool || 'default')
      setMailDir(storage.mailDir || './data/mail')

      const mail = res.data.mail
      setMailFrom(mail.mailFrom || '')
      setSmtpHost(mail.smtpHost || '')
      setSmtpPort(mail.smtpPort || 587)
      setRequireTls(mail.requireTls ?? false)

      const webauthn = res.data.webauthn
      setRpName(webauthn.rpName || app.name || 'Solstice')
      setRpId(webauthn.rpId || window.location.hostname)
      setWebauthnOrigin(webauthn.origin || window.location.origin)

      const ratelimits = res.data.ratelimits
      setRatelimitWindowSec(Math.round((ratelimits.windowMs || 60000) / 1000))
      setMaxRequestsPerMin(ratelimits.maxRequestsPerMin || 60)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  function showSuccess() {
    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 3000)
  }

  async function handleSaveApplication(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    try {
      const res = await api.adminUpdateApplicationSettings({
        name: appName,
        language: appLanguage,
        icon: appIcon,
        banner: appBanner,
        url: appUrl,
        requireEmailVerification,
        enableRegistration,
      })

      if (!res.ok) {
        setSaveError(res.error?.message || 'Failed to save application settings.')
        return
      }

      showSuccess()
      await refreshConfig()
      await loadData()
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveStorage(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    try {
      const res = await api.adminUpdateStorageSettings({
        incusSocket,
        storagePool,
        mailDir,
      })

      if (!res.ok) {
        setSaveError(res.error?.message || 'Failed to save storage settings.')
        return
      }

      showSuccess()
      await loadData()
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveMail(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    try {
      const res = await api.adminUpdateMailSettings({
        mailFrom,
        smtpHost,
        smtpPort: Number(smtpPort),
        requireTls,
      })

      if (!res.ok) {
        setSaveError(res.error?.message || 'Failed to save mail settings.')
        return
      }

      showSuccess()
      await loadData()
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveWebauthn(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    try {
      const res = await api.adminUpdateWebauthnSettings({
        rpName,
        rpId,
        origin: webauthnOrigin,
      })

      if (!res.ok) {
        setSaveError(res.error?.message || 'Failed to save webauthn settings.')
        return
      }

      showSuccess()
      await loadData()
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveRatelimits(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    try {
      const res = await api.adminUpdateRatelimitsSettings({
        windowMs: Number(ratelimitWindowSec) * 1000,
        maxRequestsPerMin: Number(maxRequestsPerMin),
      })

      if (!res.ok) {
        setSaveError(res.error?.message || 'Failed to save ratelimit settings.')
        return
      }

      showSuccess()
      await loadData()
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppShell
      title="Settings"
      description="Manage panel branding, registration rules, host daemons, relay transports, and security bounds."
    >
      <div className="flex flex-col gap-6">
        {/* Top Category Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div className="flex items-center gap-1 overflow-x-auto rounded-control bg-surface-2 p-1">
            {SETTINGS_TABS.map((tab) => {
              const Icon = tab.icon
              const isSelected = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSearchParams({ tab: tab.id })}
                  className={cn(
                    'flex items-center gap-2 rounded-control px-3.5 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors',
                    isSelected
                      ? 'bg-surface text-fg shadow-sm'
                      : 'text-fg-muted hover:text-fg',
                  )}
                >
                  <Icon size={16} aria-hidden />
                  {tab.label}
                </button>
              )
            })}
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="gap-1.5 text-[12px]"
          >
            <ArrowClockwise size={13} className={loading ? 'animate-spin' : ''} />
            Reload
          </Button>
        </div>

        {/* Global Feedback Banners */}
        {saveError ? (
          <div className="rounded-control border border-danger/30 bg-danger/10 px-4 py-2.5 text-[13px] text-danger">
            {saveError}
          </div>
        ) : null}

        {saveSuccess ? (
          <div className="inline-flex items-center gap-2 rounded-control border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-[13px] text-emerald-500 font-medium">
            <Check size={16} weight="bold" /> Settings saved and applied successfully.
          </div>
        ) : null}

        {/* ── TAB 1: APPLICATION ───────────────────────────────────── */}
        {activeTab === 'application' ? (
          <form onSubmit={handleSaveApplication} className="flex flex-col gap-6">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {/* Name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-fg">
                  Name <span className="text-danger">*</span>
                </label>
                <input
                  required
                  type="text"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="e.g. Solstice"
                  className="h-10 rounded-control border border-border bg-surface px-3 text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                />
              </div>

              {/* Language */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-fg">
                  Language <span className="text-danger">*</span>
                </label>
                <select
                  value={appLanguage}
                  onChange={(e) => setAppLanguage(e.target.value)}
                  className="h-10 rounded-control border border-border bg-surface px-3 text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                >
                  <option value="en">English</option>
                  <option value="vi">Tiếng Việt</option>
                  <option value="ja">日本語</option>
                  <option value="de">Deutsch</option>
                  <option value="fr">Français</option>
                </select>
              </div>

              {/* Icon */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-fg">
                  Icon <span className="text-danger">*</span>
                </label>
                <input
                  required
                  type="text"
                  value={appIcon}
                  onChange={(e) => setAppIcon(e.target.value)}
                  placeholder="/brand/solstice-mark.png or https://..."
                  className="h-10 rounded-control border border-border bg-surface px-3 text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                />
              </div>

              {/* Banner */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-fg">Banner</label>
                <input
                  type="text"
                  value={appBanner}
                  onChange={(e) => setAppBanner(e.target.value)}
                  placeholder="Banner image URL (optional)"
                  className="h-10 rounded-control border border-border bg-surface px-3 text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                />
              </div>

              {/* URL */}
              <div className="flex flex-col gap-1.5 md:col-span-2">
                <label className="text-[12px] font-medium text-fg">
                  Public URL <span className="text-danger">*</span>
                </label>
                <input
                  required
                  type="url"
                  value={appUrl}
                  onChange={(e) => setAppUrl(e.target.value)}
                  placeholder="https://..."
                  className="h-10 rounded-control border border-border bg-surface px-3 font-mono text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                />
              </div>

              {/* Toggles */}
              <div className="flex flex-col gap-4 rounded-panel border border-border bg-surface p-4 md:col-span-2">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requireEmailVerification}
                    onChange={(e) => setRequireEmailVerification(e.target.checked)}
                    className="mt-1 rounded border-border text-sun-500 focus:ring-sun-500"
                  />
                  <div className="flex flex-col">
                    <span className="text-[13px] font-medium text-fg">Require Email Verification</span>
                    <span className="text-[11px] text-fg-subtle">
                      When enabled, new users must enter a 6-digit code or magic link before accessing the panel. When disabled, accounts are active immediately upon registration.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableRegistration}
                    onChange={(e) => setEnableRegistration(e.target.checked)}
                    className="mt-1 rounded border-border text-sun-500 focus:ring-sun-500"
                  />
                  <div className="flex flex-col">
                    <span className="text-[13px] font-medium text-fg">Enable Public Registration</span>
                    <span className="text-[11px] text-fg-subtle">
                      Allow new visitors to register accounts. When disabled, only existing users can log in, and registration endpoints return 403 Forbidden.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Save bar */}
            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" variant="primary" disabled={saving} className="gap-1.5 text-[13px]">
                <FloppyDisk size={16} />
                {saving ? 'Saving...' : 'Save Application Settings'}
              </Button>
            </div>
          </form>
        ) : null}

        {/* ── TAB 2: STORAGE ───────────────────────────────────────── */}
        {activeTab === 'storage' ? (
          <form onSubmit={handleSaveStorage} className="flex flex-col gap-6">
            <div className="flex flex-col gap-4 rounded-panel border border-border bg-surface p-5">
              <div className="flex items-center gap-2 border-b border-border pb-3 text-[13px] font-semibold tracking-wider text-fg uppercase">
                <Database size={16} className="text-sun-500" />
                <span>Storage Pools & Daemon Paths</span>
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <label className="text-[12px] font-medium text-fg">
                    Incus Unix IPC Socket <span className="text-danger">*</span>
                  </label>
                  <input
                    required
                    type="text"
                    value={incusSocket}
                    onChange={(e) => setIncusSocket(e.target.value)}
                    placeholder="/var/lib/incus/unix.socket"
                    className="h-10 rounded-control border border-border bg-surface-2/40 px-3 font-mono text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                  />
                  <span className="text-[11px] text-fg-subtle">Filesystem path to local Incus supervisor control socket</span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-fg">
                    Target Storage Pool <span className="text-danger">*</span>
                  </label>
                  <input
                    required
                    type="text"
                    value={storagePool}
                    onChange={(e) => setStoragePool(e.target.value)}
                    placeholder="default"
                    className="h-10 rounded-control border border-border bg-surface-2/40 px-3 font-mono text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                  />
                  <span className="text-[11px] text-fg-subtle">Default ZFS / Btrfs / LVM pool for instances and volume allocations</span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-fg">
                    Email Spool Path <span className="text-danger">*</span>
                  </label>
                  <input
                    required
                    type="text"
                    value={mailDir}
                    onChange={(e) => setMailDir(e.target.value)}
                    placeholder="./data/mail"
                    className="h-10 rounded-control border border-border bg-surface-2/40 px-3 font-mono text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                  />
                  <span className="text-[11px] text-fg-subtle">Local storage staging directory for file-based email delivery</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" variant="primary" disabled={saving} className="gap-1.5 text-[13px]">
                <FloppyDisk size={16} />
                {saving ? 'Saving...' : 'Save Storage Settings'}
              </Button>
            </div>
          </form>
        ) : null}

        {/* ── TAB 3: MAIL ──────────────────────────────────────────── */}
        {activeTab === 'mail' ? (
          <form onSubmit={handleSaveMail} className="flex flex-col gap-6">
            <div className="flex flex-col gap-4 rounded-panel border border-border bg-surface p-5">
              <div className="flex items-center gap-2 border-b border-border pb-3 text-[13px] font-semibold tracking-wider text-fg uppercase">
                <At size={16} className="text-sun-500" />
                <span>SMTP Relay Transport</span>
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <label className="text-[12px] font-medium text-fg">
                    Envelope From Address <span className="text-danger">*</span>
                  </label>
                  <input
                    required
                    type="text"
                    value={mailFrom}
                    onChange={(e) => setMailFrom(e.target.value)}
                    placeholder="Solstice Host <no-reply@solstice.host>"
                    className="h-10 rounded-control border border-border bg-surface-2/40 px-3 font-mono text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                  />
                  <span className="text-[11px] text-fg-subtle">Header envelope sender name and address displayed on auth emails</span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-fg">
                    SMTP Server Host
                  </label>
                  <input
                    type="text"
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    placeholder="smtp.fastmail.com"
                    className="h-10 rounded-control border border-border bg-surface-2/40 px-3 font-mono text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                  />
                  <span className="text-[11px] text-fg-subtle">Outbound SMTP host domain (empty to use file-based local mailbox)</span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-fg">
                    SMTP Submission Port
                  </label>
                  <input
                    type="number"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(Number(e.target.value))}
                    placeholder="587"
                    className="h-10 rounded-control border border-border bg-surface-2/40 px-3 font-mono text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                  />
                  <span className="text-[11px] text-fg-subtle">Port for TLS/STARTTLS submission (standard: 587 or 465)</span>
                </div>

                <div className="flex flex-col gap-2 md:col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={requireTls}
                      onChange={(e) => setRequireTls(e.target.checked)}
                      className="rounded border-border text-sun-500 focus:ring-sun-500"
                    />
                    <span className="text-[13px] font-medium text-fg">Require TLS / STARTTLS</span>
                  </label>
                  <span className="text-[11px] text-fg-subtle">Enforces encrypted channel negotiation before sending auth tokens</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" variant="primary" disabled={saving} className="gap-1.5 text-[13px]">
                <FloppyDisk size={16} />
                {saving ? 'Saving...' : 'Save Mail Settings'}
              </Button>
            </div>
          </form>
        ) : null}

        {/* ── TAB 4: WEBAUTHN ──────────────────────────────────────── */}
        {activeTab === 'webauthn' ? (
          <form onSubmit={handleSaveWebauthn} className="flex flex-col gap-6">
            <div className="flex flex-col gap-4 rounded-panel border border-border bg-surface p-5">
              <div className="flex items-center gap-2 border-b border-border pb-3 text-[13px] font-semibold tracking-wider text-fg uppercase">
                <Fingerprint size={16} className="text-sun-500" />
                <span>Passkeys & FIDO2 Relying Party</span>
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-fg">
                    Relying Party Name <span className="text-danger">*</span>
                  </label>
                  <input
                    required
                    type="text"
                    value={rpName}
                    onChange={(e) => setRpName(e.target.value)}
                    placeholder="Solstice"
                    className="h-10 rounded-control border border-border bg-surface-2/40 px-3 font-mono text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                  />
                  <span className="text-[11px] text-fg-subtle">Displayed on hardware authenticators</span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-fg">
                    Relying Party ID (Domain) <span className="text-danger">*</span>
                  </label>
                  <input
                    required
                    type="text"
                    value={rpId}
                    onChange={(e) => setRpId(e.target.value)}
                    placeholder="solstice.host"
                    className="h-10 rounded-control border border-border bg-surface-2/40 px-3 font-mono text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                  />
                  <span className="text-[11px] text-fg-subtle">Scope domain for Passkey isolation</span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-fg">
                    Origin URL <span className="text-danger">*</span>
                  </label>
                  <input
                    required
                    type="url"
                    value={webauthnOrigin}
                    onChange={(e) => setWebauthnOrigin(e.target.value)}
                    placeholder="https://solstice.host"
                    className="h-10 rounded-control border border-border bg-surface-2/40 px-3 font-mono text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                  />
                  <span className="text-[11px] text-fg-subtle">Strict cryptographic origin string</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" variant="primary" disabled={saving} className="gap-1.5 text-[13px]">
                <FloppyDisk size={16} />
                {saving ? 'Saving...' : 'Save WebAuthn Settings'}
              </Button>
            </div>
          </form>
        ) : null}

        {/* ── TAB 5: RATELIMITS ────────────────────────────────────── */}
        {activeTab === 'ratelimits' ? (
          <form onSubmit={handleSaveRatelimits} className="flex flex-col gap-6">
            <div className="flex flex-col gap-4 rounded-panel border border-border bg-surface p-5">
              <div className="flex items-center gap-2 border-b border-border pb-3 text-[13px] font-semibold tracking-wider text-fg uppercase">
                <Prohibit size={16} className="text-sun-500" />
                <span>Rate Limiting & Abuse Prevention</span>
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-fg">
                    Rolling Window Duration (Seconds) <span className="text-danger">*</span>
                  </label>
                  <input
                    required
                    type="number"
                    min="5"
                    max="3600"
                    value={ratelimitWindowSec}
                    onChange={(e) => setRatelimitWindowSec(Number(e.target.value))}
                    className="h-10 rounded-control border border-border bg-surface-2/40 px-3 font-mono text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                  />
                  <span className="text-[11px] text-fg-subtle">Interval over which client request limits are measured</span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-fg">
                    Max Requests Per Window <span className="text-danger">*</span>
                  </label>
                  <input
                    required
                    type="number"
                    min="1"
                    max="10000"
                    value={maxRequestsPerMin}
                    onChange={(e) => setMaxRequestsPerMin(Number(e.target.value))}
                    className="h-10 rounded-control border border-border bg-surface-2/40 px-3 font-mono text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                  />
                  <span className="text-[11px] text-fg-subtle">Maximum allowed requests per IP address before 429 throttling</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" variant="primary" disabled={saving} className="gap-1.5 text-[13px]">
                <FloppyDisk size={16} />
                {saving ? 'Saving...' : 'Save Ratelimit Settings'}
              </Button>
            </div>
          </form>
        ) : null}
      </div>
    </AppShell>
  )
}
