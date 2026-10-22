import { ArrowLeft, FloppyDisk } from '@phosphor-icons/react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { AppShell } from '@/components/app-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { api } from '@/lib/api'

export function AdminUserCreatePage() {
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [externalId, setExternalId] = useState('')

  const [isAdmin, setIsAdmin] = useState(false)
  const [isFrozen, setIsFrozen] = useState(false)
  const [isSuspended, setIsSuspended] = useState(false)
  const [emailVerified, setEmailVerified] = useState(true)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !displayName.trim()) return

    setSaving(true)
    setError(null)

    const res = await api.adminCreateUser({
      email: email.trim(),
      name: displayName.trim(),
      externalId: externalId.trim() || null,
      isAdmin,
      isFrozen,
      isSuspended,
      emailVerified,
    })

    if (res.ok) {
      navigate(`/admin/users/${res.data.id}`)
    } else {
      setError(res.error.message || 'Failed to create user.')
    }
    setSaving(false)
  }

  return (
    <AppShell
      title="Create User"
      description="Provision a new user account with identity details and access state."
    >
      <div className="flex w-full flex-col gap-6">
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
            <span className="text-[12px] font-medium text-fg">New User</span>
          </div>
        </div>

        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-fg">Create User</h1>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="flex flex-col gap-6 rounded-panel border border-border bg-surface p-6 shadow-2xs">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <label className="text-[12px] font-semibold text-fg">
                  Email <span className="text-danger">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[13px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
                />
                <span className="mt-1 block text-[11px] text-fg-subtle">
                  The new account will receive an email notification.
                </span>
              </div>

              <div>
                <label className="text-[12px] font-semibold text-fg">
                  Display Name <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Lumi Aetheria"
                  className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 text-[13px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
                />
              </div>

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
            </div>

            <div className="mt-2 grid grid-cols-1 gap-5 md:grid-cols-2 border-t border-border pt-5">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <div className="pt-0.5">
                  <Checkbox
                    checked={isAdmin}
                    onCheckedChange={(checked) => setIsAdmin(checked === true)}
                  />
                </div>
                <div className="flex flex-col">
                  <span className="text-[13px] font-semibold text-fg">Admin</span>
                  <span className="text-[11px] text-fg-subtle">
                    Admin users have full, unrestricted access to everything on the panel.
                  </span>
                </div>
              </label>

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

              <label className="flex items-start gap-3 cursor-pointer select-none">
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

              <label className="flex items-start gap-3 cursor-pointer select-none">
                <div className="pt-0.5">
                  <Checkbox
                    checked={emailVerified}
                    onCheckedChange={(checked) => setEmailVerified(checked === true)}
                  />
                </div>
                <div className="flex flex-col">
                  <span className="text-[13px] font-semibold text-fg">Email Verified</span>
                  <span className="text-[11px] text-fg-subtle">
                    Skip email verification so the account can sign in immediately.
                  </span>
                </div>
              </label>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2.5 border-t border-border pt-5">
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate('/admin/users')}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={saving} className="gap-1.5">
                <FloppyDisk size={16} />
                {saving ? 'Creating...' : 'Create User'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </AppShell>
  )
}
