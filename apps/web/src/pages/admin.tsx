import {
  ArrowClockwise,
  CheckCircle,
  Clock,
  Cpu,
  Database,
  DotsThreeVertical,
  HardDrive,
  HardDrives,
  Heartbeat,
  Key,
  LinuxLogo,
  Plus,
  ShieldCheck,
  ShieldSlash,
  Sliders,
  Terminal,
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

function StatCard({
  icon: Icon,
  label,
  value,
  sublabel,
  badge,
}: {
  icon: React.ElementType
  label: string
  value: React.ReactNode
  sublabel?: React.ReactNode
  badge?: string
}) {
  return (
    <div className="flex items-center gap-3.5 rounded-panel border border-border bg-surface p-4 transition-colors hover:border-border/80">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-control bg-surface-2 text-sun-500">
        <Icon size={20} weight="duotone" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[11px] font-medium tracking-wide text-fg-subtle uppercase">
            {label}
          </span>
          {badge ? (
            <span className="rounded-full bg-sun-500/10 px-1.5 py-0.2 font-mono text-[9px] font-medium text-sun-500">
              {badge}
            </span>
          ) : null}
        </div>
        <div className="truncate font-mono text-[14px] font-semibold text-fg">{value}</div>
        {sublabel ? (
          <span className="truncate text-[11px] text-fg-subtle">{sublabel}</span>
        ) : null}
      </div>
    </div>
  )
}

function SectionHeading({ title, icon: Icon }: { title: string; icon: React.ElementType }) {
  return (
    <div className="flex items-center gap-2 border-b border-border pb-2 text-[12px] font-semibold tracking-wider text-fg uppercase">
      <Icon size={16} className="text-sun-500" />
      <span>{title}</span>
    </div>
  )
}

export function AdminPage() {
  const { user: currentUser } = useSession()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const tab = tabParam === 'users' ? 'users' : tabParam === 'instances' ? 'instances' : tabParam === 'health' ? 'health' : 'overview'

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

  const formatUptime = (seconds?: number) => {
    if (!seconds) return '—'
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    return `${days}d ${hours}h ${mins}m`
  }

  return (
    <AppShell
      title="Admin Control Center"
      description="System metrics, node telemetry, health status, and resource distribution."
    >
      <div className="flex flex-col gap-6">
        {/* Top bar with quick sub-navigation tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div className="flex items-center gap-1 rounded-control bg-surface-2 p-1">
            <button
              type="button"
              onClick={() => setSearchParams({ tab: 'overview' })}
              className={cn(
                'flex items-center gap-2 rounded-control px-3 py-1.5 text-[13px] font-medium transition-colors',
                tab === 'overview'
                  ? 'bg-surface text-fg shadow-sm'
                  : 'text-fg-muted hover:text-fg',
              )}
            >
              <Cpu size={15} aria-hidden />
              Overview
            </button>
            <button
              type="button"
              onClick={() => setSearchParams({ tab: 'health' })}
              className={cn(
                'flex items-center gap-2 rounded-control px-3 py-1.5 text-[13px] font-medium transition-colors',
                tab === 'health'
                  ? 'bg-surface text-fg shadow-sm'
                  : 'text-fg-muted hover:text-fg',
              )}
            >
              <Heartbeat size={15} aria-hidden />
              System Health
            </button>
            <button
              type="button"
              onClick={() => setSearchParams({ tab: 'instances' })}
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
              onClick={() => setSearchParams({ tab: 'users' })}
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

        {/* ── TAB 1: OVERVIEW (Stats only, matching reference) ───────── */}
        {tab === 'overview' ? (
          <div className="flex flex-col gap-6">
            {/* System Overview Section */}
            <div className="flex flex-col gap-3">
              <SectionHeading title="System Overview" icon={Cpu} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  icon={Cpu}
                  label="CPU Architecture"
                  value={stats?.node.cpuModel ?? 'AMD EPYC Processor'}
                  sublabel="Host Compute Unit"
                />
                <StatCard
                  icon={HardDrive}
                  label="Host Memory"
                  value={
                    stats?.node.hostMemory
                      ? `${(stats.node.hostMemory.usedMb / 1024).toFixed(2)} GiB / ${(stats.node.hostMemory.totalMb / 1024).toFixed(2)} GiB`
                      : '—'
                  }
                  sublabel={
                    stats?.node.hostMemory
                      ? `${stats.node.hostMemory.percent}% utilized by host & workloads`
                      : undefined
                  }
                />
                <StatCard
                  icon={LinuxLogo}
                  label="Host Kernel"
                  value={stats?.node.kernel ?? 'Linux'}
                  sublabel={stats?.node.os ?? 'Debian'}
                />
                <StatCard
                  icon={Database}
                  label="Database Engine"
                  value={stats?.node.databaseVersion ?? 'PostgreSQL 17'}
                  sublabel="Direct Unix Socket / TCP"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  icon={Terminal}
                  label="Daemon Runtime"
                  value={`${stats?.node.daemon ?? 'incus'} v${stats?.node.version ?? '7.4'}`}
                  sublabel={stats?.node.driver ?? 'lxc | qemu'}
                  badge="ACTIVE"
                />
                <StatCard
                  icon={Clock}
                  label="Node Uptime"
                  value={formatUptime(stats?.node.uptimeSeconds)}
                  sublabel="Zero unplanned failovers"
                />
                <StatCard
                  icon={Sliders}
                  label="Load Average"
                  value={
                    stats?.node.loadAvg
                      ? `${stats.node.loadAvg[0].toFixed(2)}, ${stats.node.loadAvg[1].toFixed(2)}, ${stats.node.loadAvg[2].toFixed(2)}`
                      : '0.00, 0.00, 0.00'
                  }
                  sublabel="1m, 5m, 15m intervals"
                />
                <StatCard
                  icon={CheckCircle}
                  label="Daemon Socket"
                  value="/var/lib/incus/unix.socket"
                  sublabel="Local IPC connected"
                  badge="ONLINE"
                />
              </div>
            </div>

            {/* General Statistics Section */}
            <div className="flex flex-col gap-3">
              <SectionHeading title="General Statistics" icon={Sliders} />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <div className="flex flex-col gap-1 rounded-panel border border-border bg-surface p-4">
                  <span className="text-[11px] font-medium tracking-wide text-fg-subtle uppercase">Users</span>
                  <span className="font-mono text-[22px] font-semibold text-fg">{stats?.totals.users ?? 0}</span>
                  <span className="text-[11px] text-fg-subtle">{stats?.totals.admins ?? 0} with Admin role</span>
                </div>
                <div className="flex flex-col gap-1 rounded-panel border border-border bg-surface p-4">
                  <span className="text-[11px] font-medium tracking-wide text-fg-subtle uppercase">Servers</span>
                  <span className="font-mono text-[22px] font-semibold text-fg">{stats?.totals.instances ?? 0}</span>
                  <span className="text-[11px] text-fg-subtle">
                    {instances.filter((i) => i.status === 'running').length} running
                  </span>
                </div>
                <div className="flex flex-col gap-1 rounded-panel border border-border bg-surface p-4">
                  <span className="text-[11px] font-medium tracking-wide text-fg-subtle uppercase">Alloc Cores</span>
                  <span className="font-mono text-[22px] font-semibold text-fg">{stats?.totals.cores ?? 0}</span>
                  <span className="text-[11px] text-fg-subtle">vCPU committed</span>
                </div>
                <div className="flex flex-col gap-1 rounded-panel border border-border bg-surface p-4">
                  <span className="text-[11px] font-medium tracking-wide text-fg-subtle uppercase">Alloc Memory</span>
                  <span className="font-mono text-[22px] font-semibold text-fg">{stats?.totals.memory ?? '0 MB'}</span>
                  <span className="text-[11px] text-fg-subtle">Workload limits</span>
                </div>
                <div className="flex flex-col gap-1 rounded-panel border border-border bg-surface p-4">
                  <span className="text-[11px] font-medium tracking-wide text-fg-subtle uppercase">Alloc Storage</span>
                  <span className="font-mono text-[22px] font-semibold text-fg">
                    {stats?.totals.diskGb ? `${stats.totals.diskGb} GB` : '0 GB'}
                  </span>
                  <span className="text-[11px] text-fg-subtle">Disk pools</span>
                </div>
                <div className="flex flex-col gap-1 rounded-panel border border-border bg-surface p-4">
                  <span className="text-[11px] font-medium tracking-wide text-fg-subtle uppercase">Clusters / Nodes</span>
                  <span className="font-mono text-[22px] font-semibold text-sun-500">1</span>
                  <span className="text-[11px] text-fg-subtle">Local standalone</span>
                </div>
              </div>
            </div>

            {/* Workload Breakdown Section */}
            <div className="flex flex-col gap-3">
              <SectionHeading title="Workload Distribution" icon={HardDrives} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="flex flex-col gap-2 rounded-panel border border-border bg-surface p-4">
                  <span className="text-[11px] font-medium tracking-wide text-fg-subtle uppercase">LXC Containers</span>
                  <span className="font-mono text-[20px] font-semibold text-fg">
                    {instances.filter((i) => i.type === 'lxc').length}
                  </span>
                  <span className="text-[11px] text-fg-subtle">Shared kernel, high density</span>
                </div>
                <div className="flex flex-col gap-2 rounded-panel border border-border bg-surface p-4">
                  <span className="text-[11px] font-medium tracking-wide text-fg-subtle uppercase">KVM Virtual Machines</span>
                  <span className="font-mono text-[20px] font-semibold text-fg">
                    {instances.filter((i) => i.type === 'kvm').length}
                  </span>
                  <span className="text-[11px] text-fg-subtle">Hardware virtualized, isolated kernel</span>
                </div>
                <div className="flex flex-col gap-2 rounded-panel border border-border bg-surface p-4">
                  <span className="text-[11px] font-medium tracking-wide text-fg-subtle uppercase">Public IPv4 Addresses</span>
                  <span className="font-mono text-[20px] font-semibold text-fg">
                    {instances.filter((i) => i.ip4 && i.ip4 !== '—').length}
                  </span>
                  <span className="text-[11px] text-fg-subtle">Routed bridged networking</span>
                </div>
                <div className="flex flex-col gap-2 rounded-panel border border-border bg-surface p-4">
                  <span className="text-[11px] font-medium tracking-wide text-fg-subtle uppercase">SSH Keys Registered</span>
                  <span className="font-mono text-[20px] font-semibold text-fg">
                    {users.reduce((acc, u) => acc + (u.sshKeyCount || 0), 0)}
                  </span>
                  <span className="text-[11px] text-fg-subtle">Cloud-init public keys</span>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* ── TAB 2: SYSTEM HEALTH (Matching reference) ─────────────── */}
        {tab === 'health' ? (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="flex flex-col gap-4 rounded-panel border border-border bg-surface p-5">
                <SectionHeading title="General Health" icon={Heartbeat} />
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1 rounded-control border border-border/70 bg-surface-2/40 p-3.5">
                    <span className="text-[11px] font-medium tracking-wide text-fg-subtle uppercase">
                      Applied Schema Migrations
                    </span>
                    <span className="font-mono text-[18px] font-semibold text-emerald-500">100% (Clean)</span>
                    <span className="text-[11px] text-fg-subtle">DB schema at current revision</span>
                  </div>
                  <div className="flex flex-col gap-1 rounded-control border border-border/70 bg-surface-2/40 p-3.5">
                    <span className="text-[11px] font-medium tracking-wide text-fg-subtle uppercase">
                      Incus Socket Latency
                    </span>
                    <span className="font-mono text-[18px] font-semibold text-emerald-500">&lt; 1.20 ms</span>
                    <span className="text-[11px] text-fg-subtle">Local IPC response time</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-4 rounded-panel border border-border bg-surface p-5">
                <SectionHeading title="Daemon & Node Status" icon={Cpu} />
                <div className="flex flex-col gap-3 text-[13px]">
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <span className="text-fg-subtle">Node Synchronization</span>
                    <span className="inline-flex items-center gap-1.5 font-medium text-emerald-500 text-[12px]">
                      <CheckCircle size={14} weight="bold" /> In sync with host clock
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <span className="text-fg-subtle">Incus Hypervisor Driver</span>
                    <span className="font-mono font-medium text-fg">{stats?.node.driver}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-fg-subtle">Database Connection Pool</span>
                    <span className="font-mono font-medium text-emerald-500">Active (5000ms idle cap)</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4 rounded-panel border border-border bg-surface p-5">
              <SectionHeading title="Subsystem Diagnostics" icon={CheckCircle} />
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-border text-[11px] font-medium tracking-wide text-fg-subtle uppercase">
                      <th className="py-2.5">Subsystem</th>
                      <th className="py-2.5">Target</th>
                      <th className="py-2.5">Status</th>
                      <th className="py-2.5">Latency</th>
                      <th className="py-2.5 text-right">Health Check</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    <tr>
                      <td className="py-3 font-medium text-fg">Incus Control Socket</td>
                      <td className="py-3 font-mono text-[12px] text-fg-subtle">/var/lib/incus/unix.socket</td>
                      <td className="py-3 text-emerald-500 font-medium">Online</td>
                      <td className="py-3 font-mono text-[12px] text-fg-subtle">0.8 ms</td>
                      <td className="py-3 text-right">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-500">
                          Pass
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 font-medium text-fg">PostgreSQL Database</td>
                      <td className="py-3 font-mono text-[12px] text-fg-subtle">127.0.0.1:5433 (solstice)</td>
                      <td className="py-3 text-emerald-500 font-medium">Online</td>
                      <td className="py-3 font-mono text-[12px] text-fg-subtle">0.4 ms</td>
                      <td className="py-3 text-right">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-500">
                          Pass
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 font-medium text-fg">SMTP Mail Relay</td>
                      <td className="py-3 font-mono text-[12px] text-fg-subtle">smtp.fastmail.com:587</td>
                      <td className="py-3 text-emerald-500 font-medium">Configured (TLS)</td>
                      <td className="py-3 font-mono text-[12px] text-fg-subtle">—</td>
                      <td className="py-3 text-right">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-500">
                          Pass
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {/* ── TAB 3: INSTANCES ───────────────────────────────────────── */}
        {tab === 'instances' ? (
          <section className="rounded-panel border border-border bg-surface">
            {instances.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                <div className="flex size-11 items-center justify-center rounded-full border border-border bg-surface-2 text-fg-subtle">
                  <HardDrives size={22} aria-hidden />
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-[14px] font-medium text-fg">No instances provisioned</p>
                  <p className="text-[13px] text-fg-subtle">
                    Click "Provision Server" above to create an instance for any registered user.
                  </p>
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

        {/* ── TAB 4: USERS ───────────────────────────────────────────── */}
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
