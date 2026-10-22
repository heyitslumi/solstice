import {
  ArrowClockwise,
  ArrowCounterClockwise,
  Camera,
  HardDrives,
  Trash,
  Warning,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { AppShell } from '@/components/app-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { api, type GlobalSnapshot } from '@/lib/api'
import { cn } from '@/lib/utils'

export function SnapshotsPage() {
  const [snapshots, setSnapshots] = useState<GlobalSnapshot[]>([])
  const [unreachable, setUnreachable] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [serverFilter, setServerFilter] = useState('')
  const [workingKey, setWorkingKey] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await api.listAllSnapshots()
    if (res.ok) {
      setSnapshots(res.data.snapshots || [])
      setUnreachable(res.data.unreachable || [])
    } else {
      setError(res.error.message || 'Failed to load snapshots.')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  function flashSuccess(msg: string) {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 4000)
  }

  async function handleRestore(snap: GlobalSnapshot) {
    setWorkingKey(`${snap.instanceId}:${snap.name}:restore`)
    setError(null)
    const res = await api.restoreSnapshot(snap.instanceId, snap.name)
    if (res.ok) {
      flashSuccess(`Restored snapshot "${snap.name}" on "${snap.instanceName}".`)
    } else {
      setError(res.error.message || 'Failed to restore snapshot.')
    }
    setWorkingKey(null)
  }

  async function handleDelete(snap: GlobalSnapshot) {
    setWorkingKey(`${snap.instanceId}:${snap.name}:delete`)
    setError(null)
    const res = await api.deleteSnapshot(snap.instanceId, snap.name)
    if (res.ok) {
      flashSuccess(`Deleted snapshot "${snap.name}" from "${snap.instanceName}".`)
      await loadAll()
    } else {
      setError(res.error.message || 'Failed to delete snapshot.')
    }
    setWorkingKey(null)
  }

  const servers = useMemo(
    () => Array.from(new Set(snapshots.map((s) => s.instanceName))).sort(),
    [snapshots],
  )
  const visible = useMemo(
    () => (serverFilter ? snapshots.filter((s) => s.instanceName === serverFilter) : snapshots),
    [snapshots, serverFilter],
  )

  const cards = useMemo(
    () => [
      {
        icon: <Camera size={18} aria-hidden />,
        tint: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
        label: 'Total snapshots',
        value: String(snapshots.length),
      },
      {
        icon: <HardDrives size={18} aria-hidden />,
        tint: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        label: 'Servers backed up',
        value: String(servers.length),
      },
      {
        icon: <Warning size={18} aria-hidden />,
        tint: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
        label: 'Unreachable servers',
        value: String(unreachable.length),
      },
    ],
    [snapshots.length, servers.length, unreachable.length],
  )

  return (
    <AppShell
      title="Snapshots"
      description="Every snapshot across all your servers, in one place."
    >
      <div className="flex w-full flex-col gap-5">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-fg">Snapshots</h1>
          <p className="mt-0.5 font-mono text-[11px] text-fg-subtle">
            Dashboard · Snapshots
          </p>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}
        {successMsg && <Alert tone="success">{successMsg}</Alert>}
        {unreachable.length > 0 && (
          <Alert tone="warning">
            Couldn&apos;t reach {unreachable.length === 1 ? 'this server' : 'these servers'}:{' '}
            {unreachable.join(', ')}. Its snapshots aren&apos;t listed below.
          </Alert>
        )}

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
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <h2 className="text-[14px] font-semibold text-fg">All Snapshots</h2>
            <div className="flex items-center gap-2">
              {servers.length > 1 && (
                <select
                  value={serverFilter}
                  onChange={(e) => setServerFilter(e.target.value)}
                  aria-label="Filter by server"
                  className="h-8 rounded-control border border-field-border bg-field px-2.5 text-[12px] text-fg focus:border-accent focus:outline-none"
                >
                  <option value="">All servers</option>
                  {servers.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              )}
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
          </div>

          {loading && snapshots.length === 0 ? (
            <p className="p-8 text-center text-[13px] text-fg-subtle">Loading snapshots...</p>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <Camera size={32} className="text-fg-subtle/50" aria-hidden />
              <p className="text-[15px] font-semibold text-fg">No Snapshots</p>
              <p className="max-w-sm text-[13px] text-fg-subtle">
                {serverFilter
                  ? `No snapshots on "${serverFilter}" yet.`
                  : 'You haven\u2019t taken any snapshots yet. Open a server to take your first one — they freeze the disk state so you can roll back after risky changes.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-border text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
                    <th className="px-5 py-3 font-medium">Server</th>
                    <th className="px-4 py-3 font-medium">Snapshot</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-5 py-3 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {visible.map((snap) => {
                    const key = `${snap.instanceId}:${snap.name}`
                    const busy = workingKey === `${key}:restore` || workingKey === `${key}:delete`
                    return (
                      <tr key={key} className="transition-colors hover:bg-surface-2/40">
                        <td className="px-5 py-3.5">
                          <Link
                            to={`/servers/${snap.instanceId}`}
                            className="font-medium text-fg hover:text-accent-text hover:underline"
                          >
                            {snap.instanceName}
                          </Link>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="font-mono text-[12px] font-semibold text-fg">
                            {snap.name}
                          </span>
                          {snap.stateful && (
                            <span className="ml-2 rounded-control border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase text-fg-subtle">
                              stateful
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-[12px] text-fg-subtle">
                          {new Date(snap.createdAt).toLocaleString()}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex justify-end gap-1.5">
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={busy}
                              onClick={() => void handleRestore(snap)}
                              className="h-7 px-2 text-[11px] gap-1"
                            >
                              <ArrowCounterClockwise size={13} />
                              {workingKey === `${key}:restore` ? 'Restoring...' : 'Restore'}
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={busy}
                              onClick={() => void handleDelete(snap)}
                              className="h-7 px-2 text-[11px] gap-1"
                              aria-label={`Delete snapshot ${snap.name} on ${snap.instanceName}`}
                            >
                              <Trash size={13} />
                              {workingKey === `${key}:delete` ? 'Deleting...' : 'Delete'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="text-[12px] text-fg-subtle">
          To take a new snapshot, open the server it belongs to — snapshots are created per
          server so the disk state is unambiguous.
        </p>
      </div>
    </AppShell>
  )
}
