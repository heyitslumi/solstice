import {
  ArrowClockwise,
  ArrowRight,
  Cube,
  Desktop,
  MagnifyingGlass,
  Play,
  Plus,
  Power,
  Square,
  Trash,
  X,
} from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { AppShell } from '@/components/app-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { api, type AdminInstance } from '@/lib/api'
import { cn } from '@/lib/utils'

export function AdminServersPage() {
  const navigate = useNavigate()
  const [servers, setServers] = useState<AdminInstance[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminInstance | null>(null)
  const [acting, setActing] = useState(false)

  async function loadServers() {
    setLoading(true)
    setError(null)
    const res = await api.adminListInstances()
    if (res.ok) {
      setServers(res.data || [])
    } else {
      setError(res.error.message || 'Failed to load servers.')
    }
    setLoading(false)
  }

  useEffect(() => {
    void loadServers()
  }, [])

  async function handleAction(server: AdminInstance, action: 'start' | 'stop' | 'restart') {
    setActing(true)
    setError(null)
    const res = await api.adminInstanceAction(server.id, action)
    if (res.ok) {
      setSuccessMsg(`${action} sent to "${server.name}".`)
      await loadServers()
    } else {
      setError(res.error.message || `Failed to ${action} server.`)
    }
    setActing(false)
    setTimeout(() => setSuccessMsg(null), 3500)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setActing(true)
    const res = await api.adminDeleteInstance(deleteTarget.id)
    if (res.ok) {
      setSuccessMsg(`Server "${deleteTarget.name}" deleted.`)
      setDeleteTarget(null)
      await loadServers()
    } else {
      setError(res.error.message || 'Failed to delete server.')
    }
    setActing(false)
    setTimeout(() => setSuccessMsg(null), 3500)
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return servers
    const q = search.toLowerCase()
    return servers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.ownerEmail.toLowerCase().includes(q) ||
        s.ownerName.toLowerCase().includes(q) ||
        (s.nodeName || '').toLowerCase().includes(q),
    )
  }, [servers, search])

  const running = useMemo(() => servers.filter((s) => s.status === 'running').length, [servers])

  return (
    <AppShell
      title="Servers"
      description="Provision and manage every LXC container and KVM virtual machine."
    >
      <div className="flex w-full flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-fg-subtle">
                Servers
              </span>
              <span className="text-fg-subtle/50">/</span>
              <span className="text-[12px] font-medium text-fg">Fleet</span>
            </div>
            <h1 className="mt-1 text-[28px] font-bold tracking-tight text-fg">Servers</h1>
            <p className="text-[13px] text-fg-subtle">
              Every virtual machine, its owner, placement, and live state.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
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
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate('/admin/servers/new')}
              className="gap-1.5 text-[12px]"
            >
              <Plus size={14} weight="bold" />
              New Server
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="flex items-center gap-3.5 rounded-panel border border-border bg-surface p-4 shadow-2xs">
            <div className="flex size-10 items-center justify-center rounded-control bg-sun-500/10 text-sun-500">
              <Cube size={20} weight="bold" />
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-fg-subtle">Total Servers</span>
              <span className="text-[20px] font-bold tracking-tight text-fg">{servers.length}</span>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-panel border border-border bg-surface p-4 shadow-2xs">
            <div className="flex size-10 items-center justify-center rounded-control bg-emerald-500/10 text-emerald-500">
              <Power size={20} weight="bold" />
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-fg-subtle">Running</span>
              <span className="text-[20px] font-bold tracking-tight text-fg">{running}</span>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-panel border border-border bg-surface p-4 shadow-2xs">
            <div className="flex size-10 items-center justify-center rounded-control bg-blue-500/10 text-blue-500">
              <Desktop size={20} weight="bold" />
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-fg-subtle">vCPUs Committed</span>
              <span className="text-[20px] font-bold tracking-tight text-fg">
                {servers.reduce((sum, s) => sum + (s.cores || 0), 0)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-panel border border-border bg-surface p-4 shadow-2xs">
            <div className="flex size-10 items-center justify-center rounded-control bg-purple-500/10 text-purple-500">
              <Cube size={20} weight="bold" />
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-fg-subtle">Owners</span>
              <span className="text-[20px] font-bold tracking-tight text-fg">
                {new Set(servers.map((s) => s.ownerId)).size}
              </span>
            </div>
          </div>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}
        {successMsg && <Alert tone="success">{successMsg}</Alert>}

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-panel border border-border bg-surface p-4">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <MagnifyingGlass
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, owner, or node..."
              className="h-9 w-full rounded-control border border-border bg-surface-2/50 pl-9 pr-8 text-[12px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="text-[12px] text-fg-subtle">
            Showing <strong className="font-semibold text-fg">{filtered.length}</strong> of{' '}
            <strong className="font-semibold text-fg">{servers.length}</strong> servers
          </div>
        </div>

        <div className="overflow-x-auto rounded-panel border border-border bg-surface shadow-2xs">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface-2/40 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                <th className="px-5 py-3.5">Server</th>
                <th className="px-4 py-3.5">Owner</th>
                <th className="px-4 py-3.5">Node</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">IPv4 (NAT)</th>
                <th className="px-4 py-3.5">Specs</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && servers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-fg-subtle">
                    Loading servers...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-fg-subtle">
                    No servers provisioned yet.
                  </td>
                </tr>
              ) : (
                filtered.map((s) => (
                  <tr key={s.id} className="transition-colors hover:bg-surface-2/30">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'size-2.5 rounded-full',
                            s.status === 'running'
                              ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
                              : 'bg-zinc-600',
                          )}
                        />
                        <div>
                          <button
                            type="button"
                            onClick={() => navigate(`/admin/servers/${s.id}`)}
                            className="font-mono font-semibold text-fg hover:text-accent-text hover:underline"
                          >
                            {s.name}
                          </button>
                          <div className="text-[11px] text-fg-subtle">
                            {s.type.toUpperCase()} · {s.os}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-[12px] font-medium text-fg">{s.ownerName}</div>
                      <div className="font-mono text-[11px] text-fg-subtle">{s.ownerEmail}</div>
                    </td>
                    <td className="px-4 py-4 font-mono text-[12px] text-fg-subtle">
                      {s.nodeName || '—'}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-control border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider',
                          s.status === 'running'
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                            : 'border-border bg-surface-2/60 text-fg-subtle',
                        )}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 font-mono text-[12px] text-fg">{s.ip4}</td>
                    <td className="px-4 py-4 font-mono text-[11px] text-fg-subtle">
                      {s.cores}c · {s.memory} · {s.disk}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {s.status === 'running' ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={acting}
                              onClick={() => void handleAction(s, 'restart')}
                              className="h-7 px-2 text-[11px]"
                              title="Restart"
                            >
                              <ArrowClockwise size={13} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={acting}
                              onClick={() => void handleAction(s, 'stop')}
                              className="h-7 px-2 text-[11px]"
                              title="Stop"
                            >
                              <Square size={13} weight="fill" />
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={acting}
                            onClick={() => void handleAction(s, 'start')}
                            className="h-7 px-2 text-[11px] text-emerald-400"
                            title="Start"
                          >
                            <Play size={13} weight="fill" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/admin/servers/${s.id}`)}
                          className="h-7 px-2 text-[11px]"
                          aria-label={`Manage ${s.name}`}
                        >
                          <ArrowRight size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(s)}
                          className="h-7 px-2 text-[11px] text-danger"
                          aria-label={`Delete ${s.name}`}
                        >
                          <Trash size={13} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <DialogContent className="max-w-md">
            <DialogTitle>Delete Server</DialogTitle>
            <DialogDescription>
              Stop and permanently delete <strong className="text-fg">{deleteTarget?.name}</strong>{' '}
              owned by <strong className="text-fg">{deleteTarget?.ownerEmail}</strong>? All data on
              it will be destroyed. This cannot be undone.
            </DialogDescription>

            <div className="mt-5 flex justify-end gap-2.5">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button variant="danger" disabled={acting} onClick={handleDelete}>
                {acting ? 'Deleting...' : 'Delete Server'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  )
}
