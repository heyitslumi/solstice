import {
  ArrowClockwise,
  ArrowLeft,
  ArrowsDownUp,
  CheckCircle,
  Copy,
  Cpu,
  DotsThreeVertical,
  Gauge,
  Play,
  Square,
  Trash,
} from '@phosphor-icons/react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { AppShell } from '@/components/app-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { api, type ApiInstanceDetail } from '@/lib/api'

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

export function ServerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [instance, setInstance] = useState<ApiInstanceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const loadInstance = useCallback(async () => {
    if (!id) return
    const res = await api.getInstance(id)
    if (res.ok) {
      setInstance(res.data.instance)
    } else {
      setError(res.error.message || 'Instance not found')
    }
    setLoading(false)
  }, [id])

  useEffect(() => {
    loadInstance()
    const timer = setInterval(loadInstance, 5000)
    return () => clearInterval(timer)
  }, [loadInstance])

  async function handlePowerAction(action: 'start' | 'stop' | 'restart') {
    if (!id) return
    setActionLoading(true)
    try {
      const res = await api.instanceAction(id, action)
      if (res.ok) {
        await loadInstance()
      }
    } finally {
      setActionLoading(false)
    }
  }

  async function handleDelete() {
    if (!id || !instance) return
    if (
      !window.confirm(
        `Are you sure you want to permanently delete "${instance.name}"? All data will be lost.`,
      )
    ) {
      return
    }
    setActionLoading(true)
    try {
      const res = await api.deleteInstance(id)
      if (res.ok) {
        navigate('/dashboard')
      }
    } finally {
      setActionLoading(false)
    }
  }

  function copyToClipboard(text: string, field: string) {
    if (!text || text === '—') return
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  if (loading) {
    return (
      <AppShell title="Loading Instance..." description="Connecting to Incus engine...">
        <div className="flex h-64 items-center justify-center">
          <ArrowClockwise size={24} className="animate-spin text-fg-subtle" />
        </div>
      </AppShell>
    )
  }

  if (error || !instance) {
    return (
      <AppShell title="Server Not Found" description="The requested instance could not be found.">
        <div className="flex flex-col items-start gap-4">
          <Alert tone="danger">{error || 'Server not found'}</Alert>
          <Button asChild variant="secondary">
            <Link to="/dashboard">
              <ArrowLeft size={16} />
              Return to Dashboard
            </Link>
          </Button>
        </div>
      </AppShell>
    )
  }

  const isRunning = instance.status === 'running'
  const sshCommand = `ssh root@${instance.ip4 !== '—' ? instance.ip4 : '<instance-ip>'}`

  return (
    <AppShell
      title={
        <div className="flex items-center gap-3">
          <Link
            to="/dashboard"
            className="flex size-8 items-center justify-center rounded-control border border-border bg-surface hover:bg-surface-2 text-fg-subtle hover:text-fg transition-colors"
            title="Back to instances"
          >
            <ArrowLeft size={16} />
          </Link>
          <span>{instance.name}</span>
          <span
            className={`inline-flex items-center px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider rounded-control border ${
              instance.type === 'kvm'
                ? 'border-sky-500/30 bg-sky-500/10 text-sky-400'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
            }`}
          >
            {instance.type.toUpperCase()}
          </span>
        </div>
      }
      description={`${instance.os} · ${instance.region} · Created on ${new Date(
        instance.createdAt,
      ).toLocaleDateString()}`}
      actions={
        <div className="flex items-center gap-2">
          {isRunning ? (
            <>
              <Button
                size="sm"
                variant="secondary"
                disabled={actionLoading}
                onClick={() => handlePowerAction('restart')}
              >
                <ArrowClockwise size={15} className={actionLoading ? 'animate-spin' : ''} />
                Restart
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={actionLoading}
                onClick={() => handlePowerAction('stop')}
                className="text-danger hover:bg-danger-surface"
              >
                <Square size={14} weight="fill" />
                Stop
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              disabled={actionLoading}
              onClick={() => handlePowerAction('start')}
              className="text-emerald-400"
            >
              <Play size={14} weight="fill" />
              Start
            </Button>
          )}

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button size="icon" variant="secondary" className="size-8" disabled={actionLoading}>
                <DotsThreeVertical size={16} weight="bold" />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                className="z-50 min-w-[9.5rem] rounded-control border border-border bg-surface p-1 shadow-xl"
              >
                <DropdownMenu.Item
                  disabled={actionLoading}
                  className="flex cursor-default items-center gap-2 rounded-control px-2.5 py-1.5 text-[13px] text-danger outline-none data-[highlighted]:bg-danger-surface"
                  onSelect={handleDelete}
                >
                  <Trash size={14} />
                  Delete Instance
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      }
    >
      <div className="grid w-full gap-5 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* Left Column: Telemetry, Network, Access */}
        <div className="flex flex-col gap-5">
          {/* Quick Telemetry Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="flex flex-col gap-1 rounded-panel border border-border bg-surface p-4">
              <div className="flex items-center justify-between text-fg-subtle text-[11px]">
                <span>State</span>
                <span
                  className={`size-2 rounded-full ${
                    isRunning
                      ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
                      : 'bg-zinc-600'
                  }`}
                />
              </div>
              <span className="font-semibold text-fg text-sm capitalize">{instance.status}</span>
              <span className="text-[11px] text-fg-subtle">{instance.uptime}</span>
            </div>

            <div className="flex flex-col gap-1 rounded-panel border border-border bg-surface p-4">
              <div className="flex items-center justify-between text-fg-subtle text-[11px]">
                <span>CPU Load</span>
                <Cpu size={14} />
              </div>
              <span className="font-semibold text-fg text-sm">{instance.cpuUsage}%</span>
              <span className="text-[11px] text-fg-subtle">{instance.cores} vCPU assigned</span>
            </div>

            <div className="flex flex-col gap-1 rounded-panel border border-border bg-surface p-4">
              <div className="flex items-center justify-between text-fg-subtle text-[11px]">
                <span>Memory</span>
                <Gauge size={14} />
              </div>
              <span className="font-semibold text-fg text-sm">{instance.ramUsage}%</span>
              <span className="text-[11px] text-fg-subtle">{instance.memory} allocated</span>
            </div>

            <div className="flex flex-col gap-1 rounded-panel border border-border bg-surface p-4">
              <div className="flex items-center justify-between text-fg-subtle text-[11px]">
                <span>Network I/O</span>
                <ArrowsDownUp size={14} />
              </div>
              <span className="font-semibold text-fg text-sm">{instance.bandwidth}</span>
              <span className="text-[11px] text-fg-subtle">Total ingress/egress</span>
            </div>
          </div>

          {/* SSH & Terminal Connect */}
          <Panel title="SSH Access">
            <div className="flex flex-col gap-3 p-5">
              <p className="text-[13px] text-fg-muted">
                Connect securely to your instance terminal using your configured SSH key.
              </p>
              <div className="flex items-center justify-between gap-3 rounded-control border border-border bg-field-bg px-3.5 py-2.5">
                <span className="font-mono text-[12px] text-fg select-all">{sshCommand}</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(sshCommand, 'ssh')}
                  className="flex items-center gap-1 text-[11px] text-fg-subtle hover:text-fg transition-colors"
                  title="Copy command"
                >
                  {copiedField === 'ssh' ? (
                    <>
                      <CheckCircle size={14} className="text-emerald-400" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      Copy
                    </>
                  )}
                </button>
              </div>
            </div>
          </Panel>

          {/* Network Interfaces */}
          <Panel title="Network Interfaces">
            {instance.networkInterfaces && instance.networkInterfaces.length > 0 ? (
              <div className="divide-y divide-border">
                {instance.networkInterfaces.map((iface) => (
                  <div key={iface.interface} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-fg">
                          {iface.interface}
                        </span>
                        <span className="rounded-control border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] text-fg-subtle uppercase">
                          {iface.state}
                        </span>
                      </div>
                      <p className="font-mono text-[11px] text-fg-subtle">MAC: {iface.hwaddr}</p>
                    </div>

                    <div className="flex flex-col gap-1 font-mono text-xs text-fg-muted sm:text-right">
                      <div className="flex items-center gap-2 sm:justify-end">
                        <span className="text-fg">{iface.ip4}</span>
                        {iface.ip4 !== '—' && (
                          <button
                            type="button"
                            onClick={() => copyToClipboard(iface.ip4, `ip4-${iface.interface}`)}
                            className="text-fg-subtle hover:text-fg"
                          >
                            <Copy size={13} />
                          </button>
                        )}
                      </div>
                      <div className="text-[11px] text-fg-subtle">
                        RX: {iface.rxFormatted} · TX: {iface.txFormatted}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-fg-subtle">
                No active network interfaces reported.
              </div>
            )}
          </Panel>
        </div>

        {/* Right Column: Hardware & Specs */}
        <div className="flex flex-col gap-5">
          <Panel title="Instance Specs">
            <dl className="flex flex-col">
              <div className="flex items-baseline justify-between gap-4 border-b border-border/70 px-5 py-3">
                <dt className="text-[13px] text-fg-subtle">Virtualization</dt>
                <dd className="font-mono text-[12px] font-semibold uppercase text-fg">
                  {instance.type}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-b border-border/70 px-5 py-3">
                <dt className="text-[13px] text-fg-subtle">vCPU</dt>
                <dd className="font-mono text-[12px] text-fg">{instance.cores} Cores</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-b border-border/70 px-5 py-3">
                <dt className="text-[13px] text-fg-subtle">RAM</dt>
                <dd className="font-mono text-[12px] text-fg">{instance.memory}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-b border-border/70 px-5 py-3">
                <dt className="text-[13px] text-fg-subtle">NVMe Storage</dt>
                <dd className="font-mono text-[12px] text-fg">{instance.disk}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-b border-border/70 px-5 py-3">
                <dt className="text-[13px] text-fg-subtle">Image Alias</dt>
                <dd className="font-mono text-[12px] text-fg">{instance.imageAlias}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 px-5 py-3">
                <dt className="text-[13px] text-fg-subtle">IPv4 Address</dt>
                <dd className="flex items-center gap-1.5 font-mono text-[12px] text-fg">
                  {instance.ip4}
                  {instance.ip4 !== '—' && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(instance.ip4, 'ip4')}
                      className="text-fg-subtle hover:text-fg"
                      title="Copy IPv4"
                    >
                      <Copy size={13} />
                    </button>
                  )}
                </dd>
              </div>
            </dl>
          </Panel>

          <Panel title="Danger Zone">
            <div className="flex flex-col gap-3 p-5">
              <p className="text-xs text-fg-subtle">
                Permanently destroy this instance. Storage volumes and state will be erased.
              </p>
              <Button
                variant="secondary"
                disabled={actionLoading}
                onClick={handleDelete}
                className="w-full justify-center text-danger hover:bg-danger-surface"
              >
                <Trash size={16} />
                Delete Instance
              </Button>
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  )
}
