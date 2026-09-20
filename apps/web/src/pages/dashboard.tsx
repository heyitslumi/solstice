import {
  ArrowClockwise,
  ArrowsDownUp,
  CheckCircle,
  Cpu,
  DotsThreeVertical,
  Gauge,
  HardDrive,
  HardDrives,
  LinuxLogo,
  Play,
  Square,
  Terminal,
} from '@phosphor-icons/react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { api, type ApiInstance, type ApiNodeStats } from '@/lib/api'
import { useSession } from '@/lib/session'

function Panel({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-panel border border-border bg-surface">
      <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
        <h2 className="text-[14px] font-semibold text-fg">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function DashboardPage() {
  const { user } = useSession()
  const [servers, setServers] = useState<ApiInstance[]>([])
  const [stats, setStats] = useState<ApiNodeStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})

  const loadInstances = useCallback(async () => {
    const [instancesRes, statsRes] = await Promise.all([
      api.listInstances(),
      api.getInstanceStats(),
    ])
    if (instancesRes.ok) {
      setServers(instancesRes.data.instances)
    }
    if (statsRes.ok) {
      setStats(statsRes.data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadInstances()
    const timer = setInterval(loadInstances, 10000)
    return () => clearInterval(timer)
  }, [loadInstances])

  async function handlePowerAction(id: string, action: 'start' | 'stop' | 'restart') {
    setActionLoading((prev) => ({ ...prev, [id]: true }))
    try {
      const res = await api.instanceAction(id, action)
      if (res.ok) {
        await loadInstances()
      }
    } finally {
      setActionLoading((prev) => ({ ...prev, [id]: false }))
    }
  }

  return (
    <AppShell
      title={user ? `Welcome back, ${user.name.split(' ')[0]}.` : 'Welcome back.'}
      description="Manage your KVM virtual machines, LXC system containers, and networking allocations."
    >
      <div className="grid w-full gap-5 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-5">
          <Panel
            title="Instances"
            action={
              <div className="flex items-center gap-3">
                <span className="font-mono text-[11px] text-fg-subtle">
                  {servers.length} configured (
                  {servers.filter((s) => s.status === 'running').length} running)
                </span>
                <button
                  type="button"
                  onClick={loadInstances}
                  className="text-fg-subtle hover:text-fg transition-colors"
                  title="Refresh status"
                  aria-label="Refresh status"
                >
                  <ArrowClockwise size={13} className={loading ? 'animate-spin' : ''} />
                </button>
              </div>
            }
          >
            {servers.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                <div className="flex size-11 items-center justify-center rounded-full border border-border bg-surface-2 text-fg-subtle">
                  <HardDrives size={22} aria-hidden />
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-[14px] font-medium text-fg">No instances provisioned</p>
                  <p className="text-[13px] text-fg-subtle">
                    No instances allocated to your account yet. Contact support or an administrator to provision servers.
                  </p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {servers.map((srv) => {
                  const isRunning = srv.status === 'running'
                  const isBusy = !!actionLoading[srv.id]

                  return (
                    <article
                      key={srv.id}
                      className="group flex flex-col justify-between gap-4 p-5 transition-colors duration-150 hover:bg-surface-2/40 sm:flex-row sm:items-center"
                    >
                      <div className="flex items-start gap-3.5">
                        <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-control border border-border/80 bg-surface-2 text-fg-muted shadow-xs">
                          {srv.type === 'kvm' ? (
                            <HardDrives size={20} aria-hidden />
                          ) : (
                            <Terminal size={20} aria-hidden />
                          )}
                        </span>

                        <div className="flex min-w-0 flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              to={`/servers/${srv.id}`}
                              className="text-[14px] font-semibold text-fg tracking-tight hover:text-accent transition-colors"
                            >
                              {srv.name}
                            </Link>
                            <span
                              className={`inline-flex items-center px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider rounded-control border ${
                                srv.type === 'kvm'
                                  ? 'border-sky-500/30 bg-sky-500/10 text-sky-400'
                                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                              }`}
                            >
                              {srv.type.toUpperCase()}
                            </span>
                            <span className="inline-flex items-center gap-1.5 text-[12px] text-fg-subtle">
                              <span
                                className={`size-1.5 rounded-full ${
                                  isRunning
                                    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
                                    : 'bg-zinc-600'
                                }`}
                              />
                              {isRunning ? 'Running' : 'Stopped'}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-fg-muted">
                            <span className="flex items-center gap-1.5">
                              <LinuxLogo size={14} className="text-fg-subtle" aria-hidden />
                              {srv.os}
                            </span>
                            <span className="font-mono text-fg-subtle">·</span>
                            <span className="font-mono text-[11px] text-fg-subtle">
                              {srv.region}
                            </span>
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-3 font-mono text-[11px] text-fg-subtle">
                            <span className="flex items-center gap-1">
                              <Cpu size={13} aria-hidden />
                              {srv.cores} vCPU
                            </span>
                            <span>·</span>
                            <span>{srv.memory} RAM</span>
                            <span>·</span>
                            <span className="flex items-center gap-1">
                              <HardDrive size={13} aria-hidden />
                              {srv.disk}
                            </span>
                            <span>·</span>
                            <span className="text-fg">{srv.ip4}</span>
                          </div>
                        </div>
                      </div>

                      {/* Live telemetry metrics */}
                      <div className="hidden grid-cols-3 gap-6 rounded-control border border-border/50 bg-surface-2/30 px-4 py-2.5 xl:grid">
                        <div className="flex flex-col gap-1 min-w-[7.5rem]">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="flex items-center gap-1 text-fg-subtle">
                              <Cpu size={12} aria-hidden />
                              CPU Load
                            </span>
                            <span className="font-mono text-fg">
                              {isRunning ? `${srv.cpuUsage}%` : '0%'}
                            </span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                            <div
                              className="h-full rounded-full bg-accent transition-all duration-300"
                              style={{ width: isRunning ? `${srv.cpuUsage}%` : '0%' }}
                            />
                          </div>
                        </div>

                        <div className="flex flex-col gap-1 min-w-[7.5rem]">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="flex items-center gap-1 text-fg-subtle">
                              <Gauge size={12} aria-hidden />
                              Memory
                            </span>
                            <span className="font-mono text-fg">
                              {isRunning ? `${srv.ramUsage}%` : '0%'}
                            </span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                            <div
                              className="h-full rounded-full bg-sky-500 transition-all duration-300"
                              style={{ width: isRunning ? `${srv.ramUsage}%` : '0%' }}
                            />
                          </div>
                        </div>

                        <div className="flex flex-col justify-center min-w-[6.5rem]">
                          <span className="flex items-center gap-1 text-[11px] text-fg-subtle">
                            <ArrowsDownUp size={12} aria-hidden />
                            Bandwidth
                          </span>
                          <span className="font-mono text-[12px] font-medium text-fg">
                            {srv.bandwidth}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 self-end sm:self-center">
                        <DropdownMenu.Root>
                          <DropdownMenu.Trigger asChild>
                            <Button
                              size="icon"
                              variant="secondary"
                              className="size-8 rounded-control"
                              aria-label="Power Action"
                              title="Power Action"
                              disabled={isBusy}
                            >
                              {isBusy ? (
                                <ArrowClockwise size={15} className="animate-spin" />
                              ) : (
                                <DotsThreeVertical size={16} weight="bold" aria-hidden />
                              )}
                            </Button>
                          </DropdownMenu.Trigger>
                          <DropdownMenu.Portal>
                            <DropdownMenu.Content
                              align="end"
                              sideOffset={4}
                              className="z-50 min-w-[9.5rem] rounded-control border border-border bg-surface p-1 shadow-xl"
                            >
                              <DropdownMenu.Item
                                disabled={isRunning || isBusy}
                                className={`flex cursor-default items-center gap-2 rounded-control px-2.5 py-1.5 text-[13px] outline-none ${
                                  isRunning || isBusy
                                    ? 'text-fg-subtle/50 opacity-40 cursor-not-allowed'
                                    : 'text-fg data-[highlighted]:bg-surface-2'
                                }`}
                                onSelect={() => {
                                  if (!isRunning) handlePowerAction(srv.id, 'start')
                                }}
                              >
                                <Play size={14} weight="fill" aria-hidden />
                                Start
                              </DropdownMenu.Item>

                              <DropdownMenu.Item
                                disabled={!isRunning || isBusy}
                                className={`flex cursor-default items-center gap-2 rounded-control px-2.5 py-1.5 text-[13px] outline-none ${
                                  !isRunning || isBusy
                                    ? 'text-fg-subtle/50 opacity-40 cursor-not-allowed'
                                    : 'text-fg data-[highlighted]:bg-surface-2'
                                }`}
                                onSelect={() => {
                                  if (isRunning) handlePowerAction(srv.id, 'restart')
                                }}
                              >
                                <ArrowClockwise size={14} aria-hidden />
                                Restart
                              </DropdownMenu.Item>

                              <DropdownMenu.Item
                                disabled={!isRunning || isBusy}
                                className={`flex cursor-default items-center gap-2 rounded-control px-2.5 py-1.5 text-[13px] outline-none ${
                                  !isRunning || isBusy
                                    ? 'text-danger/40 opacity-40 cursor-not-allowed'
                                    : 'text-danger data-[highlighted]:bg-danger-surface'
                                }`}
                                onSelect={() => {
                                  if (isRunning) handlePowerAction(srv.id, 'stop')
                                }}
                              >
                                <Square
                                  size={14}
                                  weight="fill"
                                  className="text-danger"
                                  aria-hidden
                                />
                                Stop
                              </DropdownMenu.Item>
                            </DropdownMenu.Content>
                          </DropdownMenu.Portal>
                        </DropdownMenu.Root>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-5">
          <Panel title="Resource Allocation">
            <dl className="flex flex-col">
              <div className="flex items-baseline justify-between gap-4 border-b border-border/70 px-5 py-3">
                <dt className="flex items-center gap-1.5 text-[13px] text-fg-subtle">
                  <HardDrives size={14} className="text-fg-subtle" />
                  Instances
                </dt>
                <dd className="font-mono text-[12px] font-medium text-fg">
                  {stats?.resources.totalInstances ?? servers.length}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-b border-border/70 px-5 py-3">
                <dt className="flex items-center gap-1.5 text-[13px] text-fg-subtle">
                  <Cpu size={14} className="text-fg-subtle" />
                  Assigned vCPUs
                </dt>
                <dd className="font-mono text-[12px] font-medium text-fg">
                  {stats?.resources.totalCores ?? 0} Cores
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-b border-border/70 px-5 py-3">
                <dt className="flex items-center gap-1.5 text-[13px] text-fg-subtle">
                  <Gauge size={14} className="text-fg-subtle" />
                  Total Memory
                </dt>
                <dd className="font-mono text-[12px] font-medium text-fg">
                  {stats?.resources.totalMemory ?? '0 MB'}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 px-5 py-3">
                <dt className="flex items-center gap-1.5 text-[13px] text-fg-subtle">
                  <HardDrive size={14} className="text-fg-subtle" />
                  NVMe Storage
                </dt>
                <dd className="font-mono text-[12px] font-medium text-fg">
                  {stats?.resources.totalDiskGb ?? 0} GB
                </dd>
              </div>
            </dl>
          </Panel>

          <Panel title="Host Node">
            <dl className="flex flex-col">
              <div className="flex items-baseline justify-between gap-4 border-b border-border/70 px-5 py-3">
                <dt className="text-[13px] text-fg-subtle">Incus Daemon</dt>
                <dd className="flex items-center gap-1.5 font-mono text-[12px] text-fg">
                  <span className="size-1.5 rounded-full bg-emerald-400" />
                  v{stats?.node.version ?? '7.4'}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-b border-border/70 px-5 py-3">
                <dt className="text-[13px] text-fg-subtle">Operating System</dt>
                <dd className="truncate text-[12px] text-fg">
                  {stats?.node.os ?? 'Debian GNU/Linux 13'}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-b border-border/70 px-5 py-3">
                <dt className="text-[13px] text-fg-subtle">Hypervisor Drivers</dt>
                <dd className="font-mono text-[11px] text-fg-muted">
                  {stats?.node.driver ?? 'lxc | qemu'}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 px-5 py-3">
                <dt className="text-[13px] text-fg-subtle">Region / Node</dt>
                <dd className="font-mono text-[11px] text-fg">Frankfurt (fra-01)</dd>
              </div>
            </dl>
            <div className="flex items-start gap-2.5 border-t border-border px-5 py-3.5">
              <CheckCircle size={15} className="mt-px shrink-0 text-emerald-400" aria-hidden />
              <p className="text-[12px] leading-relaxed text-fg-subtle">
                Operating directly over Unix socket with hardware virtualisation and ZFS/btrfs root
                storage pool.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  )
}
