import {
  ArrowClockwise,
  ChartPieSlice,
  CheckCircle,
  Plug,
  Plus,
  Trash,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { AppShell } from '@/components/app-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { api, type ApiInstance, type PortForward } from '@/lib/api'
import { cn } from '@/lib/utils'

export function NetworkPage() {
  const [servers, setServers] = useState<ApiInstance[]>([])
  const [forwards, setForwards] = useState<PortForward[]>([])
  const [host, setHost] = useState('localhost')
  const [range, setRange] = useState({ start: 22000, end: 22999, allocated: 1000 })
  const [used, setUsed] = useState(0)
  const [quota, setQuota] = useState({ used: 0, limit: 5 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Add form
  const [serverId, setServerId] = useState('')
  const [containerPort, setContainerPort] = useState('')
  const [protocol, setProtocol] = useState('tcp')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [serversRes, forwardsRes] = await Promise.all([
      api.listInstances(),
      api.listPortForwards(),
    ])
    if (serversRes.ok) setServers(serversRes.data.instances)
    else setError(serversRes.error.message || 'Failed to load servers.')
    if (forwardsRes.ok) {
      setForwards(forwardsRes.data.forwards || [])
      setHost(forwardsRes.data.host || 'localhost')
      setRange(forwardsRes.data.range)
      setUsed(forwardsRes.data.used ?? 0)
      if (forwardsRes.data.quota) setQuota(forwardsRes.data.quota)
    } else if (!serversRes.ok) {
      setError(forwardsRes.error.message || 'Failed to load port forwards.')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!serverId || !containerPort) return
    setSubmitting(true)
    setError(null)
    const res = await api.createPortForward(serverId, {
      containerPort: Number(containerPort),
      protocol,
      description: description.trim(),
    })
    if (res.ok) {
      setSuccessMsg(
        `Forward created: ${res.data.host}:${res.data.hostPort} → ${res.data.containerPort}/${res.data.protocol}.`,
      )
      setServerId('')
      setContainerPort('')
      setDescription('')
      await loadAll()
    } else {
      setError(res.error.message || 'Failed to create port forward.')
    }
    setSubmitting(false)
    setTimeout(() => setSuccessMsg(null), 4000)
  }

  async function handleRemove(fwd: PortForward) {
    setRemovingId(fwd.id)
    setError(null)
    const res = await api.deletePortForward(fwd.instanceId, fwd.id)
    if (res.ok) {
      setSuccessMsg(`Forward on port ${fwd.hostPort} removed.`)
      await loadAll()
    } else {
      setError(res.error.message || 'Failed to remove port forward.')
    }
    setRemovingId(null)
    setTimeout(() => setSuccessMsg(null), 4000)
  }

  const available = Math.max(0, range.allocated - used)

  const cards = useMemo(
    () => [
      {
        icon: <ChartPieSlice size={18} aria-hidden />,
        tint: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
        label: 'Allocated ports',
        value: String(range.allocated),
      },
      {
        icon: <CheckCircle size={18} aria-hidden />,
        tint: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        label: 'Used ports',
        value: String(used),
      },
      {
        icon: <Plug size={18} aria-hidden />,
        tint: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
        label: 'Available ports',
        value: String(available),
      },
    ],
    [range.allocated, used, available],
  )

  return (
    <AppShell
      title="Network"
      description="Expose container services to the public internet via NAT port forwards."
    >
      <div className="flex w-full flex-col gap-5">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-fg">Port Forwarding</h1>
          <p className="mt-0.5 font-mono text-[11px] text-fg-subtle">
            Dashboard · Port Forwarding
          </p>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}
        {successMsg && <Alert tone="success">{successMsg}</Alert>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {cards.map((card) => (
            <div
              key={card.label}
              className="flex items-center gap-3.5 rounded-panel border border-border bg-surface p-4 shadow-2xs"
            >
              <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-control', card.tint)}>
                {card.icon}
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
                  {card.label}
                </span>
                <span className="font-mono text-[20px] font-bold leading-tight tracking-tight text-fg">
                  {card.value}
                </span>
              </div>
            </div>
          ))}
        </div>

        <section className="rounded-panel border border-border bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-[14px] font-semibold text-fg">
              <Plus size={15} className="text-accent-text" aria-hidden />
              Add New Port Forward
            </h2>
            <span className="font-mono text-[11px] text-fg-subtle">
              {quota.used} / {quota.limit} forwards used
            </span>
          </div>
          <div
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-valuenow={quota.used}
            aria-valuemax={Math.max(1, quota.limit)}
          >
            <div
              className="h-full rounded-full bg-accent transition-[width]"
              style={{ width: `${quota.limit > 0 ? Math.min(100, (quota.used / quota.limit) * 100) : 100}%` }}
            />
          </div>
          {quota.used >= quota.limit && (
            <p className="mt-3 rounded-control border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-600 dark:text-amber-400">
              You&apos;ve reached your forward limit ({quota.limit}). Remove one below or ask an
              admin to raise it.
            </p>
          )}

          <form onSubmit={handleAdd} className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-fg">Select VPS</label>
              <select
                value={serverId}
                onChange={(e) => setServerId(e.target.value)}
                required
                disabled={loading}
                className="h-10 rounded-control border border-field-border bg-field px-3 text-[13px] text-fg focus:border-accent focus:outline-none"
              >
                <option value="">Choose a VPS...</option>
                {servers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.status})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-fg">VPS Port</label>
              <input
                type="number"
                min={1}
                max={65535}
                required
                value={containerPort}
                onChange={(e) => setContainerPort(e.target.value)}
                placeholder="e.g., 80, 443, 22"
                className="h-10 rounded-control border border-field-border bg-field px-3 font-mono text-[13px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-fg">Protocol</label>
              <select
                value={protocol}
                onChange={(e) => setProtocol(e.target.value)}
                className="h-10 rounded-control border border-field-border bg-field px-3 text-[13px] text-fg focus:border-accent focus:outline-none"
              >
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
                <option value="both">TCP + UDP</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-fg">Description (optional)</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Web Server"
                maxLength={80}
                className="h-10 rounded-control border border-field-border bg-field px-3 text-[13px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
              />
            </div>

            <div className="md:col-span-2 flex justify-end">
              <Button type="submit" variant="primary" disabled={submitting || quota.used >= quota.limit} className="gap-1.5 text-[13px]">
                <Plug size={15} />
                {submitting ? 'Creating...' : 'Add Port Forward'}
              </Button>
            </div>
          </form>
        </section>

        <section className="rounded-panel border border-border bg-surface">
          <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
            <h2 className="text-[14px] font-semibold text-fg">Active Port Forwards</h2>
            <Button
              variant="secondary"
              size="sm"
              onClick={loadAll}
              disabled={loading}
              className="gap-1.5 text-[12px]"
            >
              <ArrowClockwise size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </Button>
          </div>

          {loading && forwards.length === 0 ? (
            <p className="p-8 text-center text-[13px] text-fg-subtle">Loading forwards...</p>
          ) : forwards.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <Plug size={32} className="text-fg-subtle/50" aria-hidden />
              <p className="text-[15px] font-semibold text-fg">No Port Forwards</p>
              <p className="max-w-sm text-[13px] text-fg-subtle">
                You haven&apos;t set up any port forwarding rules yet. Use the form above to
                expose your first service.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-border text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
                    <th className="px-5 py-3 font-medium">Server</th>
                    <th className="px-4 py-3 font-medium">Mapping</th>
                    <th className="px-4 py-3 font-medium">Protocol</th>
                    <th className="px-4 py-3 font-medium">Description</th>
                    <th className="px-5 py-3 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {forwards.map((fwd) => (
                    <tr key={fwd.id} className="transition-colors hover:bg-surface-2/40">
                      <td className="px-5 py-3.5 font-medium text-fg">{fwd.instanceName}</td>
                      <td className="px-4 py-3.5 font-mono text-[12px] text-fg">
                        {host}:{fwd.hostPort} → :{fwd.containerPort}
                        {fwd.kind === 'ssh' && (
                          <span className="ml-2 rounded-control border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] text-fg-subtle">
                            SSH
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="rounded-control border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] uppercase text-fg-subtle">
                          {fwd.protocol}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-[12px] text-fg-subtle">
                        {fwd.description || '—'}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={removingId === fwd.id}
                          onClick={() => void handleRemove(fwd)}
                          className="h-7 px-2 text-[11px] gap-1"
                        >
                          <Trash size={13} />
                          {removingId === fwd.id ? 'Removing...' : 'Remove'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  )
}

