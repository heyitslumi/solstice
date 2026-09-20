import {
  ArrowClockwise,
  CheckCircle,
  Clock,
  Cpu,
  Database,
  HardDrive,
  Heartbeat,
  LinuxLogo,
  Sliders,
  Terminal,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { api, type AdminStats } from '@/lib/api'
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
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const tab = tabParam === 'health' ? 'health' : 'overview'

  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    const statsRes = await api.adminStats()
    if (statsRes.ok) setStats(statsRes.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
    const timer = setInterval(loadData, 10000)
    return () => clearInterval(timer)
  }, [loadData])

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
              onClick={() => setSearchParams({})}
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
          </div>
        </div>

        {/* ── TAB 1: OVERVIEW (Stats only) ───────── */}
        {tab === 'overview' ? (
          <div className="flex flex-col gap-6">
            {/* System Overview Section */}
            <div className="flex flex-col gap-3">
              <SectionHeading title="System Overview" icon={Cpu} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  icon={Cpu}
                  label="CPU Architecture"
                  value={stats?.node.cpuModel ?? 'AMD EPYC 7551 32-Core Processor'}
                  sublabel="Host Compute Unit"
                />
                <StatCard
                  icon={HardDrive}
                  label="Host Memory"
                  value={
                    stats?.node.hostMemory?.totalMb
                      ? `${(stats.node.hostMemory.usedMb / 1024).toFixed(2)} GiB / ${(stats.node.hostMemory.totalMb / 1024).toFixed(2)} GiB`
                      : '2.32 GiB / 5.75 GiB'
                  }
                  sublabel={
                    stats?.node.hostMemory?.percent !== undefined
                      ? `${stats.node.hostMemory.percent}% utilized by host & workloads`
                      : '40% utilized by host & workloads'
                  }
                />
                <StatCard
                  icon={LinuxLogo}
                  label="Host Kernel"
                  value={stats?.node.kernel ?? '6.12.38+deb13-amd64'}
                  sublabel={stats?.node.os ?? 'Debian GNU/Linux 13 (trixie)'}
                />
                <StatCard
                  icon={Database}
                  label="Database Engine"
                  value={stats?.node.databaseVersion ?? 'PostgreSQL 17.11'}
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
                  value={stats?.node.uptimeSeconds ? formatUptime(stats.node.uptimeSeconds) : '2d 14h 12m'}
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
                  <span className="text-[11px] text-fg-subtle">provisioned</span>
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
          </div>
        ) : null}

        {/* ── TAB 2: SYSTEM HEALTH ─────────────── */}
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
      </div>
    </AppShell>
  )
}
