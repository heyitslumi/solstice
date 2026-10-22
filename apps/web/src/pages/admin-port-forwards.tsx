import {
  ArrowClockwise,
  ArrowRight,
  ChartPieSlice,
  CheckCircle,
  MagnifyingGlass,
  Plug,
  Trash,
  X,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { AppShell } from '@/components/app-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

interface AdminForward {
  id: string
  kind: string
  host: string
  hostPort: number
  containerPort: number
  protocol: string
  description: string
  createdAt: string
  instance: { id: string; name: string; type: string }
  owner: { id: string; email: string; name: string }
}

export function AdminPortForwardsPage() {
  const [forwards, setForwards] = useState<AdminForward[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [removingId, setRemovingId] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await api.adminListPortForwards()
    if (res.ok) {
      setForwards(res.data.forwards || [])
    } else {
      setError(res.error.message || 'Failed to load port forwards.')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  async function handleRemove(fwd: AdminForward) {
    setRemovingId(fwd.id)
    setError(null)
    const res = await api.adminDeletePortForward(fwd.id)
    if (res.ok) {
      setSuccessMsg(`Forward on port ${fwd.hostPort} (${fwd.instance.name}) removed.`)
      setTimeout(() => setSuccessMsg(null), 4000)
      await loadAll()
    } else {
      setError(res.error.message || 'Failed to remove port forward.')
    }
    setRemovingId(null)
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return forwards
    return forwards.filter(
      (f) =>
        f.instance.name.toLowerCase().includes(q) ||
        f.owner.email.toLowerCase().includes(q) ||
        (f.owner.name || '').toLowerCase().includes(q) ||
        String(f.hostPort).includes(q) ||
        String(f.containerPort).includes(q) ||
        (f.description || '').toLowerCase().includes(q),
    )
  }, [forwards, search])

  const cards = useMemo(() => {
    const ssh = forwards.filter((f) => f.kind === 'ssh').length
    return [
      {
        icon: <ChartPieSlice size={18} aria-hidden />,
        tint: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
        label: 'Total forwards',
        value: String(forwards.length),
      },
      {
        icon: <CheckCircle size={18} aria-hidden />,
        tint: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        label: 'Direct SSH',
        value: String(ssh),
      },
      {
        icon: <Plug size={18} aria-hidden />,
        tint: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
        label: 'Custom forwards',
        value: String(forwards.length - ssh),
      },
    ]
  }, [forwards])

  return (
    <AppShell title="Port Forwards" description="Every NAT forward on the panel, all users.">
      <div className="flex w-full flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-bold tracking-tight text-fg">Port Forwards</h1>
            <p className="mt-0.5 font-mono text-[11px] text-fg-subtle">Admin · Port Forwards</p>
          </div>
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

        <section className="rounded-panel border border-border bg-surface">
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
            <div className="relative min-w-[220px] flex-1 max-w-md">
              <MagnifyingGlass
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by server, owner, port..."
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
            <span className="ml-auto font-mono text-[11px] text-fg-subtle">
              Showing {visible.length} of {forwards.length}
            </span>
          </div>

          {loading && forwards.length === 0 ? (
            <p className="p-8 text-center text-[13px] text-fg-subtle">Loading forwards...</p>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <Plug size={32} className="text-fg-subtle/50" aria-hidden />
              <p className="text-[15px] font-semibold text-fg">No Port Forwards</p>
              <p className="max-w-sm text-[13px] text-fg-subtle">
                {forwards.length === 0
                  ? 'No user has created a port forward yet.'
                  : 'Try a different search.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-border text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
                    <th className="px-5 py-3 font-medium">Server</th>
                    <th className="px-4 py-3 font-medium">Owner</th>
                    <th className="px-4 py-3 font-medium">Mapping</th>
                    <th className="px-4 py-3 font-medium">Protocol</th>
                    <th className="px-4 py-3 font-medium">Description</th>
                    <th className="px-5 py-3 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {visible.map((fwd) => (
                    <tr key={fwd.id} className="transition-colors hover:bg-surface-2/40">
                      <td className="px-5 py-3.5">
                        <Link
                          to={`/admin/servers/${fwd.instance.id}`}
                          className="font-medium text-fg hover:text-accent-text hover:underline"
                        >
                          {fwd.instance.name}
                        </Link>
                        <span className="ml-2 font-mono text-[10px] uppercase text-fg-subtle">
                          {fwd.instance.type}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <Link
                          to={`/admin/users/${fwd.owner.id}`}
                          className="text-[12px] text-fg hover:text-accent-text hover:underline"
                        >
                          {fwd.owner.name || fwd.owner.email}
                        </Link>
                        {fwd.owner.name && (
                          <div className="font-mono text-[11px] text-fg-subtle">{fwd.owner.email}</div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-[12px] text-fg">
                        {fwd.host}:{fwd.hostPort} → :{fwd.containerPort}
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
                      <td className="px-5 py-3.5">
                        <div className="flex justify-end gap-1.5">
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
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            asChild
                          >
                            <Link
                              to={`/admin/servers/${fwd.instance.id}`}
                              aria-label={`Manage ${fwd.instance.name}`}
                            >
                              <ArrowRight size={13} />
                            </Link>
                          </Button>
                        </div>
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
