import {
  ArrowClockwise,
  ArrowsDownUp,
  CaretRight,
  Cpu,
  DotsThreeVertical,
  Gauge,
  GearSix,
  HardDrive,
  HardDrives,
  LinuxLogo,
  Play,
  Plus,
  Square,
  Terminal,
} from '@phosphor-icons/react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { useSession } from '@/lib/session'

interface MockServer {
  id: string
  name: string
  type: 'kvm' | 'lxc'
  os: string
  status: 'running' | 'stopped'
  ip4: string
  ip6: string
  cores: number
  memory: string
  disk: string
  uptime: string
  region: string
  cpuUsage: number
  ramUsage: number
  bandwidth: string
}

const MOCK_SERVERS: MockServer[] = [
  {
    id: 'inst-9f82d1',
    name: 'edge-gateway-01',
    type: 'kvm',
    os: 'Ubuntu 24.04 LTS (x86_64)',
    status: 'running',
    ip4: '194.38.20.14',
    ip6: '2a02:4780:11::1',
    cores: 4,
    memory: '8 GB',
    disk: '80 GB NVMe',
    uptime: '14d 6h 32m',
    region: 'Frankfurt (fra-01)',
    cpuUsage: 18,
    ramUsage: 42,
    bandwidth: '2.4 TB',
  },
  {
    id: 'inst-3e41a8',
    name: 'core-worker-app',
    type: 'lxc',
    os: 'Debian 13 (Trixie)',
    status: 'running',
    ip4: '194.38.20.89',
    ip6: '2a02:4780:11::2',
    cores: 2,
    memory: '2 GB',
    disk: '25 GB NVMe',
    uptime: '4d 18h 12m',
    region: 'Frankfurt (fra-01)',
    cpuUsage: 6,
    ramUsage: 28,
    bandwidth: '410 GB',
  },
]

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

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
  const { user, session } = useSession()
  const [servers, setServers] = useState<MockServer[]>(MOCK_SERVERS)

  function togglePower(id: string) {
    setServers((prev) =>
      prev.map((srv) => {
        if (srv.id !== id) return srv
        const nextStatus = srv.status === 'running' ? 'stopped' : 'running'
        return { ...srv, status: nextStatus }
      }),
    )
  }

  return (
    <AppShell
      title={user ? `Welcome back, ${user.name.split(' ')[0]}.` : 'Welcome back.'}
      description="Manage your KVM virtual machines, LXC system containers, and networking allocations."
      actions={
        <Button size="sm" variant="secondary" disabled title="Provisioning wizard connects in next phase">
          <Plus size={15} aria-hidden />
          New server
        </Button>
      }
    >
      <div className="grid w-full gap-5 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-5">
          <Panel
            title="Instances"
            action={
              <span className="font-mono text-[11px] text-fg-subtle">
                {servers.length} configured ({servers.filter((s) => s.status === 'running').length} running)
              </span>
            }
          >
            <div className="divide-y divide-border/60">
              {servers.map((srv) => {
                const isRunning = srv.status === 'running'
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
                          <h3 className="text-[14px] font-semibold text-fg tracking-tight">
                            {srv.name}
                          </h3>
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
                          <span className="font-mono text-[11px] text-fg-subtle">{srv.region}</span>
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

                    {/* Middle: Live telemetry metrics that make purposeful use of horizontal screen real estate */}
                    <div className="hidden grid-cols-3 gap-6 rounded-control border border-border/50 bg-surface-2/30 px-4 py-2.5 xl:grid">
                      <div className="flex flex-col gap-1 min-w-[7.5rem]">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="flex items-center gap-1 text-fg-subtle">
                            <Cpu size={12} aria-hidden />
                            CPU Load
                          </span>
                          <span className="font-mono text-fg">{isRunning ? `${srv.cpuUsage}%` : '0%'}</span>
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
                          <span className="font-mono text-fg">{isRunning ? `${srv.ramUsage}%` : '0%'}</span>
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
                          >
                            <DotsThreeVertical size={16} weight="bold" aria-hidden />
                          </Button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content
                            align="end"
                            sideOffset={4}
                            className="z-50 min-w-[9.5rem] rounded-control border border-border bg-surface p-1 shadow-xl"
                          >
                            <DropdownMenu.Item
                              disabled={isRunning}
                              className={`flex cursor-default items-center gap-2 rounded-control px-2.5 py-1.5 text-[13px] outline-none ${
                                isRunning
                                  ? 'text-fg-subtle/50 opacity-40 cursor-not-allowed'
                                  : 'text-fg data-[highlighted]:bg-surface-2'
                              }`}
                              onSelect={() => {
                                if (!isRunning) togglePower(srv.id)
                              }}
                            >
                              <Play size={14} weight="fill" aria-hidden />
                              Start
                            </DropdownMenu.Item>

                            <DropdownMenu.Item
                              disabled={!isRunning}
                              className={`flex cursor-default items-center gap-2 rounded-control px-2.5 py-1.5 text-[13px] outline-none ${
                                !isRunning
                                  ? 'text-fg-subtle/50 opacity-40 cursor-not-allowed'
                                  : 'text-fg data-[highlighted]:bg-surface-2'
                              }`}
                              onSelect={() => {
                                if (isRunning) {
                                  // toggle restart mock
                                  setServers((prev) =>
                                    prev.map((s) => (s.id === srv.id ? { ...s, status: 'running' } : s)),
                                  )
                                }
                              }}
                            >
                              <ArrowClockwise size={14} aria-hidden />
                              Restart
                            </DropdownMenu.Item>

                            <DropdownMenu.Item
                              disabled={!isRunning}
                              className={`flex cursor-default items-center gap-2 rounded-control px-2.5 py-1.5 text-[13px] outline-none ${
                                !isRunning
                                  ? 'text-danger/40 opacity-40 cursor-not-allowed'
                                  : 'text-danger data-[highlighted]:bg-danger-surface'
                              }`}
                              onSelect={() => {
                                if (isRunning) togglePower(srv.id)
                              }}
                            >
                              <Square size={14} weight="fill" className="text-danger" aria-hidden />
                              Stop
                            </DropdownMenu.Item>
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Root>

                      <Link
                        to={`/servers/${srv.id}`}
                        aria-label={`Open ${srv.name}`}
                        className="flex size-8 items-center justify-center rounded-control text-fg-subtle transition-colors duration-150 hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
                      >
                        <CaretRight size={16} weight="bold" aria-hidden />
                      </Link>
                    </div>
                  </article>
                )
              })}
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-5">
          <Panel title="Account">
            <dl className="flex flex-col">
              <div className="flex items-baseline justify-between gap-4 border-b border-border/70 px-5 py-3">
                <dt className="text-[13px] text-fg-subtle">Name</dt>
                <dd className="truncate text-[13px] text-fg">{user?.name ?? '—'}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-b border-border/70 px-5 py-3">
                <dt className="text-[13px] text-fg-subtle">Email</dt>
                <dd className="truncate font-mono text-[12px] text-fg">{user?.email ?? '—'}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 px-5 py-3">
                <dt className="text-[13px] text-fg-subtle">Member since</dt>
                <dd className="font-mono text-[12px] text-fg">
                  {user ? formatDate(user.createdAt) : '—'}
                </dd>
              </div>
            </dl>
          </Panel>

          <Panel title="Session">
            <dl className="flex flex-col">
              <div className="flex items-baseline justify-between gap-4 border-b border-border/70 px-5 py-3">
                <dt className="text-[13px] text-fg-subtle">Started</dt>
                <dd className="font-mono text-[12px] text-fg">
                  {session ? formatDate(session.createdAt) : '—'}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 px-5 py-3">
                <dt className="text-[13px] text-fg-subtle">Expires</dt>
                <dd className="font-mono text-[12px] text-fg">
                  {session ? formatDate(session.expiresAt) : '—'}
                </dd>
              </div>
            </dl>
            <div className="flex items-start gap-2.5 border-t border-border px-5 py-3.5">
              <GearSix size={15} className="mt-px shrink-0 text-fg-subtle" aria-hidden />
              <p className="text-[12px] leading-relaxed text-fg-subtle">
                Sessions are stored hashed in the database. Password resets revoke every other
                session on the account.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  )
}
