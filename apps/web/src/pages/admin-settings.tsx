import {
  ArrowClockwise,
  ArrowsDownUp,
  At,
  CaretLeft,
  CaretRight,
  Check,
  Database,
  Eye,
  EyeSlash,
  Fingerprint,
  FloppyDisk,
  Info,
  PaperPlaneTilt,
  Prohibit,
  Robot,
  ShareNetwork,
  Scales,
  Stack,
  UploadSimple,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { api } from '@/lib/api'
import { useDirtyForm } from '@/components/unsaved-changes-provider'
import { useAppConfig } from '@/lib/config'
import { cn } from '@/lib/utils'

type SettingsTab = 'application' | 'metadata' | 'storage' | 'mail' | 'captcha' | 'webauthn' | 'ratelimits' | 'network'

const SETTINGS_TABS: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: 'application', label: 'Application', icon: Stack },
  { id: 'metadata', label: 'Metadata', icon: ShareNetwork },
  { id: 'storage', label: 'Storage', icon: Database },
  { id: 'mail', label: 'Mail', icon: At },
  { id: 'captcha', label: 'Captcha', icon: Robot },
  { id: 'webauthn', label: 'Webauthn', icon: Fingerprint },
  { id: 'ratelimits', label: 'Ratelimits', icon: Prohibit },
  { id: 'network', label: 'Network', icon: ArrowsDownUp },
]

