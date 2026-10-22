import {
  ArrowClockwise,
  ArrowRight,
  Bell,
  Check,
  Clock,
  Copy,
  Cpu,
  Gauge,
  HardDrive,
  HardDrives,
  Play,
  Square,
  Terminal,
} from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { AnimatedNumber, StatusDot, TableSkeleton } from '@/components/ui/live'
import { api, type ApiActivity, type ApiInstance, type ApiNodeStats } from '@/lib/api'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'

function timeOfDay(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(diffMs)) return 'recently'
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}


export function DashboardPage() {
  const { user } = useSession()
  const [servers, setServers] = useState<ApiInstance[]>([])
  const [stats, setStats] = useState<ApiNodeStats | null>(null)
  const [activities, setActivities] = useState<ApiActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})
  const [copiedIp, setCopiedIp] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    const [instancesRes, statsRes, activityRes] = await Promise.all([
      api.listInstances(),
      api.getInstanceStats(),
      api.listActivities({ limit: 6 }),
    ])
    if (instancesRes.ok) {
      setServers(instancesRes.data.instances)
    }
    if (statsRes.ok) {
      setStats(statsRes.data)
    }
    if (activityRes.ok) {
      setActivities(activityRes.data.activities)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadAll()
    const timer = setInterval(loadAll, 15000)
    return () => clearInterval(timer)
  }, [loadAll])

  async function handlePowerAction(
    e: React.MouseEvent,
    id: string,
    action: 'start' | 'stop' | 'restart' | 'freeze' | 'unfreeze',
  ) {
    e.stopPropagation()
    setActionLoading((prev) => ({ ...prev, [id]: true }))
    try {
      const res = await api.instanceAction(id, action)
      if (res.ok) {
        await loadAll()
      }
    } finally {
      setActionLoading((prev) => ({ ...prev, [id]: false }))
    }
  }

  function handleCopyIp(e: React.MouseEvent, id: string, ip: string) {
    e.stopPropagation()
    if (!ip || ip === '—') return
    void navigator.clipboard.writeText(ip)
    setCopiedIp(id)
    setTimeout(() => setCopiedIp((prev) => (prev === id ? null : prev)), 2000)
  }

  const running = useMemo(() => servers.filter((s) => s.status === 'running'), [servers])
  const nodeNames = useMemo(
    () => [...new Set(servers.map((s) => s.nodeName).filter(Boolean))].join(', '),
    [servers],
  )
  const fleetRegion = useMemo(() => servers[0]?.region ?? null, [servers])
  const totalCores = useMemo(() => servers.reduce((sum, s) => sum + s.cores, 0), [servers])
  const firstName = user?.name.split(' ')[0] || 'there'

  const lastLogin = useMemo(() => {
    const entry = activities.find((a) => a.action.toLowerCase().includes('login'))
    return entry ? relativeTime(entry.createdAt) : null
  }, [activities])

  return (
    <AppShell
      title={user ? `Welcome back, ${firstName}.` : 'Welcome back.'}
      description="Your servers, resources, and recent activity at a glance."
    >
      <div className="flex w-full flex-col gap-5">
        {/* Hero band */}
        <div className="flex flex-col gap-4 overflow-hidden rounded-panel border border-accent/40 bg-gradient-to-r from-accent/25 via-surface to-surface p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent-text">
              {timeOfDay()}
            </span>
            <h1 className="truncate text-[26px] font-bold leading-none tracking-tight text-fg">
              {user?.name || 'Welcome'}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px]">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-medium',
                  servers.length === 0
                    ? 'border-border bg-surface-2/60 text-fg-subtle'
                    : running.length === servers.length
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : running.length === 0
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        : 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400',
                )}
              >
                <span
                  className={cn(
                    'size-1.5 rounded-full',
                    servers.length === 0
                      ? 'bg-zinc-500'
                      : running.length === servers.length
                        ? 'bg-emerald-500 dark:bg-emerald-400'
                        : running.length === 0
                          ? 'bg-amber-500 dark:bg-amber-400'
                          : 'bg-sky-500 dark:bg-sky-400',
                  )}
                  aria-hidden
                />
                {servers.length === 0
                  ? 'No servers yet'
                  : running.length === servers.length
                    ? `All ${running.length} running`
                    : running.length === 0
                      ? 'All servers offline'
                      : `${running.length} of ${servers.length} running`}
              </span>
              {lastLogin && (
                <span className="inline-flex items-center gap-1 text-fg-subtle">
                  <Clock size={13} aria-hidden />
                  Last login {lastLogin}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="secondary" size="sm" asChild>
              <Link to="/account">Account</Link>
            </Button>
            <Button variant="primary" size="sm" asChild>
              <Link to="/servers">Manage servers</Link>
            </Button>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {[
            {
              icon: <HardDrives size={18} aria-hidden />,
              tint: 'bg-sun-500/15 text-accent-text',
              label: 'Total servers',
              value: String(servers.length),
              sub: `${running.length} running`,
            },
            {
              icon: <Cpu size={18} aria-hidden />,
              tint: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-500',
              label: 'vCPUs allocated',
              value: String(totalCores),
              sub: `Across ${servers.length} server${servers.length === 1 ? '' : 's'}`,
            },
            {
              icon: <Gauge size={18} aria-hidden />,
              tint: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
              label: 'RAM allocated',
              value: stats?.resources.totalMemory ?? '0 MB',
              sub: 'Reserved',
            },
            {
              icon: <HardDrive size={18} aria-hidden />,
              tint: 'bg-accent/15 text-accent-text',
              label: 'Disk provisioned',
              value: `${stats?.resources.totalDiskGb ?? 0} GB`,
              sub: 'NVMe',
            },
          ].map((card) => (
            <div
              key={card.label}
              className="flex items-center gap-3.5 rounded-panel border border-border bg-surface p-4 shadow-2xs"
            >
              <div
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-control',
                  card.tint,
                )}
              >
                {card.icon}
              </div>
              <div className="flex min-w-0 flex-col">
                <span className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
                  {card.label}
                </span>
                <span className="font-mono text-[20px] font-bold leading-tight tracking-tight text-fg">
                  {card.value}
                </span>
                <span className="truncate text-[11px] text-fg-subtle">{card.sub}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Fleet status strip */}
        <div className="flex flex-col gap-2 rounded-panel border border-border bg-surface px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={cn(
                'size-2.5 shrink-0 rounded-full',
                servers.length === 0
                  ? 'bg-zinc-500'
                  : running.length === servers.length
                    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
                    : running.length === 0
                      ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]'
                      : 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.6)]',
              )}
              aria-hidden
            />
            <p className="truncate text-[14px] font-semibold text-fg">
              {servers.length === 0
                ? 'No servers provisioned'
                : running.length === servers.length
                  ? `All ${running.length} server${running.length === 1 ? '' : 's'} running`
                  : running.length === 0
                    ? 'Fleet offline'
                    : `${running.length} of ${servers.length} running`}
            </p>
          </div>
          {servers.length > 0 && (
            <p className="shrink-0 font-mono text-[11px] text-fg-subtle">
              {[nodeNames, fleetRegion, stats && `Incus v${stats.node.version}`, `${totalCores} vCPU · ${stats?.resources.totalMemory ?? '0 MB'} · ${stats?.resources.totalDiskGb ?? 0} GB`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </div>

        {/* Servers table */}
        <section id="servers" className="scroll-mt-5 rounded-panel border border-border bg-surface">
          <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
            <h2 className="text-[14px] font-semibold text-fg">My servers</h2>
            <span className="flex items-center gap-3">
              <span className="font-mono text-[11px] text-fg-subtle">
                {servers.length} configured ({running.length} running)
              </span>
              <Link
                to="/servers"
                className="flex items-center gap-1 text-[12px] font-medium text-accent-text hover:underline"
              >
                View all
                <ArrowRight size={13} aria-hidden />
              </Link>
              <button
                type="button"
                onClick={loadAll}
                className="text-fg-subtle transition-colors hover:text-fg"
                title="Refresh status"
                aria-label="Refresh status"
              >
                <ArrowClockwise size={13} className={loading ? 'animate-spin' : ''} />
              </button>
            </span>
          </div>

          {loading && servers.length === 0 ? (
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <tbody>
                <TableSkeleton rows={3} cols={5} />
              </tbody>
            </table>
          ) : servers.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
              <div className="flex size-11 items-center justify-center rounded-full border border-border bg-surface-2 text-fg-subtle">
                <HardDrives size={22} aria-hidden />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-[14px] font-medium text-fg">No instances provisioned</p>
                <p className="text-[13px] text-fg-subtle">
                  No instances allocated to your account yet. Contact support or an administrator
                  to provision servers.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-border text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
                    <th className="px-5 py-3 font-medium">Server</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Resources</th>
                    <th className="px-4 py-3 font-medium">IP address</th>
                    <th className="px-5 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  <AnimatePresence initial={false}>
                    {servers.map((srv, index) => {
                      const isRunning = srv.status === 'running'
                      const isFrozen = srv.status === 'frozen'
                      const isBusy = !!actionLoading[srv.id]
                      return (
                        <motion.tr
                          key={srv.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.35, delay: Math.min(index * 0.05, 0.3), ease: [0.16, 1, 0.3, 1] }}
                          className="transition-colors duration-150 hover:bg-surface-2/40"
                        >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-control border border-border/80 bg-surface-2 text-fg-muted">
                              {srv.type === 'kvm' ? (
                                <HardDrives size={18} aria-hidden />
                              ) : (
                                <Terminal size={18} aria-hidden />
                              )}
                            </span>
                            <div className="flex min-w-0 flex-col">
                              <Link
                                to={`/servers/${srv.id}`}
                                className="truncate text-[13px] font-semibold tracking-tight text-fg transition-colors hover:text-accent"
                              >
                                {srv.name}
                              </Link>
                              <span className="truncate text-[11px] text-fg-subtle">{srv.os}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
                              isRunning
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : isFrozen
                                  ? 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400'
                                  : 'border-border bg-surface-2/60 text-fg-subtle',
                            )}
                          >
                            <StatusDot status={srv.status} />
                            {isRunning ? 'Running' : isFrozen ? 'Suspended' : 'Stopped'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex min-w-[180px] flex-col gap-1.5">
                            {[
                              {
                                icon: <Cpu size={12} className="shrink-0 text-fg-subtle" aria-hidden />,
                                label: 'CPU',
                                value: isRunning ? srv.cpuUsage : null,
                                bar: 'bg-accent',
                              },
                              {
                                icon: <Gauge size={12} className="shrink-0 text-fg-subtle" aria-hidden />,
                                label: 'RAM',
                                value: isRunning ? srv.ramUsage : null,
                                bar: 'bg-sky-500',
                              },
                              {
                                icon: <HardDrive size={12} className="shrink-0 text-fg-subtle" aria-hidden />,
                                label: 'Disk',
                                value: isRunning ? srv.diskUsage : null,
                                bar: 'bg-emerald-400',
                              },
                            ].map((row) => (
                              <div key={row.label} className="flex items-center gap-2">
                                {row.icon}
                                <span className="w-8 shrink-0 text-[11px] text-fg-subtle">
                                  {row.label}
                                </span>
                                <div className="h-1 w-full overflow-hidden rounded-full bg-surface-2">
                                  <div
                                    className={cn('h-full rounded-full transition-all duration-300', row.bar)}
                                    style={{ width: `${row.value ?? 0}%` }}
                                  />
                                </div>
                                <span className="w-9 shrink-0 text-right font-mono text-[11px] text-fg-subtle">
                                  {row.value === null ? (
                                    '—'
                                  ) : (
                                    <AnimatedNumber value={row.value} format={(n) => `${Math.round(n)}%`} />
                                  )}
                                </span>
                              </div>
                            ))}
                            <span className="font-mono text-[11px] text-fg-subtle">
                              {srv.cores} vCPU · {srv.memory} · {srv.diskGb} GB
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <button
                            type="button"
                            onClick={(e) => handleCopyIp(e, srv.id, srv.ip4)}
                            title={srv.ip4 === '—' ? undefined : 'Copy IPv4 address'}
                            className={cn(
                              'flex items-center gap-1.5 font-mono text-[12px] transition-colors',
                              srv.ip4 === '—' ? 'cursor-default text-fg-subtle' : 'text-fg hover:text-accent',
                            )}
                          >
                            {srv.ip4}
                            {srv.ip4 !== '—' &&
                              (copiedIp === srv.id ? (
                                <Check size={12} className="text-emerald-400" aria-hidden />
                              ) : (
                                <Copy size={12} className="opacity-0 transition-opacity hover:opacity-100" aria-hidden />
                              ))}
                          </button>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-1">
                            {isRunning ? (
                              <>
                                <Button
                                  size="icon"
                                  variant="secondary"
                                  className="size-8 rounded-control"
                                  aria-label={`Restart ${srv.name}`}
                                  title="Restart"
                                  disabled={isBusy}
                                  onClick={(e) => void handlePowerAction(e, srv.id, 'restart')}
                                >
                                  {isBusy ? (
                                    <ArrowClockwise size={15} className="animate-spin" />
                                  ) : (
                                    <ArrowClockwise size={15} aria-hidden />
                                  )}
                                </Button>
                                <Button
                                  size="icon"
                                  variant="secondary"
                                  className="size-8 rounded-control text-danger hover:bg-danger-surface"
                                  aria-label={`Stop ${srv.name}`}
                                  title="Stop"
                                  disabled={isBusy}
                                  onClick={(e) => void handlePowerAction(e, srv.id, 'stop')}
                                >
                                  <Square size={14} weight="fill" aria-hidden />
                                </Button>
                              </>
                            ) : isFrozen ? (
                              <Button
                                size="icon"
                                variant="secondary"
                                className="size-8 rounded-control text-sky-600 dark:text-sky-400"
                                aria-label={`Unsuspend ${srv.name}`}
                                title="Unsuspend"
                                disabled={isBusy}
                                onClick={(e) => void handlePowerAction(e, srv.id, 'unfreeze')}
                              >
                                <Play size={14} weight="fill" aria-hidden />
                              </Button>
                            ) : (
                              <Button
                                size="icon"
                                variant="secondary"
                                className="size-8 rounded-control text-emerald-400"
                                aria-label={`Start ${srv.name}`}
                                title="Start"
                                disabled={isBusy}
                                onClick={(e) => void handlePowerAction(e, srv.id, 'start')}
                              >
                                {isBusy ? (
                                  <ArrowClockwise size={15} className="animate-spin" />
                                ) : (
                                  <Play size={14} weight="fill" aria-hidden />
                                )}
                              </Button>
                            )}
                            <Button size="icon" variant="secondary" className="size-8 rounded-control" asChild>
                              <Link
                                to={`/servers/${srv.id}`}
                                aria-label={`Open ${srv.name} details`}
                                title="Details"
                              >
                                <ArrowRight size={15} aria-hidden />
                              </Link>
                            </Button>
                          </div>
                        </td>
                      </motion.tr>
                    )
                  })}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Recent activity */}
        <section className="rounded-panel border border-border bg-surface">
          <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
            <h2 className="flex items-center gap-2 text-[14px] font-semibold text-fg">
              <Bell size={15} className="text-fg-subtle" aria-hidden />
              Recent activity
            </h2>
            <Link
              to="/account"
              className="flex items-center gap-1 text-[12px] font-medium text-accent-text hover:underline"
            >
              View all
              <ArrowRight size={13} aria-hidden />
            </Link>
          </div>
          {activities.length === 0 ? (
            <p className="px-5 py-6 text-center text-[13px] text-fg-subtle">
              Nothing recorded yet — activity will appear here as you use the panel.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {activities.slice(0, 5).map((activity) => (
                <li key={activity.id} className="flex items-start gap-3 px-5 py-3">
                  <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                  <div className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                    <p className="truncate text-[13px] text-fg">
                      <span className="font-medium">{activity.action}</span>
                      {activity.details ? (
                        <span className="text-fg-subtle"> — {activity.details}</span>
                      ) : null}
                    </p>
                    <span className="shrink-0 font-mono text-[11px] text-fg-subtle">
                      {relativeTime(activity.createdAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  )
}
