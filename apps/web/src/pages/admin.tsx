import {
  ArrowClockwise,
  Cpu,
  DotsThreeVertical,
  HardDrive,
  HardDrives,
  Key,
  Plus,
  ShieldCheck,
  ShieldSlash,
  Trash,
  User,
  Users,
} from '@phosphor-icons/react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import {
  api,
  type AdminInstance,
  type AdminStats,
  type AdminUser,
} from '@/lib/api'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'

export function AdminPage() {
  const { user: currentUser } = useSession()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const tab = tabParam === 'users' ? 'users' : tabParam === 'node' ? 'node' : 'instances'

  function setTab(next: 'instances' | 'users' | 'node') {
    setSearchParams({ tab: next })
  }
  const [instances, setInstances] = useState<AdminInstance[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)

  // Provisioning modal state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [targetUserId, setTargetUserId] = useState('')
  const [instanceName, setInstanceName] = useState('')
  const [instanceType, setInstanceType] = useState<'lxc' | 'kvm'>('lxc')
  const [instanceOs, setInstanceOs] = useState('debian-12')
  const [cores, setCores] = useState(1)
  const [memoryMb, setMemoryMb] = useState(1024)
  const [diskGb, setDiskGb] = useState(10)

  // Action states
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})

  const loadData = useCallback(async () => {
    const [instRes, usersRes, statsRes] = await Promise.all([
      api.adminListInstances(),
      api.adminListUsers(),
      api.adminStats(),
    ])

    if (instRes.ok) setInstances(instRes.data)
    if (usersRes.ok) setUsers(usersRes.data)
    if (statsRes.ok) setStats(statsRes.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
    const timer = setInterval(loadData, 10000)
    return () => clearInterval(timer)
  }, [loadData])

  async function handleToggleAdmin(userId: string, currentAdmin: boolean) {
    setActionLoading((prev) => ({ ...prev, [userId]: true }))
    try {
      const res = await api.adminUpdateUserRole(userId, !currentAdmin)
      if (res.ok) await loadData()
    } finally {
      setActionLoading((prev) => ({ ...prev, [userId]: false }))
    }
  }

  async function handleDeleteUser(userId: string, email: string) {
    if (!window.confirm(`Delete user ${email}? All their instances and data will be destroyed.`)) {
      return
    }
    setActionLoading((prev) => ({ ...prev, [userId]: true }))
    try {
      const res = await api.adminDeleteUser(userId)
      if (res.ok) await loadData()
    } finally {
      setActionLoading((prev) => ({ ...prev, [userId]: false }))
    }
  }

  async function handleInstanceAction(id: string, action: 'start' | 'stop' | 'restart') {
    setActionLoading((prev) => ({ ...prev, [id]: true }))
    try {
      const res = await api.adminInstanceAction(id, action)
      if (res.ok) await loadData()
    } finally {
      setActionLoading((prev) => ({ ...prev, [id]: false }))
    }
  }

  async function handleDeleteInstance(id: string, name: string) {
    if (!window.confirm(`Permanently delete instance "${name}"? This action cannot be undone.`)) {
      return
    }
    setActionLoading((prev) => ({ ...prev, [id]: true }))
    try {
      const res = await api.adminDeleteInstance(id)
      if (res.ok) await loadData()
    } finally {
      setActionLoading((prev) => ({ ...prev, [id]: false }))
    }
  }

  async function handleCreateInstance(e: React.FormEvent) {
    e.preventDefault()
    setCreateError(null)
    setCreateSubmitting(true)

    try {
      const res = await api.adminCreateInstance({
        userId: targetUserId,
        name: instanceName,
        type: instanceType,
        os: instanceOs,
        cores,
        memoryMb,
        diskGb,
      })

      if (!res.ok) {
        setCreateError(res.error.message || 'Failed to provision instance.')
        return
      }

      setShowCreateModal(false)
      setInstanceName('')
      setTargetUserId('')
      await loadData()
    } finally {
      setCreateSubmitting(false)
    }
  }

  return (
    <AppShell
      title="Admin Control Plane"
      description="Manage all cluster instances, users, and platform resources."
    >
      <div className="flex flex-col gap-6">
        {/* Metric summary cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <div className="flex flex-col gap-1 rounded-panel border border-border bg-surface p-4">
            <span className="text-[11px] font-medium tracking-wide text-fg-subtle uppercase">Users</span>
            <span className="font-mono text-[20px] font-semibold text-fg">{stats?.totals.users ?? '—'}</span>
            <span className="text-[11px] text-fg-subtle">{stats?.totals.admins ?? 0} admins</span>
          </div>
          <div className="flex flex-col gap-1 rounded-panel border border-border bg-surface p-4">
            <span className="text-[11px] font-medium tracking-wide text-fg-subtle uppercase">Instances</span>
            <span className="font-mono text-[20px] font-semibold text-fg">{stats?.totals.instances ?? '—'}</span>
            <span className="text-[11px] text-fg-subtle">
              {instances.filter((i) => i.status === 'running').length} running
            </span>
          </div>
          <div className="flex flex-col gap-1 rounded-panel border border-border bg-surface p-4">
            <span className="text-[11px] font-medium tracking-wide text-fg-subtle uppercase">Alloc Cores</span>
            <span className="font-mono text-[20px] font-semibold text-fg">{stats?.totals.cores ?? '—'}</span>
            <span className="text-[11px] text-fg-subtle">vCPU</span>
          </div>
          <div className="flex flex-col gap-1 rounded-panel border border-border bg-surface p-4">
            <span className="text-[11px] font-medium tracking-wide text-fg-subtle uppercase">Alloc RAM</span>
            <span className="font-mono text-[20px] font-semibold text-fg">{stats?.totals.memory ?? '—'}</span>
            <span className="text-[11px] text-fg-subtle">Memory</span>
          </div>
          <div className="flex flex-col gap-1 rounded-panel border border-border bg-surface p-4">
            <span className="text-[11px] font-medium tracking-wide text-fg-subtle uppercase">Alloc Disk</span>
            <span className="font-mono text-[20px] font-semibold text-fg">{stats?.totals.diskGb ? `${stats.totals.diskGb} GB` : '—'}</span>
            <span className="text-[11px] text-fg-subtle">Storage</span>
          </div>
          <div className="flex flex-col gap-1 rounded-panel border border-border bg-surface p-4">
            <span className="text-[11px] font-medium tracking-wide text-fg-subtle uppercase">Daemon</span>
            <span className="font-mono text-[14px] font-semibold text-sun-500 truncate">
              {stats?.node.daemon} {stats?.node.version}
            </span>
            <span className="font-mono text-[11px] text-fg-subtle truncate">{stats?.node.os}</span>
          </div>
        </div>

        {/* Tab selector & top actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div className="flex items-center gap-1 rounded-control bg-surface-2 p-1">
            <button
              type="button"
              onClick={() => setTab('instances')}
              className={cn(
                'flex items-center gap-2 rounded-control px-3 py-1.5 text-[13px] font-medium transition-colors',
                tab === 'instances'
                  ? 'bg-surface text-fg shadow-sm'
                  : 'text-fg-muted hover:text-fg',
              )}
            >
              <HardDrives size={15} aria-hidden />
              Instances ({instances.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('users')}
              className={cn(
                'flex items-center gap-2 rounded-control px-3 py-1.5 text-[13px] font-medium transition-colors',
                tab === 'users'
                  ? 'bg-surface text-fg shadow-sm'
                  : 'text-fg-muted hover:text-fg',
              )}
            >
              <Users size={15} aria-hidden />
              Users ({users.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('node')}
              className={cn(
                'flex items-center gap-2 rounded-control px-3 py-1.5 text-[13px] font-medium transition-colors',
                tab === 'node'
                  ? 'bg-surface text-fg shadow-sm'
                  : 'text-fg-muted hover:text-fg',
              )}
            >
              <Cpu size={15} aria-hidden />
              Node Health
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={loadData}
              disabled={loading}
              className="gap-1.5 text-[12px]"
            >
              <ArrowClockwise size={13} className={loading ? 'animate-spin' : ''} />
              Refresh
            </Button>
            {tab === 'instances' ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowCreateModal(true)}
                className="gap-1.5 text-[12px]"
              >
                <Plus size={14} weight="bold" />
                Provision Server
              </Button>
            ) : null}
          </div>
        </div>

        {/* Tab 1: Instances */}
        {tab === 'instances' ? (
          <section className="rounded-panel border border-border bg-surface">
            {instances.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                <div className="flex size-11 items-center justify-center rounded-full border border-border bg-surface-2 text-fg-subtle">
                  <HardDrives size={22} aria-hidden />
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-[14px] font-medium text-fg">No instances provisioned</p>
                  <p className="text-[13px] text-fg-subtle">Click "Provision Server" above to create an instance for any registered user.</p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-border text-[11px] font-medium tracking-wide text-fg-subtle uppercase">
                      <th className="px-5 py-3">Instance</th>
                      <th className="px-5 py-3">Owner</th>
                      <th className="px-5 py-3">Type / OS</th>
                      <th className="px-5 py-3">IP Address</th>
                      <th className="px-5 py-3">Resources</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {instances.map((inst) => {
                      const isBusy = !!actionLoading[inst.id]
                      return (
                        <tr key={inst.id} className="hover:bg-surface-2/40 transition-colors">
                          <td className="px-5 py-3.5 font-medium text-fg">
                            <span className="font-mono">{inst.name}</span>
                          </td>
                          <td className="px-5 py-3.5 text-fg-subtle">
                            <div className="flex flex-col">
                              <span className="text-fg font-medium text-[12px]">{inst.ownerName}</span>
                              <span className="font-mono text-[11px] text-fg-subtle">{inst.ownerEmail}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-fg-subtle">
                            <span className="inline-flex items-center rounded-control bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] uppercase mr-1.5 text-fg">
                              {inst.type}
                            </span>
                            <span className="text-[12px]">{inst.os}</span>
                          </td>
                          <td className="px-5 py-3.5 font-mono text-[12px] text-fg-subtle">
                            {inst.ip4}
                          </td>
                          <td className="px-5 py-3.5 text-fg-subtle">
                            <div className="flex items-center gap-2 text-[12px]">
                              <span>{inst.cores} vCPU</span>
                              <span>•</span>
                              <span>{inst.memory}</span>
                              <span>•</span>
                              <span>{inst.disk}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <span
                              className={cn(
                                'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize',
                                inst.status === 'running'
                                  ? 'bg-emerald-500/10 text-emerald-500'
                                  : 'bg-surface-2 text-fg-subtle',
                              )}
                            >
                              <span
                                className={cn(
                                  'size-1.5 rounded-full',
                                  inst.status === 'running' ? 'bg-emerald-500 animate-pulse' : 'bg-fg-subtle',
                                )}
                              />
                              {inst.status}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <DropdownMenu.Root>
                              <DropdownMenu.Trigger asChild>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  className="inline-flex size-7 items-center justify-center rounded-control text-fg-subtle hover:bg-surface-2 hover:text-fg disabled:opacity-50"
                                >
                                  <DotsThreeVertical size={16} weight="bold" />
                                </button>
                              </DropdownMenu.Trigger>
                              <DropdownMenu.Portal>
                                <DropdownMenu.Content
                                  align="end"
                                  sideOffset={4}
                                  className="z-50 min-w-[10rem] rounded-control border border-border bg-surface p-1 shadow-xl text-[13px]"
                                >
                                  {inst.status === 'running' ? (
                                    <>
                                      <DropdownMenu.Item
                                        className="flex cursor-default items-center gap-2 rounded-control px-2.5 py-1.5 text-fg outline-none data-[highlighted]:bg-surface-2"
                                        onSelect={() => handleInstanceAction(inst.id, 'restart')}
                                      >
                                        Restart
                                      </DropdownMenu.Item>
                                      <DropdownMenu.Item
                                        className="flex cursor-default items-center gap-2 rounded-control px-2.5 py-1.5 text-fg outline-none data-[highlighted]:bg-surface-2"
                                        onSelect={() => handleInstanceAction(inst.id, 'stop')}
                                      >
                                        Stop
                                      </DropdownMenu.Item>
                                    </>
                                  ) : (
                                    <DropdownMenu.Item
                                      className="flex cursor-default items-center gap-2 rounded-control px-2.5 py-1.5 text-emerald-500 outline-none data-[highlighted]:bg-surface-2"
                                      onSelect={() => handleInstanceAction(inst.id, 'start')}
                                    >
                                      Start
                                    </DropdownMenu.Item>
                                  )}
                                  <DropdownMenu.Separator className="my-1 h-px bg-border" />
                                  <DropdownMenu.Item
                                    className="flex cursor-default items-center gap-2 rounded-control px-2.5 py-1.5 text-danger outline-none data-[highlighted]:bg-danger-surface"
                                    onSelect={() => handleDeleteInstance(inst.id, inst.name)}
                                  >
                                    <Trash size={14} />
                                    Delete Server
                                  </DropdownMenu.Item>
                                </DropdownMenu.Content>
                              </DropdownMenu.Portal>
                            </DropdownMenu.Root>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}

        {/* Tab 2: Users */}
        {tab === 'users' ? (
          <section className="rounded-panel border border-border bg-surface">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-border text-[11px] font-medium tracking-wide text-fg-subtle uppercase">
                    <th className="px-5 py-3">User</th>
                    <th className="px-5 py-3">Role</th>
                    <th className="px-5 py-3">Allocations</th>
                    <th className="px-5 py-3">SSH Keys</th>
                    <th className="px-5 py-3">Joined</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users.map((u) => {
                    const isSelf = u.id === currentUser?.id
                    const isBusy = !!actionLoading[u.id]

                    return (
                      <tr key={u.id} className="hover:bg-surface-2/40 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex flex-col">
                            <span className="font-medium text-fg">
                              {u.name} {isSelf ? <span className="text-fg-subtle text-[11px]">(you)</span> : null}
                            </span>
                            <span className="font-mono text-[12px] text-fg-subtle">{u.email}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          {u.isAdmin ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-sun-500/10 px-2 py-0.5 text-[11px] font-medium text-sun-500">
                              <ShieldCheck size={13} weight="bold" />
                              Admin
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-fg-subtle">
                              <User size={12} />
                              User
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-fg-subtle">
                          <span className="font-mono text-fg">{u.instanceCount}</span> server(s)
                        </td>
                        <td className="px-5 py-3.5 text-fg-subtle">
                          <span className="inline-flex items-center gap-1 font-mono text-[12px]">
                            <Key size={13} />
                            {u.sshKeyCount}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-[12px] text-fg-subtle font-mono">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={isSelf || isBusy}
                              onClick={() => handleToggleAdmin(u.id, !!u.isAdmin)}
                              title={u.isAdmin ? 'Revoke admin access' : 'Make admin'}
                              className="text-[11px] h-7 px-2"
                            >
                              {u.isAdmin ? (
                                <>
                                  <ShieldSlash size={13} /> Revoke
                                </>
                              ) : (
                                <>
                                  <ShieldCheck size={13} /> Make Admin
                                </>
                              )}
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={isSelf || isBusy}
                              onClick={() => handleDeleteUser(u.id, u.email)}
                              title="Delete user and cascade resources"
                              className="text-[11px] h-7 px-2"
                            >
                              <Trash size={13} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {/* Tab 3: Node & System Telemetry */}
        {tab === 'node' ? (
          <section className="flex flex-col gap-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-4 rounded-panel border border-border bg-surface p-5">
                <h3 className="text-[14px] font-semibold text-fg">Incus Daemon Host</h3>
                <dl className="grid grid-cols-2 gap-y-3 font-mono text-[12px]">
                  <dt className="text-fg-subtle">Engine</dt>
                  <dd className="text-fg">{stats?.node.daemon}</dd>
                  <dt className="text-fg-subtle">Version</dt>
                  <dd className="text-sun-500 font-semibold">{stats?.node.version}</dd>
                  <dt className="text-fg-subtle">Operating System</dt>
                  <dd className="text-fg">{stats?.node.os}</dd>
                  <dt className="text-fg-subtle">Kernel</dt>
                  <dd className="text-fg truncate">{stats?.node.kernel}</dd>
                  <dt className="text-fg-subtle">Driver Support</dt>
                  <dd className="text-fg">{stats?.node.driver}</dd>
                  <dt className="text-fg-subtle">Socket Status</dt>
                  <dd className="text-emerald-500 font-semibold">Online (/var/lib/incus/unix.socket)</dd>
                </dl>
              </div>

              <div className="flex flex-col gap-4 rounded-panel border border-border bg-surface p-5">
                <h3 className="text-[14px] font-semibold text-fg">Resource Allocations</h3>
                <div className="flex flex-col gap-3 text-[13px]">
                  <div className="flex justify-between border-b border-border pb-2">
                    <span className="text-fg-subtle">Total vCPU Cores Committed</span>
                    <span className="font-mono font-semibold text-fg">{stats?.totals.cores} Cores</span>
                  </div>
                  <div className="flex justify-between border-b border-border pb-2">
                    <span className="text-fg-subtle">Total RAM Allocated</span>
                    <span className="font-mono font-semibold text-fg">{stats?.totals.memory}</span>
                  </div>
                  <div className="flex justify-between border-b border-border pb-2">
                    <span className="text-fg-subtle">Total Disk Storage Provisioned</span>
                    <span className="font-mono font-semibold text-fg">{stats?.totals.diskGb} GB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-fg-subtle">Managed Workloads</span>
                    <span className="font-mono font-semibold text-sun-500">
                      {instances.length} ({instances.filter((i) => i.status === 'running').length} active)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : null}
      </div>

      {/* Provision Server Modal */}
      {showCreateModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="relative w-full max-w-lg rounded-panel border border-border bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <h3 className="text-[15px] font-semibold text-fg">Provision New Server</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-fg-subtle hover:text-fg text-[13px]"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleCreateInstance} className="flex flex-col gap-4 pt-4">
              {createError ? (
                <div className="rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">
                  {createError}
                </div>
              ) : null}

              {/* Target user */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-fg">Assign to User *</label>
                <select
                  required
                  value={targetUserId}
                  onChange={(e) => setTargetUserId(e.target.value)}
                  className="rounded-control border border-border bg-bg px-3 py-2 text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                >
                  <option value="">Select a user...</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
              </div>

              {/* Server Name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-fg">Server Name *</label>
                <input
                  required
                  placeholder="e.g. dev-cluster-01"
                  value={instanceName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setInstanceName(e.target.value.toLowerCase())
                  }
                  className="h-10 rounded-control border border-border bg-bg px-3 font-mono text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                />
                <span className="text-[11px] text-fg-subtle">
                  Lowercase alphanumeric characters and hyphens only (3-32 chars).
                </span>
              </div>

              {/* Virtualization type & OS */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-fg">Type</label>
                  <select
                    value={instanceType}
                    onChange={(e) => setInstanceType(e.target.value as 'lxc' | 'kvm')}
                    className="rounded-control border border-border bg-bg px-3 py-2 text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                  >
                    <option value="lxc">LXC Container (Fast)</option>
                    <option value="kvm">KVM Virtual Machine</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-fg">Operating System</label>
                  <select
                    value={instanceOs}
                    onChange={(e) => setInstanceOs(e.target.value)}
                    className="rounded-control border border-border bg-bg px-3 py-2 text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                  >
                    <option value="debian-12">Debian 12 Bookworm</option>
                    <option value="ubuntu-24">Ubuntu 24.04 LTS</option>
                    <option value="alpine-edge">Alpine Linux Edge</option>
                  </select>
                </div>
              </div>

              {/* Resource sliders */}
              <div className="flex flex-col gap-3 rounded-panel border border-border/70 bg-surface-2/30 p-3">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="flex items-center gap-1.5 font-medium text-fg">
                    <Cpu size={14} /> CPU Cores:
                  </span>
                  <span className="font-mono font-semibold text-sun-500">{cores} vCPU</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={8}
                  step={1}
                  value={cores}
                  onChange={(e) => setCores(Number(e.target.value))}
                  className="accent-sun-500 cursor-pointer"
                />

                <div className="flex items-center justify-between text-[12px]">
                  <span className="flex items-center gap-1.5 font-medium text-fg">
                    <HardDrive size={14} /> Memory:
                  </span>
                  <span className="font-mono font-semibold text-sun-500">
                    {memoryMb >= 1024 ? `${(memoryMb / 1024).toFixed(1)} GB` : `${memoryMb} MB`}
                  </span>
                </div>
                <input
                  type="range"
                  min={512}
                  max={8192}
                  step={512}
                  value={memoryMb}
                  onChange={(e) => setMemoryMb(Number(e.target.value))}
                  className="accent-sun-500 cursor-pointer"
                />

                <div className="flex items-center justify-between text-[12px]">
                  <span className="flex items-center gap-1.5 font-medium text-fg">
                    <HardDrives size={14} /> Disk Storage:
                  </span>
                  <span className="font-mono font-semibold text-sun-500">{diskGb} GB</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={100}
                  step={5}
                  value={diskGb}
                  onChange={(e) => setDiskGb(Number(e.target.value))}
                  className="accent-sun-500 cursor-pointer"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={createSubmitting}
                >
                  {createSubmitting ? 'Provisioning...' : 'Provision Server'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </AppShell>
  )
}