export function AdminSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { refreshConfig } = useAppConfig()
  const tabParam = searchParams.get('tab') as SettingsTab | null
  const activeTab: SettingsTab =
    tabParam && ['application', 'metadata', 'storage', 'mail', 'captcha', 'webauthn', 'ratelimits', 'network'].includes(tabParam)
      ? tabParam
      : 'application'

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)

  useDirtyForm(isDirty && !saving)
  const tabStripRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateTabScroll = useCallback(() => {
    const el = tabStripRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])

  useEffect(() => {
    updateTabScroll()
    window.addEventListener('resize', updateTabScroll)
    return () => window.removeEventListener('resize', updateTabScroll)
  }, [updateTabScroll])

  useEffect(() => {
    tabStripRef.current
      ?.querySelector(`[data-tab="${activeTab}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    updateTabScroll()
  }, [activeTab, updateTabScroll])

  // Application Settings Form State
  const [appName, setAppName] = useState('')
  const [appTagline, setAppTagline] = useState('')
  const [appIcon, setAppIcon] = useState('/brand/mark.svg')
  const [appBanner, setAppBanner] = useState('')
  const [appUrl, setAppUrl] = useState('')
  const [requireEmailVerification, setRequireEmailVerification] = useState(true)
  const [enableRegistration, setEnableRegistration] = useState(true)
  const [uploadingIcon, setUploadingIcon] = useState(false)
  const [uploadingBanner, setUploadingBanner] = useState(false)

  // Metadata Settings Form State
  const [metaDescription, setMetaDescription] = useState('')
  const [metaPreviewImage, setMetaPreviewImage] = useState('')
  const [metaTwitterCard, setMetaTwitterCard] = useState('summary_large_image')
  const [metaThemeColor, setMetaThemeColor] = useState('#6c5ce7')
  const [metaAllowIndexing, setMetaAllowIndexing] = useState(true)

  // Legal document URLs (empty = built-in page)
  const [legalTermsUrl, setLegalTermsUrl] = useState('')
  const [legalPrivacyUrl, setLegalPrivacyUrl] = useState('')
  const [legalAupUrl, setLegalAupUrl] = useState('')

  // Storage Settings Form State
  const [storageDriver, setStorageDriver] = useState<'local' | 's3'>('local')
  const [s3AccessKey, setS3AccessKey] = useState('')
  const [s3SecretKey, setS3SecretKey] = useState('')
  const [s3Bucket, setS3Bucket] = useState('')
  const [s3Region, setS3Region] = useState('auto')
  const [s3Endpoint, setS3Endpoint] = useState('')
  const [s3PublicUrl, setS3PublicUrl] = useState('')
  const [s3ForcePathStyle, setS3ForcePathStyle] = useState(false)
  const [showSecretKey, setShowSecretKey] = useState(false)

  // Mail Settings Form State
  const [mailProvider, setMailProvider] = useState<'smtp' | 'none' | 'sendmail' | 'filesystem' | 'solstice'>('smtp')
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState(587)
  const [tlsMode, setTlsMode] = useState<'STARTTLS' | 'TLS' | 'None'>('STARTTLS')
  const [skipCertValidation, setSkipCertValidation] = useState(false)
  const [heloDomain, setHeloDomain] = useState('')
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPass, setSmtpPass] = useState('')
  const [showSmtpPass, setShowSmtpPass] = useState(false)
  const [mailFrom, setMailFrom] = useState('')
  const [mailFromName, setMailFromName] = useState('')
  const [sendmailPath, setSendmailPath] = useState('/usr/sbin/sendmail')
  const [relayToken, setRelayToken] = useState('')
  const [registeringRelay, setRegisteringRelay] = useState(false)
  const [testingMail, setTestingMail] = useState(false)
  const [testMailResult, setTestMailResult] = useState<{ ok: boolean; message: string } | null>(null)

  // Captcha Form State
  const [captchaProvider, setCaptchaProvider] = useState<'none' | 'turnstile' | 'recaptcha' | 'recaptcha_v2' | 'recaptcha_v3' | 'hcaptcha' | 'friendly_captcha' | 'trycap'>('none')
  const [captchaSiteKey, setCaptchaSiteKey] = useState('')
  const [captchaSecretKey, setCaptchaSecretKey] = useState('')
  const [captchaApiUrl, setCaptchaApiUrl] = useState('')
  const [showCaptchaSecretKey, setShowCaptchaSecretKey] = useState(false)

  // Webauthn Form State
  const [enableSecurityKeys, setEnableSecurityKeys] = useState(true)
  const [allowUsernamelessLogin, setAllowUsernamelessLogin] = useState(false)
  const [rpName, setRpName] = useState('')
  const [rpId, setRpId] = useState('')
  const [webauthnOrigin, setWebauthnOrigin] = useState('')
  const [authTimeout, setAuthTimeout] = useState(300)
  const [regTimeout, setRegTimeout] = useState(300)

  // Ratelimits Form State
  const [ratelimitWindowSec, setRatelimitWindowSec] = useState(60)
  const [maxRequestsPerMin, setMaxRequestsPerMin] = useState(60)

  // Network (Port Forwarding) Form State
  const [portRangeStart, setPortRangeStart] = useState(22000)
  const [portRangeEnd, setPortRangeEnd] = useState(22999)
  const [defaultForwardLimit, setDefaultForwardLimit] = useState(5)

  const loadData = useCallback(async () => {
    const res = await api.adminSettings()
    if (res.ok && res.data) {
      const app = res.data.application
      setAppName(app.name || 'Solstice')
      setAppTagline(app.tagline || 'VPS Hosting')
      setAppIcon(app.icon || '/brand/mark.svg')
      setAppBanner(app.banner || '')
      setAppUrl(app.url || window.location.origin)
      setRequireEmailVerification(app.requireEmailVerification ?? true)
      setEnableRegistration(app.enableRegistration ?? true)

      const meta = res.data.metadata
      if (meta) {
        setMetaDescription(meta.description || '')
        setMetaPreviewImage(meta.previewImage || '')
        setMetaTwitterCard(meta.twitterCard || 'summary_large_image')
        setMetaThemeColor(meta.themeColor || '#6c5ce7')
        setMetaAllowIndexing(meta.allowIndexing ?? true)

      const legal = res.data.legal
      if (legal) {
        setLegalTermsUrl(legal.termsUrl || '')
        setLegalPrivacyUrl(legal.privacyUrl || '')
        setLegalAupUrl(legal.aupUrl || '')
      }
      }

      const storage = res.data.storage
      setStorageDriver((storage.driver as 'local' | 's3') || 'local')
      setS3AccessKey(storage.s3AccessKey || '')
      setS3SecretKey(storage.s3SecretKey || '')
      setS3Bucket(storage.s3Bucket || '')
      setS3Region(storage.s3Region || 'auto')
      setS3Endpoint(storage.s3Endpoint || '')
      setS3PublicUrl(storage.s3PublicUrl || '')
      setS3ForcePathStyle(storage.s3ForcePathStyle ?? false)

      const mail = res.data.mail
      setMailProvider((mail.provider as any) || 'smtp')
      setMailFrom(mail.mailFrom || '')
      setMailFromName(mail.mailFromName || '')
      setSmtpHost(mail.smtpHost || '')
      setSmtpPort(mail.smtpPort || 587)
      setSmtpUser(mail.smtpUser || '')
      setSmtpPass(mail.smtpPass || '')
      setTlsMode((mail.tlsMode as any) || 'STARTTLS')
      setSkipCertValidation(mail.skipCertValidation ?? false)
      setHeloDomain(mail.heloDomain || '')
      setSendmailPath(mail.sendmailPath || '/usr/sbin/sendmail')
      setRelayToken(mail.relayToken || '')

      const captcha = res.data.captcha
      if (captcha) {
        setCaptchaProvider(captcha.provider || 'none')
        setCaptchaSiteKey(captcha.siteKey || '')
        setCaptchaSecretKey(captcha.secretKey || '')
        setCaptchaApiUrl((captcha as { apiUrl?: string }).apiUrl || '')
      }

      const webauthn = res.data.webauthn
      setEnableSecurityKeys(webauthn.enableSecurityKeys ?? true)
      setAllowUsernamelessLogin(webauthn.allowUsernamelessLogin ?? false)
      setRpName(webauthn.rpName || app.name || 'Solstice')
      setRpId(webauthn.rpId || window.location.hostname)
      setWebauthnOrigin(webauthn.origin || window.location.origin)
      setAuthTimeout(webauthn.authenticationTimeout ?? 300)
      setRegTimeout(webauthn.registrationTimeout ?? 300)

      const ratelimits = res.data.ratelimits
      setRatelimitWindowSec(Math.round((ratelimits.windowMs || 60000) / 1000))
      setMaxRequestsPerMin(ratelimits.maxRequestsPerMin || 60)

      const network = res.data.network
      if (network) {
        setPortRangeStart(network.portRangeStart || 22000)
        setPortRangeEnd(network.portRangeEnd || 22999)
        setDefaultForwardLimit(network.defaultForwardLimit ?? 5)
      }
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

  async function handleUploadAsset(file: File, target: 'icon' | 'banner') {
    if (target === 'icon') setUploadingIcon(true)
    else setUploadingBanner(true)
    setSaveError(null)

    try {
      const res = await api.upload({ file, folder: 'assets' })
      if (!res.ok) {
        setSaveError(res.error?.message || 'Failed to upload asset.')
        return
      }
      if (target === 'icon') setAppIcon(res.data.url)
      else setAppBanner(res.data.url)
    } finally {
      if (target === 'icon') setUploadingIcon(false)
      else setUploadingBanner(false)
    }
  }

  async function handleSaveApplication(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    try {
      const res = await api.adminUpdateApplicationSettings({
        name: appName,
        tagline: appTagline,
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

  async function handleSaveMetadata(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    try {
      const res = await api.adminUpdateMetadataSettings({
        description: metaDescription,
        previewImage: metaPreviewImage,
        twitterCard: metaTwitterCard,
        themeColor: metaThemeColor,
        allowIndexing: metaAllowIndexing,
      })

      if (!res.ok) {
        setSaveError(res.error?.message || 'Failed to save metadata settings.')
        return
      }

      showSuccess()
      await refreshConfig()
      await loadData()
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveLegal(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    try {
      const res = await api.adminUpdateLegalSettings({
        termsUrl: legalTermsUrl,
        privacyUrl: legalPrivacyUrl,
        aupUrl: legalAupUrl,
      })

      if (!res.ok) {
        setSaveError(res.error?.message || 'Failed to save legal settings.')
        return
      }

      showSuccess()
      await refreshConfig()
      await loadData()
    } finally {
      setSaving(false)
    }
  }

  function handleAutofillMetadata() {
    setMetaDescription(`Manage your cloud instances and infrastructure with ${appName || 'Solstice'}.`)
    setMetaPreviewImage(appBanner || `${window.location.origin}/brand/mark.svg`)
    setMetaTwitterCard('summary_large_image')
    setMetaThemeColor('#6c5ce7')
    setMetaAllowIndexing(true)
  }

  async function handleSaveStorage(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    try {
      const res = await api.adminUpdateStorageSettings({
        driver: storageDriver,
        s3AccessKey,
        s3SecretKey,
        s3Bucket,
        s3Region,
        s3Endpoint,
        s3PublicUrl,
        s3ForcePathStyle,
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
    setTestMailResult(null)

    try {
      const res = await api.adminUpdateMailSettings({
        provider: mailProvider,
        mailFrom,
        mailFromName,
        smtpHost,
        smtpPort: Number(smtpPort),
        smtpUser,
        smtpPass,
        tlsMode,
        skipCertValidation,
        heloDomain,
        sendmailPath,
        relayToken,
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

  async function handleTestEmail() {
    setTestingMail(true)
    setTestMailResult(null)
    setSaveError(null)
    try {
      const res = await api.adminTestMail()
      if (res.ok) {
        setTestMailResult({ ok: true, message: res.data.message || 'Test email sent successfully!' })
      } else {
        setTestMailResult({ ok: false, message: res.error?.message || 'Failed to send test email.' })
      }
    } finally {
      setTestingMail(false)
    }
  }

  async function handleSaveWebauthn(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    try {
      const res = await api.adminUpdateWebauthnSettings({
        enableSecurityKeys,
        allowUsernamelessLogin,
        rpName,
        rpId,
        origin: webauthnOrigin,
        authenticationTimeout: authTimeout,
        registrationTimeout: regTimeout,
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

  function handleAutofillWebauthn() {
    setRpId(window.location.hostname)
    setWebauthnOrigin(window.location.origin)
    setAuthTimeout(300)
    setRegTimeout(300)
  }

  async function handleSaveCaptcha(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    try {
      const res = await api.adminUpdateCaptchaSettings({
        provider: captchaProvider,
        siteKey: captchaSiteKey,
        secretKey: captchaSecretKey,
        apiUrl: captchaApiUrl,
      })

      if (!res.ok) {
        setSaveError(res.error?.message || 'Failed to save captcha settings.')
        return
      }

      showSuccess()
      await refreshConfig()
      await loadData()
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveNetwork(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    try {
      const res = await api.adminUpdateNetworkSettings({
        portRangeStart: Number(portRangeStart),
        portRangeEnd: Number(portRangeEnd),
        defaultForwardLimit: Number(defaultForwardLimit),
      })

      if (!res.ok) {
        setSaveError(res.error?.message || 'Failed to save network settings.')
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
          <div className="relative min-w-0 flex-1">
            {canScrollLeft && (
              <>
                <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-bg to-transparent" />
                <button
                  type="button"
                  aria-label="Scroll tabs left"
                  onClick={() => tabStripRef.current?.scrollBy({ left: -160, behavior: 'smooth' })}
                  className="absolute left-0.5 top-1/2 z-20 flex size-6 -translate-y-1/2 items-center justify-center rounded-control border border-border bg-surface text-fg-subtle shadow-sm hover:text-fg"
                >
                  <CaretLeft size={13} />
                </button>
              </>
            )}
            <div
              ref={tabStripRef}
              onScroll={updateTabScroll}
              className="flex items-center gap-1 overflow-x-auto rounded-control bg-surface-2 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {SETTINGS_TABS.map((tab) => {
              const Icon = tab.icon
              const isSelected = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  data-tab={tab.id}
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
            {canScrollRight && (
              <>
                <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-bg to-transparent" />
                <button
                  type="button"
                  aria-label="Scroll tabs right"
                  onClick={() => tabStripRef.current?.scrollBy({ left: 160, behavior: 'smooth' })}
                  className="absolute right-0.5 top-1/2 z-20 flex size-6 -translate-y-1/2 items-center justify-center rounded-control border border-border bg-surface text-fg-subtle shadow-sm hover:text-fg"
                >
                  <CaretRight size={13} />
                </button>
              </>
            )}
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
          <form onSubmit={handleSaveApplication} onChange={() => setIsDirty(true)} className="flex flex-col gap-6">
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
                  placeholder="e.g. VPS Panel"
                  className="h-10 rounded-control border border-border bg-surface px-3 text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                />
              </div>

              {/* Tagline */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-fg">Tagline</label>
                <input
                  type="text"
                  value={appTagline}
                  onChange={(e) => setAppTagline(e.target.value)}
                  placeholder="e.g. VPS Hosting"
                  className="h-10 rounded-control border border-border bg-surface px-3 text-[13px] text-fg placeholder:text-fg-subtle focus:border-sun-500 focus:outline-none"
                />
                <span className="text-[11px] text-fg-subtle">Shown under the name. Leave blank to hide it.</span>
              </div>

              {/* Icon */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-fg">
                  Icon <span className="text-danger">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    required
                    type="text"
                    value={appIcon}
                    onChange={(e) => setAppIcon(e.target.value)}
                    placeholder="/brand/mark.svg or https://..."
                    className="h-10 flex-1 rounded-control border border-border bg-surface px-3 text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                  />
                  <label className="flex h-10 cursor-pointer items-center gap-1.5 rounded-control border border-border bg-surface px-3 text-[12px] font-medium text-fg hover:bg-surface-2">
                    <UploadSimple size={15} />
                    <span>{uploadingIcon ? '...' : 'Upload'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingIcon}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleUploadAsset(file, 'icon')
                      }}
                    />
                  </label>
                </div>
              </div>

              {/* Banner */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-fg">Banner</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={appBanner}
                    onChange={(e) => setAppBanner(e.target.value)}
                    placeholder="Banner image URL (optional)"
                    className="h-10 flex-1 rounded-control border border-border bg-surface px-3 text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                  />
                  <label className="flex h-10 cursor-pointer items-center gap-1.5 rounded-control border border-border bg-surface px-3 text-[12px] font-medium text-fg hover:bg-surface-2">
                    <UploadSimple size={15} />
                    <span>{uploadingBanner ? '...' : 'Upload'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingBanner}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleUploadAsset(file, 'banner')
                      }}
                    />
                  </label>
                </div>
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
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <div className="pt-0.5">
                    <Checkbox
                      checked={requireEmailVerification}
                      onCheckedChange={(checked) => setRequireEmailVerification(checked === true)}
                    />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[13px] font-medium text-fg">Require Email Verification</span>
                    <span className="text-[11px] text-fg-subtle">
                      When enabled, new users must enter a 6-digit code or magic link before accessing the panel. When disabled, accounts are active immediately upon registration.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <div className="pt-0.5">
                    <Checkbox
                      checked={enableRegistration}
                      onCheckedChange={(checked) => setEnableRegistration(checked === true)}
                    />
                  </div>
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

        {/* ── TAB: METADATA ─────────────────────────────────────────── */}
        {activeTab === 'metadata' ? (
          <form onSubmit={handleSaveMetadata} onChange={() => setIsDirty(true)} className="flex flex-col gap-6">
            <div className="flex flex-col gap-6 rounded-panel border border-border bg-surface p-5">
              <div className="flex items-center gap-2 border-b border-border pb-3 text-[13px] font-semibold tracking-wider text-fg uppercase">
                <ShareNetwork size={16} className="text-sun-500" />
                <span>Metadata Settings</span>
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-fg">Description</label>
                <span className="text-[12px] text-fg-subtle">
                  Shown under the title in search results and link previews.
                </span>
                <textarea
                  rows={3}
                  value={metaDescription}
                  onChange={(e) => setMetaDescription(e.target.value)}
                  placeholder="Next-generation cloud infrastructure and VPS management platform."
                  className="rounded-control border border-border bg-surface-2/40 p-3 font-mono text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                />
              </div>

              {/* Row 2: Preview Image & Twitter Card Type */}
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-medium text-fg">Preview Image</label>
                  <span className="text-[12px] text-fg-subtle">
                    Shown in link previews. Must be a PNG or JPEG, not SVG.
                  </span>
                  <input
                    type="text"
                    value={metaPreviewImage}
                    onChange={(e) => setMetaPreviewImage(e.target.value)}
                    placeholder="https://vps.example.com/brand/banner.png"
                    className="h-10 rounded-control border border-border bg-surface-2/40 px-3 font-mono text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-medium text-fg">
                    Twitter Card Type <span className="text-danger">*</span>
                  </label>
                  <div className="relative mt-auto">
                    <select
                      value={metaTwitterCard}
                      onChange={(e) => setMetaTwitterCard(e.target.value)}
                      className="h-10 w-full appearance-none rounded-control border border-border bg-surface-2/40 px-3 text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                    >
                      <option value="summary_large_image">Summary with Large Image</option>
                      <option value="summary">Summary</option>
                      <option value="app">App</option>
                      <option value="player">Player</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Row 3: Theme Color & Search Engine Indexing */}
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-medium text-fg">
                    Theme Color <span className="text-danger">*</span>
                  </label>
                  <span className="text-[12px] text-fg-subtle">
                    Tints the browser UI on mobile and link previews.
                  </span>
                  <input
                    required
                    type="text"
                    value={metaThemeColor}
                    onChange={(e) => setMetaThemeColor(e.target.value)}
                    placeholder="#6c5ce7"
                    className="h-10 rounded-control border border-border bg-surface-2/40 px-3 font-mono text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-3.5 pt-6">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={metaAllowIndexing}
                    onClick={() => setMetaAllowIndexing(!metaAllowIndexing)}
                    className={cn(
                      'relative mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                      metaAllowIndexing ? 'bg-sun-500' : 'bg-surface-3',
                    )}
                  >
                    <span
                      className={cn(
                        'pointer-events-none inline-block size-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                        metaAllowIndexing ? 'translate-x-4' : 'translate-x-0',
                      )}
                    />
                  </button>
                  <div
                    className="flex flex-col cursor-pointer select-none"
                    onClick={() => setMetaAllowIndexing(!metaAllowIndexing)}
                  >
                    <span className="text-[13px] font-medium text-fg">Allow Search Engine Indexing</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4 rounded-panel border border-border bg-surface p-5">
              <div className="flex items-center gap-2 border-b border-border pb-3 text-[13px] font-semibold tracking-wider text-fg uppercase">
                <Scales size={16} className="text-sun-500" />
                <span>Legal Documents</span>
              </div>

              <p className="-mt-2 text-[12px] text-fg-subtle">
                Point the footer links at your own hosted documents. Leave a field blank to hide that
                link in the footer.
              </p>

              {(
                [
                  { label: 'Terms of Service URL', value: legalTermsUrl, set: setLegalTermsUrl },
                  { label: 'Privacy Policy URL', value: legalPrivacyUrl, set: setLegalPrivacyUrl },
                  { label: 'Acceptable Use Policy URL', value: legalAupUrl, set: setLegalAupUrl },
                ] as const
              ).map((field) => (
                <div key={field.label} className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-fg">{field.label}</label>
                  <input
                    type="url"
                    value={field.value}
                    onChange={(e) => field.set(e.target.value)}
                    placeholder="https://example.com/terms"
                    className="h-10 rounded-control border border-border bg-surface-2/40 px-3 font-mono text-[13px] text-fg placeholder:text-fg-subtle focus:border-sun-500 focus:outline-none"
                  />
                </div>
              ))}

              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={saving}
                  onClick={handleSaveLegal}
                  className="gap-1.5 text-[13px]"
                >
                  <FloppyDisk size={16} />
                  {saving ? 'Saving...' : 'Save Legal URLs'}
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" variant="primary" disabled={saving} className="gap-1.5 text-[13px]">
                <FloppyDisk size={16} />
                {saving ? 'Saving...' : 'Save'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={saving}
                onClick={handleAutofillMetadata}
                className="gap-1.5 text-[13px]"
              >
                Autofill
              </Button>
            </div>
          </form>
        ) : null}

        {/* ── TAB 2: STORAGE ───────────────────────────────────────── */}
        {activeTab === 'storage' ? (
          <form onSubmit={handleSaveStorage} onChange={() => setIsDirty(true)} className="flex flex-col gap-6">
            <div className="flex flex-col gap-5 rounded-panel border border-border bg-surface p-5">
              <div className="flex items-center gap-2 border-b border-border pb-3 text-[13px] font-semibold tracking-wider text-fg uppercase">
                <Database size={16} className="text-sun-500" />
                <span>Storage Settings</span>
              </div>

              {/* Driver selector */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-fg">
                  Driver <span className="text-danger">*</span>
                </label>
                <select
                  value={storageDriver}
                  onChange={(e) => setStorageDriver(e.target.value as 'local' | 's3')}
                  className="h-10 rounded-control border border-border bg-surface px-3 text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                >
                  <option value="s3">S3</option>
                  <option value="local">Local (Filesystem)</option>
                </select>
              </div>

              {storageDriver === 's3' ? (
                <>
                  {/* Note on Permissions Banner */}
                  <div className="flex items-start gap-3 rounded-control border border-blue-500/30 bg-blue-500/10 p-4 text-[12px] text-blue-200">
                    <Info size={20} className="shrink-0 text-blue-400 mt-0.5" />
                    <div className="flex flex-col gap-1.5">
                      <span className="font-semibold text-blue-300">Note on Permissions</span>
                      <p className="text-blue-200/90 leading-relaxed">
                        To ensure that the storage backend works correctly, please make sure the following subdirectories are publicly accessible over the "Public URL" you provided:
                      </p>
                      <ul className="flex flex-col gap-1 text-[11px] text-blue-200/80 font-mono mt-1">
                        <li><span className="rounded bg-blue-950/60 px-1.5 py-0.5 text-blue-300">assets/</span> : This is where all admin assets (e.g., icons) will be stored.</li>
                        <li><span className="rounded bg-blue-950/60 px-1.5 py-0.5 text-blue-300">avatars/</span> : This is where all user avatars will be stored.</li>
                        <li><span className="rounded bg-blue-950/60 px-1.5 py-0.5 text-blue-300">publicdata/</span> : This is where extensions can store public data (e.g., images).</li>
                      </ul>
                    </div>
                  </div>

                  {/* S3 Form Inputs */}
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[12px] font-medium text-fg">
                        Access Key <span className="text-danger">*</span>
                      </label>
                      <input
                        required={storageDriver === 's3'}
                        type="text"
                        value={s3AccessKey}
                        onChange={(e) => setS3AccessKey(e.target.value)}
                        placeholder="e.g. 19126d3ed92ea4f..."
                        className="h-10 rounded-control border border-border bg-surface px-3 font-mono text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[12px] font-medium text-fg">
                        Secret Key <span className="text-danger">*</span>
                      </label>
                      <div className="relative">
                        <input
                          required={storageDriver === 's3'}
                          type={showSecretKey ? 'text' : 'password'}
                          value={s3SecretKey}
                          onChange={(e) => setS3SecretKey(e.target.value)}
                          placeholder="••••••••••••••••"
                          className="h-10 w-full rounded-control border border-border bg-surface px-3 pr-10 font-mono text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSecretKey(!showSecretKey)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg"
                        >
                          {showSecretKey ? <EyeSlash size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[12px] font-medium text-fg">
                        Bucket <span className="text-danger">*</span>
                      </label>
                      <input
                        required={storageDriver === 's3'}
                        type="text"
                        value={s3Bucket}
                        onChange={(e) => setS3Bucket(e.target.value)}
                        placeholder="e.g. panel-assets"
                        className="h-10 rounded-control border border-border bg-surface px-3 font-mono text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[12px] font-medium text-fg">
                        Region <span className="text-danger">*</span>
                      </label>
                      <input
                        required={storageDriver === 's3'}
                        type="text"
                        value={s3Region}
                        onChange={(e) => setS3Region(e.target.value)}
                        placeholder="auto or us-east-1"
                        className="h-10 rounded-control border border-border bg-surface px-3 font-mono text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[12px] font-medium text-fg">
                        Public URL <span className="text-danger">*</span>
                      </label>
                      <input
                        required={storageDriver === 's3'}
                        type="url"
                        value={s3PublicUrl}
                        onChange={(e) => setS3PublicUrl(e.target.value)}
                        placeholder="https://assets.example.com"
                        className="h-10 rounded-control border border-border bg-surface px-3 font-mono text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[12px] font-medium text-fg">
                        Endpoint <span className="text-danger">*</span>
                      </label>
                      <input
                        required={storageDriver === 's3'}
                        type="url"
                        value={s3Endpoint}
                        onChange={(e) => setS3Endpoint(e.target.value)}
                        placeholder="https://<account-id>.r2.cloudflarestorage.com"
                        className="h-10 rounded-control border border-border bg-surface px-3 font-mono text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                      />
                    </div>

                    <div className="flex items-center gap-3 pt-1 md:col-span-2">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <Checkbox
                          checked={s3ForcePathStyle}
                          onCheckedChange={(checked) => setS3ForcePathStyle(checked === true)}
                        />
                        <span className="text-[13px] font-medium text-fg">Using path-style URLs</span>
                      </label>
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-control border border-border bg-surface-2/40 p-4 text-[12px] text-fg-subtle">
                  Local storage driver stores uploaded avatars and user assets directly in local server filesystem (`./data/uploads`).
                </div>
              )}
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
          <form onSubmit={handleSaveMail} onChange={() => setIsDirty(true)} className="flex flex-col gap-6">
            <div className="flex flex-col gap-5 rounded-panel border border-border bg-surface p-5">
              <div className="flex items-center gap-2 border-b border-border pb-3 text-[13px] font-semibold tracking-wider text-fg uppercase">
                <At size={16} className="text-sun-500" />
                <span>Email Settings</span>
              </div>

              {/* Provider selector */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-fg">Provider</label>
                <select
                  value={mailProvider}
                  onChange={(e) => setMailProvider(e.target.value as any)}
                  className="h-10 rounded-control border border-border bg-surface px-3 text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                >
                  <option value="solstice">Solstice Cloud Relay (Recommended)</option>
                  <option value="smtp">SMTP</option>
                </select>
              </div>

              {mailProvider === 'solstice' && (
                <div className="flex flex-col gap-3 rounded-control border border-border bg-surface-2 p-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-[12px] font-medium text-fg">Solstice Cloud Relay</span>
                    <span className="text-[11px] leading-relaxed text-fg-subtle">
                      Zero-config transactional email, free for Solstice panels. Sends from <code className="font-mono">noreply@solstice.host</code> via our SES-backed relay — 30 emails/day, 5/minute. No SMTP server or SPF/DKIM setup needed.
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={registeringRelay}
                      onClick={async () => {
                        setRegisteringRelay(true)
                        setSaveError(null)
                        try {
                          const res = await api.adminRegisterMailRelay()
                          if (res.ok) {
                            setRelayToken(res.data.token)
                            setTestMailResult({ ok: true, message: 'Relay token registered! Remember to save.' })
                          } else {
                            setTestMailResult({ ok: false, message: res.error?.message || 'Relay registration failed.' })
                          }
                        } finally {
                          setRegisteringRelay(false)
                        }
                      }}
                    >
                      {registeringRelay ? 'Registering...' : relayToken ? 'Re-register Token' : 'Register Instance'}
                    </Button>
                    {relayToken && (
                      <span className="truncate font-mono text-[11px] text-fg-subtle" title={relayToken}>
                        {relayToken.slice(0, 12)}••••••••
                      </span>
                    )}
                  </div>
                </div>
              )}

              {mailProvider === 'smtp' && (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  {/* Row 1: Host and Port */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[12px] font-medium text-fg">
                      Host <span className="text-danger">*</span>
                    </label>
                    <input
                      required={mailProvider === 'smtp'}
                      type="text"
                      value={smtpHost}
                      onChange={(e) => setSmtpHost(e.target.value)}
                      placeholder="smtp.example.com"
                      className="h-10 rounded-control border border-border bg-surface px-3 font-mono text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[12px] font-medium text-fg">
                      Port <span className="text-danger">*</span>
                    </label>
                    <input
                      required={mailProvider === 'smtp'}
                      type="number"
                      value={smtpPort}
                      onChange={(e) => setSmtpPort(Number(e.target.value))}
                      placeholder="587"
                      className="h-10 rounded-control border border-border bg-surface px-3 font-mono text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                    />
                  </div>

                  {/* Row 2: TLS Mode and Skip Cert Validation */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[12px] font-medium text-fg">
                      TLS Mode <span className="text-danger">*</span>
                    </label>
                    <select
                      value={tlsMode}
                      onChange={(e) => setTlsMode(e.target.value as any)}
                      className="h-10 rounded-control border border-border bg-surface px-3 text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                    >
                      <option value="STARTTLS">STARTTLS</option>
                      <option value="TLS">SSL/TLS</option>
                      <option value="None">None</option>
                    </select>
                  </div>

                  <div className="flex flex-col justify-end pb-2">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={skipCertValidation}
                        onClick={() => setSkipCertValidation(!skipCertValidation)}
                        className={cn(
                          'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                          skipCertValidation ? 'bg-sun-500' : 'bg-surface-3',
                        )}
                      >
                        <span
                          className={cn(
                            'pointer-events-none inline-block size-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                            skipCertValidation ? 'translate-x-4' : 'translate-x-0',
                          )}
                        />
                      </button>
                      <span className="text-[12px] font-medium text-fg">Skip Certificate Validation</span>
                    </label>
                  </div>

                  {/* Row 3: HELO/EHLO Domain and Username */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex flex-col">
                      <label className="text-[12px] font-medium text-fg">HELO/EHLO Domain</label>
                      <span className="text-[11px] text-fg-subtle leading-tight mt-0.5">
                        Domain sent in the HELO/EHLO greeting. Some providers, such as Google Workspace, reject the default.
                      </span>
                    </div>
                    <input
                      type="text"
                      value={heloDomain}
                      onChange={(e) => setHeloDomain(e.target.value)}
                      placeholder="HELO/EHLO Domain"
                      className="h-10 rounded-control border border-border bg-surface px-3 font-mono text-[13px] text-fg focus:border-sun-500 focus:outline-none mt-1"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[12px] font-medium text-fg">Username</label>
                    <input
                      type="text"
                      value={smtpUser}
                      onChange={(e) => setSmtpUser(e.target.value)}
                      placeholder="smtp-user@example.com"
                      className="h-10 rounded-control border border-border bg-surface px-3 font-mono text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                    />
                  </div>

                  {/* Row 4: Password and From Address */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[12px] font-medium text-fg">Password</label>
                    <div className="relative">
                      <input
                        type={showSmtpPass ? 'text' : 'password'}
                        value={smtpPass}
                        onChange={(e) => setSmtpPass(e.target.value)}
                        placeholder="••••••••••••••••"
                        className="h-10 w-full rounded-control border border-border bg-surface px-3 pr-10 font-mono text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSmtpPass(!showSmtpPass)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg"
                      >
                        {showSmtpPass ? <EyeSlash size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[12px] font-medium text-fg">
                      From Address <span className="text-danger">*</span>
                    </label>
                    <input
                      required={mailProvider === 'smtp'}
                      type="email"
                      value={mailFrom}
                      onChange={(e) => setMailFrom(e.target.value)}
                      placeholder="no-reply@example.com"
                      className="h-10 rounded-control border border-border bg-surface px-3 font-mono text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                    />
                  </div>

                  {/* Row 5: From Name */}
                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <label className="text-[12px] font-medium text-fg">From Name</label>
                    <input
                      type="text"
                      value={mailFromName}
                      onChange={(e) => setMailFromName(e.target.value)}
                      placeholder="VPS Panel"
                      className="h-10 rounded-control border border-border bg-surface px-3 text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {testMailResult ? (
                <div
                  className={cn(
                    'flex items-center gap-2 rounded-control p-3 text-[13px]',
                    testMailResult.ok
                      ? 'border border-green-500/30 bg-green-500/10 text-green-300'
                      : 'border border-danger/30 bg-danger/10 text-danger',
                  )}
                >
                  {testMailResult.ok ? <Check size={16} /> : <Info size={16} />}
                  <span>{testMailResult.message}</span>
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" variant="primary" disabled={saving} className="gap-1.5 text-[13px]">
                <FloppyDisk size={16} />
                {saving ? 'Saving...' : 'Save'}
              </Button>
              {mailProvider !== 'none' && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={saving || testingMail}
                  onClick={handleTestEmail}
                  className="gap-1.5 text-[13px]"
                >
                  <PaperPlaneTilt size={16} />
                  {testingMail ? 'Sending Test Email...' : 'Send Test Email'}
                </Button>
              )}
            </div>
          </form>
        ) : null}

        {/* ── TAB: CAPTCHA ─────────────────────────────────────────── */}
        {activeTab === 'captcha' ? (
          <form onSubmit={handleSaveCaptcha} onChange={() => setIsDirty(true)} className="flex flex-col gap-6">
            <div className="flex flex-col gap-6 rounded-panel border border-border bg-surface p-5">
              <div className="flex items-center gap-2 border-b border-border pb-3 text-[13px] font-semibold tracking-wider text-fg uppercase">
                <Robot size={16} className="text-sun-500" />
                <span>Captcha Settings</span>
              </div>

              {/* Provider dropdown */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-fg">Provider</label>
                <select
                  value={captchaProvider}
                  onChange={(e) => setCaptchaProvider(e.target.value as any)}
                  className="h-10 rounded-control border border-border bg-surface px-3 text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                >
                  <option value="turnstile">Turnstile</option>
                  <option value="recaptcha_v2">reCAPTCHA v2</option>
                  <option value="recaptcha_v3">reCAPTCHA v3</option>
                  <option value="hcaptcha">hCaptcha</option>
                  <option value="friendly_captcha">Friendly Captcha</option>
                  <option value="trycap">TryCap (self-hosted Cap)</option>
                </select>
              </div>

              {/* Site Key & Secret Key */}
              {captchaProvider !== 'none' && (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[12px] font-medium text-fg">
                      Site Key <span className="text-danger">*</span>
                    </label>
                    <input
                      required
                      type="text"
                      value={captchaSiteKey}
                      onChange={(e) => setCaptchaSiteKey(e.target.value)}
                      placeholder="0x4AAAAAAACKZZ1_5cafrrTs"
                      className="h-10 rounded-control border border-border bg-surface px-3 font-mono text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[12px] font-medium text-fg">
                      Secret Key <span className="text-danger">*</span>
                    </label>
                    <div className="relative">
                      <input
                        required
                        type={showCaptchaSecretKey ? 'text' : 'password'}
                        value={captchaSecretKey}
                        onChange={(e) => setCaptchaSecretKey(e.target.value)}
                        placeholder="••••••••••••••••"
                        className="h-10 w-full rounded-control border border-border bg-surface px-3 pr-10 font-mono text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCaptchaSecretKey(!showCaptchaSecretKey)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg"
                      >
                        {showCaptchaSecretKey ? <EyeSlash size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {captchaProvider === 'trycap' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-fg">
                    Cap Instance URL <span className="text-danger">*</span>
                  </label>
                  <input
                    required
                    type="url"
                    value={captchaApiUrl}
                    onChange={(e) => setCaptchaApiUrl(e.target.value)}
                    placeholder="https://cap.example.com"
                    className="h-10 rounded-control border border-border bg-surface px-3 font-mono text-[13px] text-fg placeholder:text-fg-subtle focus:border-sun-500 focus:outline-none"
                  />
                  <span className="text-[11px] text-fg-subtle">
                    Public base URL of your Cap Standalone server (no trailing slash). The widget
                    and verification both use it, plus your site key.
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" variant="primary" disabled={saving} className="gap-1.5 text-[13px]">
                <FloppyDisk size={16} />
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </form>
        ) : null}

        {/* ── TAB 4: WEBAUTHN ──────────────────────────────────────── */}
        {activeTab === 'webauthn' ? (
          <form onSubmit={handleSaveWebauthn} onChange={() => setIsDirty(true)} className="flex flex-col gap-6">
            <div className="flex flex-col gap-6 rounded-panel border border-border bg-surface p-5">
              <div className="flex items-center gap-2 border-b border-border pb-3 text-[13px] font-semibold tracking-wider text-fg uppercase">
                <Fingerprint size={16} className="text-sun-500" />
                <span>Webauthn Settings</span>
              </div>

              {/* Row 1: Toggles */}
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* Option 1: Enable Security Keys */}
                <div className="flex items-start gap-3.5">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enableSecurityKeys}
                    onClick={() => setEnableSecurityKeys(!enableSecurityKeys)}
                    className={cn(
                      'relative mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                      enableSecurityKeys ? 'bg-sun-500' : 'bg-surface-3',
                    )}
                  >
                    <span
                      className={cn(
                        'pointer-events-none inline-block size-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                        enableSecurityKeys ? 'translate-x-4' : 'translate-x-0',
                      )}
                    />
                  </button>
                  <div
                    className="flex flex-col cursor-pointer select-none"
                    onClick={() => setEnableSecurityKeys(!enableSecurityKeys)}
                  >
                    <span className="text-[13px] font-medium text-fg">Enable Security Keys</span>
                    <span className="text-[12px] text-fg-subtle">
                      Allow users to register and sign in with security keys. Existing keys are kept and remain visible, but cannot be used to sign in while this is off.
                    </span>
                  </div>
                </div>

                {/* Option 2: Allow Usernameless Login */}
                <div className="flex items-start gap-3.5">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={allowUsernamelessLogin}
                    onClick={() => setAllowUsernamelessLogin(!allowUsernamelessLogin)}
                    className={cn(
                      'relative mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                      allowUsernamelessLogin ? 'bg-sun-500' : 'bg-surface-3',
                    )}
                  >
                    <span
                      className={cn(
                        'pointer-events-none inline-block size-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                        allowUsernamelessLogin ? 'translate-x-4' : 'translate-x-0',
                      )}
                    />
                  </button>
                  <div
                    className="flex flex-col cursor-pointer select-none"
                    onClick={() => setAllowUsernamelessLogin(!allowUsernamelessLogin)}
                  >
                    <span className="text-[13px] font-medium text-fg">Allow Usernameless Login</span>
                    <span className="text-[12px] text-fg-subtle">
                      Let users store passkeys on their device and pick one from a list instead of typing a username.
                    </span>
                  </div>
                </div>
              </div>

              {/* Row 2: RP Id & RP Origin */}
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-fg">
                    RP Id <span className="text-danger">*</span>
                  </label>
                  <input
                    required
                    type="text"
                    value={rpId}
                    onChange={(e) => setRpId(e.target.value)}
                    placeholder="vps.example.com"
                    className="h-10 rounded-control border border-border bg-surface-2/40 px-3 font-mono text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-fg">
                    RP Origin <span className="text-danger">*</span>
                  </label>
                  <input
                    required
                    type="text"
                    value={webauthnOrigin}
                    onChange={(e) => setWebauthnOrigin(e.target.value)}
                    placeholder="https://vps.example.com"
                    className="h-10 rounded-control border border-border bg-surface-2/40 px-3 font-mono text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Row 3: Timeouts */}
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-fg">
                    Authentication Timeout (seconds) <span className="text-danger">*</span>
                  </label>
                  <input
                    required
                    type="number"
                    min="10"
                    max="3600"
                    value={authTimeout}
                    onChange={(e) => setAuthTimeout(Number(e.target.value))}
                    className="h-10 rounded-control border border-border bg-surface-2/40 px-3 font-mono text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-fg">
                    Registration Timeout (seconds) <span className="text-danger">*</span>
                  </label>
                  <input
                    required
                    type="number"
                    min="10"
                    max="3600"
                    value={regTimeout}
                    onChange={(e) => setRegTimeout(Number(e.target.value))}
                    className="h-10 rounded-control border border-border bg-surface-2/40 px-3 font-mono text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" variant="primary" disabled={saving} className="gap-1.5 text-[13px]">
                <FloppyDisk size={16} />
                {saving ? 'Saving...' : 'Save'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={saving}
                onClick={handleAutofillWebauthn}
                className="gap-1.5 text-[13px]"
              >
                Autofill
              </Button>
            </div>
          </form>
        ) : null}

        {/* ── TAB: NETWORK ─────────────────────────────────────────── */}
        {activeTab === 'network' ? (
          <form onSubmit={handleSaveNetwork} onChange={() => setIsDirty(true)} className="flex flex-col gap-6">
            <div className="flex flex-col gap-4 rounded-panel border border-border bg-surface p-5">
              <div className="flex items-center gap-2 border-b border-border pb-3 text-[13px] font-semibold tracking-wider text-fg uppercase">
                <ArrowsDownUp size={16} className="text-sun-500" />
                <span>Port Forwarding</span>
              </div>

              <p className="text-[12px] text-fg-subtle">
                When a user enables direct SSH on a server, the panel picks a random free
                host port from this range and proxies it to the container's SSH port (NAT).
              </p>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-fg">
                    Range Start <span className="text-danger">*</span>
                  </label>
                  <input
                    required
                    type="number"
                    min="1024"
                    max="65535"
                    value={portRangeStart}
                    onChange={(e) => setPortRangeStart(Number(e.target.value))}
                    className="h-10 rounded-control border border-border bg-surface-2/40 px-3 font-mono text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                  />
                  <span className="text-[11px] text-fg-subtle">First assignable host port</span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-fg">
                    Range End <span className="text-danger">*</span>
                  </label>
                  <input
                    required
                    type="number"
                    min="1024"
                    max="65535"
                    value={portRangeEnd}
                    onChange={(e) => setPortRangeEnd(Number(e.target.value))}
                    className="h-10 rounded-control border border-border bg-surface-2/40 px-3 font-mono text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                  />
                  <span className="text-[11px] text-fg-subtle">Last assignable host port</span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-fg">
                    Default Forward Limit <span className="text-danger">*</span>
                  </label>
                  <input
                    required
                    type="number"
                    min="0"
                    max="1000"
                    value={defaultForwardLimit}
                    onChange={(e) => setDefaultForwardLimit(Number(e.target.value))}
                    className="h-10 rounded-control border border-border bg-surface-2/40 px-3 font-mono text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                  />
                  <span className="text-[11px] text-fg-subtle">
                    Max port forwards per user unless overridden on their account. 0 blocks all forwards.
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" variant="primary" disabled={saving} className="gap-1.5 text-[13px]">
                <FloppyDisk size={16} />
                {saving ? 'Saving...' : 'Save Network Settings'}
              </Button>
            </div>
          </form>
        ) : null}

        {/* ── TAB 5: RATELIMITS ────────────────────────────────────── */}
        {activeTab === 'ratelimits' ? (
          <form onSubmit={handleSaveRatelimits} onChange={() => setIsDirty(true)} className="flex flex-col gap-6">
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
