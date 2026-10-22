import {
  ArrowClockwise,
  ArrowRight,
  CheckCircle,
  HardDrives,
  Key,
  MagnifyingGlass,
  Plus,
  ShieldCheck,
  Users,
  X,
} from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { AppShell } from '@/components/app-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { api, type AdminUser } from '@/lib/api'
import { useSession } from '@/lib/session'

export function AdminUsersPage() {
  const navigate = useNavigate()
  const { user: currentUser } = useSession()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function loadUsers() {
    setLoading(true)
    setError(null)
    const res = await api.adminListUsers()
    if (res.ok) {
      setUsers(res.data || [])
    } else {
      setError(res.error.message || 'Failed to load users.')
    }
    setLoading(false)
  }

  useEffect(() => {
    void loadUsers()
  }, [])

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users
    const q = search.toLowerCase()
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        u.name.toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q),
    )
  }, [users, search])

  const totalAdmins = useMemo(() => users.filter((u) => u.isAdmin).length, [users])
  const totalVerified = useMemo(() => users.filter((u) => Boolean(u.emailVerifiedAt)).length, [users])

  return (
    <AppShell
      title="Users"
      description="Manage registered user accounts, administrative permissions, and provisioned instances."
    >
      <div className="flex w-full flex-col gap-6">
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-fg-subtle">
                Users &amp; Access
              </span>
              <span className="text-fg-subtle/50">/</span>
              <span className="text-[12px] font-medium text-fg">Directory</span>
            </div>
            <h1 className="mt-1 text-[28px] font-bold tracking-tight text-fg">Users</h1>
            <p className="text-[13px] text-fg-subtle">
              Inspect user identities, elevate permissions, and review resource footprint.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={loadUsers}
              disabled={loading}
              className="gap-1.5 text-[12px]"
            >
              <ArrowClockwise size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate('/admin/users/new')}
              className="gap-1.5 text-[12px]"
            >
              <Plus size={14} weight="bold" />
              New User
            </Button>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="flex items-center gap-3.5 rounded-panel border border-border bg-surface p-4 shadow-2xs">
            <div className="flex size-10 items-center justify-center rounded-control bg-sun-500/10 text-sun-500">
              <Users size={20} weight="bold" />
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-fg-subtle">Total Registered</span>
              <span className="text-[20px] font-bold tracking-tight text-fg">{users.length}</span>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-panel border border-border bg-surface p-4 shadow-2xs">
            <div className="flex size-10 items-center justify-center rounded-control bg-purple-500/10 text-purple-500">
              <ShieldCheck size={20} weight="bold" />
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-fg-subtle">Administrators</span>
              <span className="text-[20px] font-bold tracking-tight text-fg">{totalAdmins}</span>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-panel border border-border bg-surface p-4 shadow-2xs">
            <div className="flex size-10 items-center justify-center rounded-control bg-emerald-500/10 text-emerald-500">
              <CheckCircle size={20} weight="bold" />
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-fg-subtle">Verified Accounts</span>
              <span className="text-[20px] font-bold tracking-tight text-fg">{totalVerified}</span>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-panel border border-border bg-surface p-4 shadow-2xs">
            <div className="flex size-10 items-center justify-center rounded-control bg-blue-500/10 text-blue-500">
              <HardDrives size={20} weight="bold" />
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-fg-subtle">Active Instances</span>
              <span className="text-[20px] font-bold tracking-tight text-fg">
                {users.reduce((sum, u) => sum + (u.instanceCount || 0), 0)}
              </span>
            </div>
          </div>
        </div>

        {/* Feedback alerts */}
        {error && <Alert tone="danger">{error}</Alert>}

        {/* Search bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-panel border border-border bg-surface p-4">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <MagnifyingGlass
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, or user UUID..."
              className="h-9 w-full rounded-control border border-border bg-surface-2/50 pl-9 pr-8 text-[12px] text-fg placeholder:text-fg-subtle focus:border-sun-500 focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="text-[12px] text-fg-subtle">
            Showing <strong className="font-semibold text-fg">{filteredUsers.length}</strong> of{' '}
            <strong className="font-semibold text-fg">{users.length}</strong> users
          </div>
        </div>

        {/* Users Table */}
        <div className="overflow-x-auto rounded-panel border border-border bg-surface shadow-2xs">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface-2/40 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                <th className="px-5 py-3.5">User</th>
                <th className="px-4 py-3.5">Role</th>
                <th className="px-4 py-3.5">Email Status</th>
                <th className="px-4 py-3.5">Instances</th>
                <th className="px-4 py-3.5">SSH Keys</th>
                <th className="px-4 py-3.5">Registered</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-fg-subtle">
                    <span className="inline-flex items-center gap-2">
                      <ArrowClockwise size={16} className="animate-spin" />
                      Loading users directory...
                    </span>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-fg-subtle">
                    No users found matching query.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isCurrent = currentUser?.id === u.id
                  return (
                    <tr key={u.id} className="transition-colors hover:bg-surface-2/30">
                      {/* User Info */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          {u.avatarUrl ? (
                            <img
                              src={u.avatarUrl}
                              alt=""
                              className="size-8 rounded-full object-cover border border-border"
                            />
                          ) : (
                            <div className="flex size-8 items-center justify-center rounded-full bg-accent/15 text-accent-text font-bold text-[12px]">
                              {u.name.slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-fg">{u.name}</span>
                              {isCurrent && (
                                <span className="rounded bg-sun-500/15 border border-sun-500/30 px-1.5 py-0.2 font-mono text-[9px] font-bold uppercase tracking-wider text-sun-500">
                                  You
                                </span>
                              )}
                            </div>
                            <span className="font-mono text-[11px] text-fg-subtle">{u.email}</span>
                          </div>
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td className="px-4 py-4">
                        {u.isAdmin ? (
                          <span className="inline-flex items-center gap-1 rounded-control border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[11px] font-semibold text-purple-400">
                            <ShieldCheck size={12} weight="bold" />
                            Admin
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-control border border-border bg-surface-2/60 px-2 py-0.5 text-[11px] font-medium text-fg-subtle">
                            Standard
                          </span>
                        )}
                      </td>

                      {/* Email Status */}
                      <td className="px-4 py-4">
                        {u.emailVerifiedAt ? (
                          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-400">
                            <CheckCircle size={14} weight="bold" />
                            Verified
                          </span>
                        ) : (
                          <span className="text-[12px] text-fg-subtle/80">Unverified</span>
                        )}
                      </td>

                      {/* Instances */}
                      <td className="px-4 py-4">
                        <span className="inline-flex items-center gap-1.5 font-mono text-[12px] text-fg">
                          <HardDrives size={13} className="text-fg-subtle" />
                          {u.instanceCount || 0}
                        </span>
                      </td>

                      {/* SSH Keys */}
                      <td className="px-4 py-4">
                        <span className="inline-flex items-center gap-1.5 font-mono text-[12px] text-fg">
                          <Key size={13} className="text-fg-subtle" />
                          {u.sshKeyCount || 0}
                        </span>
                      </td>

                      {/* Registered */}
                      <td className="px-4 py-4 text-[12px] text-fg-subtle font-mono">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/admin/users/${u.id}`)}
                          className="h-8 w-8 p-0 text-fg-subtle hover:text-fg hover:bg-surface-2/60 ml-auto"
                          aria-label={`View ${u.name}`}
                        >
                          <ArrowRight size={16} />
                        </Button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  )
}
