import {
  ArrowClockwise,
  ArrowLeft,
  ArrowRight,
  ClockCounterClockwise,
  FloppyDisk,
  Gear,
  HardDrives,
  LinkSimple,
  Play,
  Plus,
  Square,
  Trash,
} from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { AppShell } from '@/components/app-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { api, type AdminInstance, type AdminUser, type OAuthLink, type OAuthProvider } from '@/lib/api'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'

export function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user: currentUser } = useSession()

  const [user, setUser] = useState<AdminUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [disabling2FA, setDisabling2FA] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Active tab state
  const [activeTab, setActiveTab] = useState<'general' | 'servers' | 'oauth' | 'activity'>('general')

  // Form states matching screenshot
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [externalId, setExternalId] = useState('')

  // Flags
  const [isAdmin, setIsAdmin] = useState(false)
  const [isFrozen, setIsFrozen] = useState(false)
  const [isSuspended, setIsSuspended] = useState(false)

  // Port forward quota ('' = panel default)
  const [forwardLimit, setForwardLimit] = useState('')

  // Dialog state
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)

  // Activity tab state
  const [activities, setActivities] = useState<Array<{ id: string; action: string; details: string; ipAddress: string | null; createdAt: string }>>([])
  const [activityTotal, setActivityTotal] = useState(0)
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState<string | null>(null)

  // OAuth links tab state
  const [userServers, setUserServers] = useState<AdminInstance[]>([])
  const [serversLoading, setServersLoading] = useState(false)
  const [serversError, setServersError] = useState<string | null>(null)
  const [serversActing, setServersActing] = useState(false)

  const [oauthLinks, setOauthLinks] = useState<OAuthLink[]>([])
  const [oauthLinksLoading, setOauthLinksLoading] = useState(false)
  const [oauthLinksError, setOauthLinksError] = useState<string | null>(null)
  const [oauthProviders, setOauthProviders] = useState<OAuthProvider[]>([])
  const [isAddLinkOpen, setIsAddLinkOpen] = useState(false)
  const [addProviderId, setAddProviderId] = useState('')
  const [addIdentifier, setAddIdentifier] = useState('')
  const [linkSaving, setLinkSaving] = useState(false)
  const [removingLinkId, setRemovingLinkId] = useState<string | null>(null)

  async function loadOAuthLinks(userId: string) {
    setOauthLinksLoading(true)
    setOauthLinksError(null)
    const [linksRes, providersRes] = await Promise.all([
      api.adminGetUserOAuthLinks(userId),
      api.adminListOAuthProviders(),
    ])
    if (linksRes.ok) {
      setOauthLinks(linksRes.data.links || [])
    } else {
      setOauthLinksError(linksRes.error.message || 'Failed to load OAuth links.')
    }
    if (providersRes.ok) setOauthProviders(providersRes.data || [])
    setOauthLinksLoading(false)
  }

  async function handleAddLink(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !addProviderId.trim() || !addIdentifier.trim()) return
    setLinkSaving(true)
    const res = await api.adminAddUserOAuthLink(id, {
      providerId: addProviderId,
      identifier: addIdentifier.trim(),
    })
    if (res.ok) {
      setIsAddLinkOpen(false)
      setAddProviderId('')
      setAddIdentifier('')
      await loadOAuthLinks(id)
    } else {
      setOauthLinksError(res.error.message || 'Failed to add link.')
    }
    setLinkSaving(false)
  }

  async function loadUserServers(userId: string) {
    setServersLoading(true)
    setServersError(null)
    const res = await api.adminListInstances()
    if (res.ok) {
      setUserServers((res.data || []).filter((s) => s.ownerId === userId))
    } else {
      setServersError(res.error.message || 'Failed to load servers.')
    }
    setServersLoading(false)
  }

  async function handleServerAction(server: AdminInstance, action: 'start' | 'stop' | 'restart') {
    setServersActing(true)
    setServersError(null)
    const res = await api.adminInstanceAction(server.id, action)
    if (res.ok) {
      setSuccessMsg(`${action} sent to "${server.name}".`)
      setTimeout(() => setSuccessMsg(null), 3500)
      if (id) await loadUserServers(id)
    } else {
      setServersError(res.error.message || `Failed to ${action} server.`)
    }
    setServersActing(false)
  }

  async function handleRemoveLink(linkId: string) {
    if (!id) return
    setRemovingLinkId(linkId)
    const res = await api.adminDeleteUserOAuthLink(id, linkId)
    if (res.ok) {
      setOauthLinks((prev) => prev.filter((l) => l.id !== linkId))
    } else {
      setOauthLinksError(res.error.message || 'Failed to remove link.')
    }
    setRemovingLinkId(null)
  }

  const isCurrent = currentUser?.id === id

  useEffect(() => {
    if (!id) return
    let active = true

    async function loadUser() {
      if (!id) return
      setLoading(true)
      setError(null)
      const res = await api.adminGetUser(id)
      if (!active) return

      if (res.ok) {
        const u = res.data
        setUser(u)
        setEmail(u.email)
        setDisplayName(u.name || '')
        setExternalId(u.externalId || '')
        setIsAdmin(Boolean(u.isAdmin))
        setIsFrozen(Boolean(u.isFrozen))
        setIsSuspended(Boolean(u.isSuspended))
        setForwardLimit(u.portForwardLimit === null || u.portForwardLimit === undefined ? '' : String(u.portForwardLimit))
      } else {
        setError(res.error.message || 'Failed to load user.')
      }
      setLoading(false)
    }

    void loadUser()
    return () => {
      active = false
    }
  }, [id])

  useEffect(() => {
    if (activeTab !== 'activity' || !id) return
    const userId = id
    let active = true
    async function loadActivity() {
      setActivityLoading(true)
      setActivityError(null)
      const res = await api.adminGetUserActivity(userId, 50, 0)
      if (!active) return
      if (res.ok) {
        setActivities(res.data.activities || [])
        setActivityTotal(res.data.total || 0)
      } else {
        setActivityError(res.error.message || 'Failed to load activity.')
      }
      setActivityLoading(false)
    }
    void loadActivity()
    return () => {
      active = false
    }
  }, [activeTab, id])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!id) return

    setSaving(true)
    setError(null)

    const trimmedName = displayName.trim() || user?.name || email.trim()
    const [derivedFirst, ...derivedRest] = trimmedName.split(/\s+/)
    const derivedLast = derivedRest.join(' ')

    const res = await api.adminUpdateUser(id, {
      name: trimmedName,
      firstName: derivedFirst || null,
      lastName: derivedLast || null,
      externalId: externalId.trim() || null,
      isAdmin,
      isFrozen,
      isSuspended,
      portForwardLimit: forwardLimit.trim() === '' ? null : Math.max(0, Math.floor(Number(forwardLimit))),
    })

    if (res.ok) {
      setSuccessMsg('User profile saved successfully.')
      setTimeout(() => setSuccessMsg(null), 3500)
    } else {
      setError(res.error.message || 'Failed to update user profile.')
    }
    setSaving(false)
  }

  async function handleMarkEmailVerified() {
    if (!id) return
    setSaving(true)
    const res = await api.adminUpdateUser(id, { emailVerified: true })
    if (res.ok) {
      setSuccessMsg('Email marked as verified.')
      if (user) setUser({ ...user, emailVerifiedAt: new Date().toISOString() })
      setTimeout(() => setSuccessMsg(null), 3500)
    } else {
      setError(res.error.message || 'Failed to verify email.')
    }
    setSaving(false)
  }

  async function handleDisable2FA() {
    if (!id) return
    setDisabling2FA(true)
    setError(null)
    const res = await api.adminDisableUser2FA(id)
    if (res.ok) {
      setSuccessMsg(
        res.data.removed > 0
          ? `Two-factor disabled, ${res.data.removed} passkey(s) removed.`
          : 'No passkeys to remove.',
      )
      if (user) setUser({ ...user, passkeyCount: 0 })
      setTimeout(() => setSuccessMsg(null), 3500)
    } else {
      setError(res.error.message || 'Failed to disable two-factor.')
    }
    setDisabling2FA(false)
  }

  async function handleDeleteUser() {
    if (!id) return
    setSaving(true)
    const res = await api.adminDeleteUser(id)
    if (res.ok) {
      navigate('/admin/users')
    } else {
      setError(res.error.message || 'Failed to delete user.')
    }
    setSaving(false)
  }

  return (
    <AppShell
      title={user ? user.name : 'User Details'}
      description="Inspect user identity, adjust security access, and configure account state."
    >
      <div className="flex w-full flex-col gap-6">
        {/* Top bar with back navigation */}
        <div className="flex items-center gap-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/admin/users')}
            className="gap-1.5 text-[12px]"
          >
            <ArrowLeft size={14} />
            Back to Users
          </Button>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-wider text-fg-subtle">
              Users &amp; Access
            </span>
            <span className="text-fg-subtle/50">/</span>
            <span className="text-[12px] font-medium text-fg">{user ? user.name : 'User'}</span>
          </div>
        </div>

        {/* User Display Header */}
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-fg">
            {loading ? 'Loading user...' : user?.name || user?.email}
          </h1>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-border">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={cn(
              'flex items-center gap-2 border-b-2 px-3 py-2 text-[13px] font-medium transition-colors select-none',
              activeTab === 'general'
                ? 'border-accent text-accent-text font-semibold'
                : 'border-transparent text-fg-subtle hover:text-fg',
            )}
          >
            <Gear size={15} />
            General
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('servers')
              if (id) void loadUserServers(id)
            }}
            className={cn(
              'flex items-center gap-2 border-b-2 px-3 py-2 text-[13px] font-medium transition-colors select-none',
              activeTab === 'servers'
                ? 'border-accent text-accent-text font-semibold'
                : 'border-transparent text-fg-subtle hover:text-fg',
            )}
          >
            <HardDrives size={15} />
            Servers
            {userServers.length > 0 && (
              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-mono text-fg-subtle">
                {userServers.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('oauth')
              if (id) void loadOAuthLinks(id)
            }}
            className={cn(
              'flex items-center gap-2 border-b-2 px-3 py-2 text-[13px] font-medium transition-colors select-none',
              activeTab === 'oauth'
                ? 'border-accent text-accent-text font-semibold'
                : 'border-transparent text-fg-subtle hover:text-fg',
            )}
          >
            <LinkSimple size={15} />
            OAuth Links
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('activity')}
            className={cn(
              'flex items-center gap-2 border-b-2 px-3 py-2 text-[13px] font-medium transition-colors select-none',
              activeTab === 'activity'
                ? 'border-accent text-accent-text font-semibold'
                : 'border-transparent text-fg-subtle hover:text-fg',
            )}
          >
            <ClockCounterClockwise size={15} />
            Activity
          </button>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}
        {successMsg && <Alert tone="success">{successMsg}</Alert>}

        {loading ? (
          <div className="rounded-panel border border-border bg-surface p-12 text-center text-[13px] text-fg-subtle">
            Loading user profile...
          </div>
        ) : activeTab === 'general' ? (
          <form onSubmit={handleSave} className="flex flex-col gap-6">
            <div className="flex flex-col gap-6 rounded-panel border border-border bg-surface p-6 shadow-2xs">
              <h2 className="text-[18px] font-bold text-fg">Update User</h2>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {/* Email */}
                <div>
                  <label className="text-[12px] font-semibold text-fg">
                    Email <span className="text-danger">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    disabled
                    placeholder="user@example.com"
                    className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-surface-2/60 px-3 font-mono text-[13px] text-fg/80 cursor-not-allowed opacity-80"
                  />
                  <span className="mt-1 block text-[11px] text-fg-subtle">
                    Email cannot be changed directly by administrator.
                  </span>
                </div>

                {/* Display Name */}
                <div>
                  <label className="text-[12px] font-semibold text-fg">
                    Display Name <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Lumi"
                    className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 text-[13px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
                  />
                </div>

                {/* External ID */}
                <div>
                  <label className="text-[12px] font-semibold text-fg">External ID</label>
                  <input
                    type="text"
                    value={externalId}
                    onChange={(e) => setExternalId(e.target.value)}
                    placeholder="External ID"
                    className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[13px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
                  />
                </div>

                {/* Port Forward Limit */}
                <div>
                  <label className="text-[12px] font-semibold text-fg">Port Forward Limit</label>
                  <input
                    type="number"
                    min="0"
                    max="1000"
                    value={forwardLimit}
                    onChange={(e) => setForwardLimit(e.target.value)}
                    placeholder="Panel default"
                    className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[13px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
                  />
                  <span className="mt-1 block text-[11px] text-fg-subtle">
                    {user?.forwardCount ?? 0} in use · blank uses the panel default · 0 blocks all forwards.
                  </span>
                </div>
              </div>

              {/* Toggles */}
              <div className="mt-2 grid grid-cols-1 gap-5 md:grid-cols-2 border-t border-border pt-5">
                {/* Admin Switch */}
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <div className="pt-0.5">
                    <Checkbox
                      checked={isAdmin}
                      disabled={isCurrent}
                      onCheckedChange={(checked) => setIsAdmin(checked === true)}
                    />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[13px] font-semibold text-fg flex items-center gap-1.5">
                      Admin
                      {isCurrent && (
                        <span className="text-[10px] font-normal text-fg-subtle">(You)</span>
                      )}
                    </span>
                    <span className="text-[11px] text-fg-subtle">
                      Admin users have full, unrestricted access to everything on the panel.
                    </span>
                  </div>
                </label>

                {/* Frozen Switch */}
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <div className="pt-0.5">
                    <Checkbox
                      checked={isFrozen}
                      onCheckedChange={(checked) => setIsFrozen(checked === true)}
                    />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[13px] font-semibold text-fg">Frozen</span>
                    <span className="text-[11px] text-fg-subtle">
                      Frozen users cannot make any changes to their account information.
                    </span>
                  </div>
                </label>

                {/* Suspended Switch */}
                <label className="flex items-start gap-3 cursor-pointer select-none md:col-span-2">
                  <div className="pt-0.5">
                    <Checkbox
                      checked={isSuspended}
                      onCheckedChange={(checked) => setIsSuspended(checked === true)}
                    />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[13px] font-semibold text-fg">Suspended</span>
                    <span className="text-[11px] text-fg-subtle">
                      Suspended users cannot access the panel in any meaningful way.
                    </span>
                  </div>
                </label>
              </div>

              {/* Action Buttons Row */}
              <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-border pt-5">
                <Button type="submit" variant="primary" disabled={saving} className="gap-1.5">
                  <FloppyDisk size={16} />
                  {saving ? 'Saving...' : 'Save'}
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  disabled={saving || disabling2FA || (user?.passkeyCount ?? 0) === 0}
                  onClick={handleDisable2FA}
                  title={
                    (user?.passkeyCount ?? 0) === 0
                      ? 'No passkeys registered on this account'
                      : `Remove all ${user?.passkeyCount} passkey(s) from this account`
                  }
                >
                  {disabling2FA
                    ? 'Disabling...'
                    : (user?.passkeyCount ?? 0) > 0
                      ? `Disable Two-Factor (${user?.passkeyCount})`
                      : 'Disable Two-Factor'}
                </Button>

                {!user?.emailVerifiedAt && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={saving}
                    onClick={handleMarkEmailVerified}
                  >
                    Mark Email Verified
                  </Button>
                )}

                <Button
                  type="button"
                  variant="danger"
                  disabled={saving || isCurrent}
                  onClick={() => setIsDeleteOpen(true)}
                  className="ml-auto gap-1.5"
                >
                  <Trash size={15} />
                  Delete
                </Button>
              </div>
            </div>
          </form>
        ) : activeTab === 'servers' ? (
          /* Servers Tab */
          <div className="flex flex-col gap-4 rounded-panel border border-border bg-surface p-6 shadow-2xs">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-bold text-fg">Servers</h2>
              <span className="font-mono text-[11px] text-fg-subtle">
                {userServers.length} server{userServers.length === 1 ? '' : 's'}
              </span>
            </div>

            {serversError && <Alert tone="danger">{serversError}</Alert>}

            {serversLoading ? (
              <div className="p-8 text-center text-[13px] text-fg-subtle">
                Loading servers...
              </div>
            ) : userServers.length === 0 ? (
              <div className="text-[13px] text-fg-subtle">
                No servers allocated to this user.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-control border border-border">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-border bg-surface-2/40 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                      <th className="px-4 py-2.5">Server</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5">Network</th>
                      <th className="px-4 py-2.5 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {userServers.map((s) => (
                      <tr key={s.id} className="transition-colors hover:bg-surface-2/30">
                        <td className="px-4 py-3">
                          <div className="font-medium text-fg">{s.name}</div>
                          <div className="text-[11px] text-fg-subtle">
                            {s.type.toUpperCase()} · {s.os} · {s.cores}c · {s.memory} · {s.disk}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              'inline-flex items-center rounded-control border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider',
                              s.status === 'running'
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                                : 'border-border bg-surface-2/60 text-fg-subtle',
                            )}
                          >
                            {s.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-[12px] text-fg-subtle">
                          {s.ip4}
                          <div className="text-[11px]">{s.nodeName || '—'}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {s.status === 'running' ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={serversActing}
                                  onClick={() => void handleServerAction(s, 'restart')}
                                  className="h-7 px-2 text-[11px]"
                                  title="Restart"
                                >
                                  <ArrowClockwise size={13} />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={serversActing}
                                  onClick={() => void handleServerAction(s, 'stop')}
                                  className="h-7 px-2 text-[11px]"
                                  title="Stop"
                                >
                                  <Square size={13} weight="fill" />
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={serversActing}
                                onClick={() => void handleServerAction(s, 'start')}
                                className="h-7 px-2 text-[11px] text-emerald-400"
                                title="Start"
                              >
                                <Play size={13} weight="fill" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/admin/servers/${s.id}`)}
                              className="h-7 px-2 text-[11px]"
                              aria-label={`Manage ${s.name}`}
                            >
                              <ArrowRight size={14} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : activeTab === 'oauth' ? (
          /* OAuth Links Tab */
          <div className="flex flex-col gap-4 rounded-panel border border-border bg-surface p-6 shadow-2xs">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-bold text-fg">OAuth Links</h2>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsAddLinkOpen(true)}
                className="gap-1.5 text-[12px]"
              >
                <Plus size={14} weight="bold" />
                Add
              </Button>
            </div>

            {oauthLinksError && <Alert tone="danger">{oauthLinksError}</Alert>}

            {oauthLinksLoading ? (
              <div className="p-8 text-center text-[13px] text-fg-subtle">
                Loading OAuth links...
              </div>
            ) : oauthLinks.length === 0 ? (
              <div className="text-[13px] text-fg-subtle">
                No provider accounts linked to this user.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-control border border-border">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-border bg-surface-2/40 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                      <th className="px-4 py-2.5">Provider</th>
                      <th className="px-4 py-2.5">Identifier</th>
                      <th className="px-4 py-2.5">Last Used</th>
                      <th className="px-4 py-2.5">Created</th>
                      <th className="px-4 py-2.5 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {oauthLinks.map((link) => (
                      <tr key={link.id} className="transition-colors hover:bg-surface-2/30">
                        <td className="px-4 py-3 font-medium text-fg">{link.providerName}</td>
                        <td className="px-4 py-3 font-mono text-[12px] text-fg-subtle">
                          {link.identifier ?? '—'}
                        </td>
                        <td className="px-4 py-3 font-mono text-[12px] text-fg-subtle">
                          {link.lastUsedAt ? new Date(link.lastUsedAt).toLocaleString() : 'Never'}
                        </td>
                        <td className="px-4 py-3 font-mono text-[12px] text-fg-subtle">
                          {new Date(link.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={removingLinkId === link.id}
                            onClick={() => void handleRemoveLink(link.id)}
                            className="h-7 px-2 text-[11px] gap-1"
                          >
                            <Trash size={13} />
                            {removingLinkId === link.id ? 'Removing...' : 'Remove'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          /* Activity Log Tab */
          <div className="flex flex-col gap-4 rounded-panel border border-border bg-surface p-6 shadow-2xs">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-bold text-fg">Account Activity</h2>
              <span className="font-mono text-[11px] text-fg-subtle">
                {activityTotal} event{activityTotal === 1 ? '' : 's'}
              </span>
            </div>

            {activityLoading ? (
              <div className="p-8 text-center text-[13px] text-fg-subtle">
                Loading activity...
              </div>
            ) : activityError ? (
              <Alert tone="danger">{activityError}</Alert>
            ) : activities.length === 0 ? (
              <div className="text-[13px] text-fg-subtle">
                No recent activity recorded for this user.
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-border rounded-control border border-border">
                {activities.map((a) => (
                  <div key={a.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-col">
                      <span className="font-mono text-[12px] font-semibold text-fg">{a.action}</span>
                      <span className="text-[12px] text-fg-subtle">{a.details}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 font-mono text-[11px] text-fg-subtle">
                      {a.ipAddress && <span>{a.ipAddress}</span>}
                      <span>{new Date(a.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Add OAuth Link Modal */}
        <Dialog open={isAddLinkOpen} onOpenChange={setIsAddLinkOpen}>
          <DialogContent className="max-w-md">
            <DialogTitle>Link OAuth Account</DialogTitle>
            <DialogDescription>
              Attach a provider identity to {user?.email}. Enter the user's identifier at that
              provider (e.g. their Discord user ID).
            </DialogDescription>

            <form onSubmit={handleAddLink} className="mt-4 flex flex-col gap-4">
              <div>
                <label className="text-[12px] font-semibold text-fg">Provider</label>
                <select
                  value={addProviderId}
                  onChange={(e) => setAddProviderId(e.target.value)}
                  required
                  className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 text-[13px] text-fg focus:border-accent focus:outline-none"
                >
                  <option value="">Select a provider...</option>
                  {oauthProviders.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[12px] font-semibold text-fg">Identifier</label>
                <input
                  type="text"
                  required
                  value={addIdentifier}
                  onChange={(e) => setAddIdentifier(e.target.value)}
                  placeholder="e.g. 123456789012345678"
                  className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[13px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
                />
              </div>

              <div className="mt-2 flex justify-end gap-2.5">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsAddLinkOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={linkSaving}>
                  {linkSaving ? 'Linking...' : 'Add Link'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Modal */}
        <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <DialogContent className="max-w-md">
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete user <strong className="text-fg">{user?.email}</strong>?
              All instances and keys associated with this account will be removed.
            </DialogDescription>

            <div className="mt-5 flex justify-end gap-2.5">
              <Button variant="secondary" onClick={() => setIsDeleteOpen(false)}>
                Cancel
              </Button>
              <Button variant="danger" disabled={saving} onClick={handleDeleteUser}>
                {saving ? 'Deleting...' : 'Delete User'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  )
}
