import {
  ArrowClockwise,
  ArrowRight,
  Check,
  Copy,
  Cpu,
  Gauge,
  HardDrive,
  HardDrives,
  MagnifyingGlass,
  Play,
  Snowflake,
  Square,
  Terminal,
  X,
} from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { AppShell } from '@/components/app-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { AnimatedNumber, StatusDot, TableSkeleton } from '@/components/ui/live'
import { PowerConfirmDialog, type ConfirmablePowerAction } from '@/components/power-confirm-dialog'
import { Switch } from '@/components/ui/switch'
import { api, type ApiInstance } from '@/lib/api'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'

type StatusFilter = 'all' | 'running' | 'stopped'

export function ServersPage() {
  const { user } = useSession()
  const isAdmin = user?.isAdmin === true
  const [servers, setServers] = useState<ApiInstance[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [showAll, setShowAll] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})
  const [copiedIp, setCopiedIp] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ id: string; name: string; action: ConfirmablePowerAction } | null>(null)
  const [confirmWorking, setConfirmWorking] = useState(false)

  function runAction(id: string, action: 'start' | 'stop' | 'restart' | 'freeze' | 'unfreeze', force = false) {
    setActionLoading((prev) => ({ ...prev, [id]: true }))
    void api
      .instanceAction(id, action, force)
      .then(() => loadServers())
      .finally(() => setActionLoading((prev) => ({ ...prev, [id]: false })))
  }

  const loadServers = useCallback(async () => {
    setLoading(true)
    const res = await api.listInstances(showAll && isAdmin ? 'all' : undefined)
    if (res.ok) {
      setServers(res.data.instances)
      setError(null)
    } else {
      setError(res.error.message || 'Failed to load servers.')
    }
    setLoading(false)
  }, [showAll, isAdmin])

  useEffect(() => {
    loadServers()
    const timer = setInterval(loadServers, 15000)
    return () => clearInterval(timer)
  }, [loadServers])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return servers.filter((srv) => {
      if (statusFilter !== 'all' && srv.status !== statusFilter) return false
      if (!q) return true
      return (
        srv.name.toLowerCase().includes(q) ||
        srv.os.toLowerCase().includes(q) ||
        srv.ip4.toLowerCase().includes(q) ||
        srv.region.toLowerCase().includes(q) ||
        (srv.owner?.email || '').toLowerCase().includes(q) ||
        (srv.owner?.name || '').toLowerCase().includes(q)
      )
    })
  }, [servers, search, statusFilter])

  const runningCount = useMemo(() => servers.filter((s) => s.status === 'running').length, [servers])

  return (
    <AppShell
      title="Servers"
      description="Every virtual machine on your account, with live state."
    >
      <div className="flex w-full flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-bold tracking-tight text-fg">Servers</h1>
            <p className="mt-0.5 text-[13px] text-fg-subtle">
              {showAll && isAdmin
                ? `${servers.length} total across all users (${runningCount} running)`
                : `${servers.length} configured (${runningCount} running)`}
            </p>
          </div>
          <span className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={loadServers}
              disabled={loading}
              className="gap-1.5 text-[12px]"
            >
              <ArrowClockwise size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </Button>
            <Link to="/servers/setup">
              <Button size="sm" className="gap-1.5 text-[12px]">Create Server</Button>
            </Link>
          </span>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <MagnifyingGlass
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, OS, IP, or region..."
              className="h-9 w-full rounded-control border border-border bg-surface pl-9 pr-8 text-[12px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 rounded-control border border-border bg-surface p-1">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'running', label: 'Running' },
                { id: 'stopped', label: 'Stopped' },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setStatusFilter(option.id)}
                className={cn(
                  'rounded-control px-3 py-1.5 text-[12px] font-medium transition-colors',
                  statusFilter === option.id
                    ? 'bg-surface-2 text-fg shadow-xs'
                    : 'text-fg-subtle hover:text-fg',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          {isAdmin && (
            <label className="flex cursor-pointer select-none items-center gap-2 text-[12px] font-medium text-fg-subtle hover:text-fg">
              <Switch
                checked={showAll}
                onCheckedChange={setShowAll}
                aria-label="Show other users' servers"
              />
              Show other users&apos; servers
            </label>
          )}
          <span className="ml-auto font-mono text-[11px] text-fg-subtle">
            Showing {filtered.length} of {servers.length}
          </span>
        </div>

        <section className="overflow-x-auto rounded-panel border border-border bg-surface">
          {loading && servers.length === 0 ? (
            <table className="w-full min-w-[820px] text-left text-[13px]">
              <tbody>
                <TableSkeleton rows={4} cols={5} />
              </tbody>
            </table>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
              <div className="flex size-11 items-center justify-center rounded-full border border-border bg-surface-2 text-fg-subtle">
                <HardDrives size={22} aria-hidden />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-[14px] font-medium text-fg">
                  {servers.length === 0 ? 'No instances provisioned' : 'No servers match'}
                </p>
                <p className="text-[13px] text-fg-subtle">
                  {servers.length === 0
                    ? 'No instances allocated to your account yet. Contact support or an administrator to provision servers.'
                    : 'Try a different search or status filter.'}
                </p>
              </div>
            </div>
          ) : (
            <table className="w-full min-w-[820px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-border text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
                  <th className="px-5 py-3 font-medium">Server</th>
                  {showAll && isAdmin && <th className="px-4 py-3 font-medium">Owner</th>}
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Resources</th>
                  <th className="px-4 py-3 font-medium">Network</th>
                  <th className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                <AnimatePresence initial={false}>
                  {filtered.map((srv, index) => {
                    const isRunning = srv.status === 'running'
                    const isFrozen = srv.status === 'frozen'
                    const isBusy = !!actionLoading[srv.id]
                    const mine = !srv.owner || srv.owner.id === user?.id
                    const detailTo = mine ? `/servers/${srv.id}` : `/admin/servers/${srv.id}`
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
                              to={detailTo}
                              className="truncate text-[13px] font-semibold tracking-tight text-fg transition-colors hover:text-accent"
                            >
                              {srv.name}
                            </Link>
                            <span className="truncate text-[11px] text-fg-subtle">
                              {[srv.type.toUpperCase(), srv.os, srv.region].filter(Boolean).join(' · ')}
                            </span>
                          </div>
                        </div>
                      </td>
                      {showAll && isAdmin && (
                        <td className="px-4 py-3.5">
                          <div className="flex min-w-[140px] flex-col">
                            <span className="truncate text-[12px] font-medium text-fg">
                              {mine ? 'You' : srv.owner?.name || '—'}
                            </span>
                            {!mine && (
                              <span className="truncate font-mono text-[11px] text-fg-subtle">
                                {srv.owner?.email}
                              </span>
                            )}
                          </div>
                        </td>
                      )}
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
                        <div className="flex min-w-[200px] flex-col gap-1.5">
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
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (!srv.ip4 || srv.ip4 === '—') return
                              void navigator.clipboard.writeText(srv.ip4)
                              setCopiedIp(srv.id)
                              setTimeout(
                                () => setCopiedIp((prev) => (prev === srv.id ? null : prev)),
                                2000,
                              )
                            }}
                            title={srv.ip4 === '—' ? undefined : 'Copy IPv4 address'}
                            className={cn(
                              'flex items-center gap-1.5 font-mono text-[12px] transition-colors',
                              srv.ip4 === '—'
                                ? 'cursor-default text-fg-subtle'
                                : 'text-fg hover:text-accent',
                            )}
                          >
                            {srv.ip4}
                            {srv.ip4 !== '—' &&
                              (copiedIp === srv.id ? (
                                <Check size={12} className="text-emerald-500 dark:text-emerald-400" aria-hidden />
                              ) : (
                                <Copy size={12} className="opacity-0 transition-opacity hover:opacity-100" aria-hidden />
                              ))}
                          </button>
                          <span className="font-mono text-[11px] text-fg-subtle">
                            NAT · {srv.uptime}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          {mine ? (
                            <>
                              {isRunning ? (
                            <>
                              <Button
                                size="icon"
                                variant="secondary"
                                className="size-8 rounded-control"
                                aria-label={`Restart ${srv.name}`}
                                title="Restart"
                                disabled={isBusy}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (e.shiftKey) runAction(srv.id, 'restart')
                                  else setConfirm({ id: srv.id, name: srv.name, action: 'restart' })
                                }}
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
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (e.shiftKey) runAction(srv.id, 'stop')
                                  else setConfirm({ id: srv.id, name: srv.name, action: 'stop' })
                                }}
                              >
                                <Square size={14} weight="fill" aria-hidden />
                              </Button>
                              <Button
                                size="icon"
                                variant="secondary"
                                className="size-8 rounded-control text-sky-600 dark:text-sky-400"
                                aria-label={`Freeze ${srv.name}`}
                                title="Freeze"
                                disabled={isBusy}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (e.shiftKey) runAction(srv.id, 'freeze')
                                  else setConfirm({ id: srv.id, name: srv.name, action: 'freeze' })
                                }}
                              >
                                <Snowflake size={14} aria-hidden />
                              </Button>
                            </>
                          ) : isFrozen && srv.suspended && !isAdmin ? null : isFrozen ? (
                            <Button
                              size="icon"
                              variant="secondary"
                              className="size-8 rounded-control text-sky-600 dark:text-sky-400"
                              aria-label={`${srv.suspended ? 'Unsuspend' : 'Unfreeze'} ${srv.name}`}
                              title={srv.suspended ? 'Unsuspend' : 'Unfreeze'}
                              disabled={isBusy}
                              onClick={(e) => {
                                e.stopPropagation()
                                setActionLoading((prev) => ({ ...prev, [srv.id]: true }))
                                void api
                                  .instanceAction(srv.id, 'unfreeze')
                                  .then(() => loadServers())
                                  .finally(() =>
                                    setActionLoading((prev) => ({ ...prev, [srv.id]: false })),
                                  )
                              }}
                            >
                              <Play size={14} weight="fill" aria-hidden />
                            </Button>
                          ) : (
                            <Button
                              size="icon"
                              variant="secondary"
                              className="size-8 rounded-control text-emerald-600 dark:text-emerald-400"
                              aria-label={`Start ${srv.name}`}
                              title="Start"
                              disabled={isBusy}
                              onClick={(e) => {
                                e.stopPropagation()
                                setActionLoading((prev) => ({ ...prev, [srv.id]: true }))
                                void api
                                  .instanceAction(srv.id, 'start')
                                  .then(() => loadServers())
                                  .finally(() =>
                                    setActionLoading((prev) => ({ ...prev, [srv.id]: false })),
                                  )
                              }}
                            >
                              {isBusy ? (
                                <ArrowClockwise size={15} className="animate-spin" />
                              ) : (
                                <Play size={14} weight="fill" aria-hidden />
                              )}
                            </Button>
                          )}
                            </>
                          ) : null}
                          <Button size="icon" variant="secondary" className="size-8 rounded-control" asChild>
                            <Link
                              to={detailTo}
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
          )}
        </section>
      </div>

      {confirm && (
        <PowerConfirmDialog
          open
          action={confirm.action}
          serverName={confirm.name}
          working={confirmWorking}
          onConfirm={(force) => {
            const next = confirm
            setConfirm(null)
            setConfirmWorking(true)
            setActionLoading((prev) => ({ ...prev, [next.id]: true }))
            void api
              .instanceAction(next.id, next.action, force)
              .then(() => loadServers())
              .finally(() => {
                setActionLoading((prev) => ({ ...prev, [next.id]: false }))
                setConfirmWorking(false)
              })
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </AppShell>
  )
}
