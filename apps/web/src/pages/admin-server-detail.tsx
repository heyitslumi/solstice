import {
  ArrowClockwise,
  ArrowLeft,
  ArrowRight,
  Camera,
  Cpu,
  Database,
  Eye,
  FloppyDisk,
  Gauge,
  HardDrive,
  Play,
  Plus,
  Prohibit,
  Square,
  Trash,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { AppShell } from '@/components/app-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { api, type AdminInstanceDetail } from '@/lib/api'
import { cn } from '@/lib/utils'

export function AdminServerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [server, setServer] = useState<AdminInstanceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [acting, setActing] = useState(false)

  // Resource editing
  const [editCores, setEditCores] = useState(1)
  const [editMemoryMb, setEditMemoryMb] = useState(1024)
  const [savingLimits, setSavingLimits] = useState(false)

  // Snapshots
  const [snapName, setSnapName] = useState('')
  const [snapWorking, setSnapWorking] = useState<string | null>(null)

  // Delete dialog
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)

  const loadServer = useCallback(async () => {
    if (!id) return
    const res = await api.adminGetInstance(id)
    if (res.ok) {
      setServer(res.data.instance)
      setEditCores(res.data.instance.cores)
      setEditMemoryMb(res.data.instance.memoryMb)
      setError(null)
    } else {
      setError(res.error.message || 'Server not found.')
    }
    setLoading(false)
  }, [id])

  useEffect(() => {
    void loadServer()
  }, [loadServer])

  function flashSuccess(msg: string) {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 3500)
  }

  async function handlePower(
    action: 'start' | 'stop' | 'restart' | 'freeze' | 'unfreeze',
    reason?: string,
  ) {
    if (!id) return
    setActing(true)
    setError(null)
    const res = await api.adminInstanceAction(id, action, reason)
    if (res.ok) {
      flashSuccess(`${action} sent.`)
      await loadServer()
    } else {
      setError(res.error.message || `Failed to ${action}.`)
    }
    setActing(false)
  }

  const [isSuspendOpen, setIsSuspendOpen] = useState(false)
  const [suspendReason, setSuspendReason] = useState('')

  async function handleSuspend(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !suspendReason.trim()) return
    setIsSuspendOpen(false)
    await handlePower('freeze', suspendReason.trim())
    setSuspendReason('')
  }

  async function handleSaveLimits(e: React.FormEvent) {
    e.preventDefault()
    if (!id) return
    setSavingLimits(true)
    setError(null)
    const res = await api.adminUpdateInstance(id, {
      cores: Number(editCores),
      memoryMb: Number(editMemoryMb),
    })
    if (res.ok) {
      flashSuccess('Resource limits updated (a restart may be required for KVM).')
      await loadServer()
    } else {
      setError(res.error.message || 'Failed to update limits.')
    }
    setSavingLimits(false)
  }

  async function handleCreateSnapshot(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !snapName.trim()) return
    setSnapWorking('__new__')
    setError(null)
    const res = await api.adminCreateSnapshot(id, snapName.trim())
    if (res.ok) {
      flashSuccess(`Snapshot "${snapName.trim()}" created.`)
      setSnapName('')
      await loadServer()
    } else {
      setError(res.error.message || 'Failed to create snapshot.')
    }
    setSnapWorking(null)
  }

  async function handleRestoreSnapshot(snap: string) {
    if (!id) return
    setSnapWorking(snap)
    setError(null)
    const res = await api.adminRestoreSnapshot(id, snap)
    if (res.ok) {
      flashSuccess(`Restored snapshot "${snap}".`)
      await loadServer()
    } else {
      setError(res.error.message || 'Failed to restore snapshot.')
    }
    setSnapWorking(null)
  }

  async function handleDeleteSnapshot(snap: string) {
    if (!id) return
    setSnapWorking(snap)
    setError(null)
    const res = await api.adminDeleteSnapshot(id, snap)
    if (res.ok) {
      flashSuccess(`Snapshot "${snap}" deleted.`)
      await loadServer()
    } else {
      setError(res.error.message || 'Failed to delete snapshot.')
    }
    setSnapWorking(null)
  }

  async function handleDeleteServer() {
    if (!id) return
    setActing(true)
    const res = await api.adminDeleteInstance(id)
    if (res.ok) {
      navigate('/admin/servers')
    } else {
      setError(res.error.message || 'Failed to delete server.')
    }
    setActing(false)
  }

  if (loading) {
    return (
      <AppShell title="Loading Server..." description="Fetching live Incus state...">
        <div className="flex h-64 items-center justify-center">
          <ArrowClockwise size={24} className="animate-spin text-fg-subtle" />
        </div>
      </AppShell>
    )
  }

  if (error && !server) {
    return (
      <AppShell title="Server Not Found" description="The requested server could not be found.">
        <div className="flex flex-col items-start gap-4">
          <Alert tone="danger">{error}</Alert>
          <Button variant="secondary" onClick={() => navigate('/admin/servers')}>
            <ArrowLeft size={16} />
            Back to Servers
          </Button>
        </div>
      </AppShell>
    )
  }

  if (!server) return null
  const isRunning = server.status === 'running'
  const isFrozen = (server.status as string) === 'frozen'

  return (
    <AppShell
      title={server.name}
      description={`${server.os} · ${server.owner.name} (${server.owner.email})`}
    >
      <div className="flex w-full flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate('/admin/servers')}
              className="gap-1.5 text-[12px]"
            >
              <ArrowLeft size={14} />
              Servers
            </Button>
            <h1 className="flex items-center gap-2.5 font-mono text-[24px] font-bold tracking-tight text-fg">
              {server.name}
              <span
                className={cn(
                  'rounded-control border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider',
                  server.type === 'kvm'
                    ? 'border-sky-500/30 bg-sky-500/10 text-sky-400'
                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
                )}
              >
                {server.type}
              </span>
              <span
                className={cn(
                  'rounded-control border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider',
                  isRunning
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                    : isFrozen
                      ? 'border-sky-500/30 bg-sky-500/10 text-sky-400'
                      : 'border-border bg-surface-2/60 text-fg-subtle',
                )}
              >
                {isFrozen ? 'suspended' : server.status}
              </span>
            </h1>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" size="sm" asChild className="gap-1.5 text-[12px]">
              <Link to={`/servers/${server.id}`}>
                <Eye size={14} />
                View in Client Area
              </Link>
            </Button>
            <Button variant="secondary" size="sm" onClick={loadServer} className="gap-1.5 text-[12px]">
              <ArrowClockwise size={14} />
              Refresh
            </Button>
            {isRunning ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={acting}
                  onClick={() => void handlePower('restart')}
                  className="gap-1.5 text-[12px]"
                >
                  Restart
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={acting}
                  onClick={() => void handlePower('stop')}
                  className="gap-1.5 text-[12px] text-danger"
                >
                  <Square size={13} weight="fill" />
                  Stop
                </Button>
              </>
            ) : isFrozen ? (
              <Button
                variant="primary"
                size="sm"
                disabled={acting}
                onClick={() => void handlePower('unfreeze')}
                className="gap-1.5 text-[12px]"
              >
                <Play size={13} weight="fill" />
                Unsuspend
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                disabled={acting}
                onClick={() => void handlePower('start')}
                className="gap-1.5 text-[12px]"
              >
                <Play size={13} weight="fill" />
                Start
              </Button>
            )}
            {!isFrozen && (
              <Button
                variant="secondary"
                size="sm"
                disabled={acting}
                onClick={() => {
                  setSuspendReason('')
                  setIsSuspendOpen(true)
                }}
                className="gap-1.5 text-[12px]"
              >
                <Prohibit size={14} />
                Suspend
              </Button>
            )}
            <Button
              variant="danger"
              size="sm"
              onClick={() => setIsDeleteOpen(true)}
              className="gap-1.5 text-[12px]"
            >
              <Trash size={14} />
              Delete
            </Button>
          </div>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}
        {successMsg && <Alert tone="success">{successMsg}</Alert>}

        {server.suspendReason && (
          <div className="flex flex-col items-center gap-2 rounded-panel border border-amber-500/30 bg-surface px-6 py-6 text-center shadow-2xs">
            <span className="flex size-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
              <Prohibit size={24} weight="bold" aria-hidden />
            </span>
            <h2 className="text-[17px] font-bold text-fg">VPS Suspended</h2>
            <p className="w-full max-w-md rounded-control border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-left text-[13px] text-amber-600 dark:text-amber-400">
              <strong className="font-semibold">Reason:</strong> {server.suspendReason}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            {
              icon: <Cpu size={15} aria-hidden />,
              label: 'CPU',
              value: server.cpuUsage,
              bar: 'bg-accent',
            },
            {
              icon: <Database size={15} aria-hidden />,
              label: 'RAM',
              value: server.ramUsage,
              bar: 'bg-sky-500',
            },
            {
              icon: <HardDrive size={15} aria-hidden />,
              label: 'Disk',
              value: server.diskUsage,
              bar: 'bg-emerald-400',
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-panel border border-border bg-surface p-4 shadow-2xs"
            >
              <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
                {stat.icon}
                {stat.label}
              </div>
              <div className="mt-1.5 font-mono text-[20px] font-bold leading-none tracking-tight text-fg">
                {stat.value === null || stat.value === undefined ? (
                  '—'
                ) : (
                  <>
                    {Math.round(stat.value)}
                    <span className="text-[13px] font-semibold text-fg-subtle">%</span>
                  </>
                )}
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2">
                <div
                  className={cn('h-full rounded-full transition-all duration-300', stat.bar)}
                  style={{ width: `${stat.value ?? 0}%` }}
                />
              </div>
            </div>
          ))}
          <div className="rounded-panel border border-border bg-surface p-4 shadow-2xs">
            <div className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
              Uptime
            </div>
            <div className="mt-1.5 truncate text-[15px] font-semibold text-fg">
              {server.uptime}
            </div>
            <div className="mt-2 truncate font-mono text-[11px] text-fg-subtle">
              {server.bandwidth} transferred
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Placement + specs */}
          <div className="flex flex-col gap-6">
            <div className="rounded-panel border border-border bg-surface p-5 shadow-2xs">
              <h2 className="text-[15px] font-semibold text-fg">Placement &amp; Specs</h2>
              <dl className="mt-3 flex flex-col divide-y divide-border/70 text-[13px]">
                <div className="flex justify-between py-2">
                  <dt className="text-fg-subtle">Owner</dt>
                  <dd className="font-medium text-fg">
                    <Link
                      to={`/admin/users/${server.owner.id}`}
                      className="hover:text-accent-text hover:underline"
                    >
                      {server.owner.name}{' '}
                      <span className="font-mono text-[11px] text-fg-subtle">
                        {server.owner.email}
                      </span>
                    </Link>
                  </dd>
                </div>
                <div className="flex justify-between py-2">
                  <dt className="text-fg-subtle">Node</dt>
                  <dd className="font-mono text-[12px] text-fg">
                    {server.node ? `${server.node.name}` : 'Unassigned'}
                    {server.locationShortCode ? ` · ${server.locationShortCode.toUpperCase()}` : ''}
                  </dd>
                </div>
                <div className="flex justify-between py-2">
                  <dt className="text-fg-subtle">Image</dt>
                  <dd className="font-mono text-[12px] text-fg">{server.imageAlias}</dd>
                </div>
                <div className="flex justify-between py-2">
                  <dt className="text-fg-subtle">Disk</dt>
                  <dd className="font-mono text-[12px] text-fg">{server.diskGb} GB</dd>
                </div>
                <div className="flex justify-between py-2">
                  <dt className="text-fg-subtle">Network</dt>
                  <dd className="font-mono text-[12px] text-fg">
                    {server.networkMode} · {server.ip4 !== '—' ? server.ip4 : 'no address yet'}
                    {server.ip6 !== '—' ? ` / ${server.ip6}` : ''}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Resource limits */}
            <form
              onSubmit={handleSaveLimits}
              className="rounded-panel border border-border bg-surface p-5 shadow-2xs"
            >
              <h2 className="flex items-center gap-2 text-[15px] font-semibold text-fg">
                <Cpu size={16} />
                Resource Limits
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[12px] font-semibold text-fg">vCPU Cores</label>
                  <input
                    type="number"
                    min={1}
                    max={64}
                    value={editCores}
                    onChange={(e) => setEditCores(Number(e.target.value))}
                    className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[13px] text-fg focus:border-accent focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[12px] font-semibold text-fg">Memory (MB)</label>
                  <input
                    type="number"
                    min={256}
                    step={256}
                    value={editMemoryMb}
                    onChange={(e) => setEditMemoryMb(Number(e.target.value))}
                    className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[13px] text-fg focus:border-accent focus:outline-none"
                  />
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <Button type="submit" variant="primary" size="sm" disabled={savingLimits} className="gap-1.5 text-[12px]">
                  <FloppyDisk size={14} />
                  {savingLimits ? 'Applying...' : 'Apply Limits'}
                </Button>
              </div>
            </form>

            {/* Network interfaces */}
            <div className="rounded-panel border border-border bg-surface p-5 shadow-2xs">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold text-fg">
                <Gauge size={16} />
                Network Interfaces
              </h2>
              {server.networkInterfaces.length === 0 ? (
                <p className="mt-2 text-[12px] text-fg-subtle">
                  No addresses reported — start the server to pick up NAT leases.
                </p>
              ) : (
                <div className="mt-2 divide-y divide-border/70">
                  {server.networkInterfaces.map((iface) => (
                    <div key={iface.interface} className="flex items-center justify-between py-2 text-[12px]">
                      <span className="font-mono font-semibold text-fg">
                        {iface.interface}{' '}
                        <span className="font-normal text-fg-subtle">({iface.state})</span>
                      </span>
                      <span className="font-mono text-fg">
                        {iface.ip4 !== '—' ? iface.ip4 : iface.ip6}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Snapshots */}
          <div className="flex flex-col gap-6">
            <div className="rounded-panel border border-border bg-surface p-5 shadow-2xs">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold text-fg">
                <Camera size={16} />
                Snapshots
                <span className="font-mono text-[11px] font-normal text-fg-subtle">
                  ({server.snapshots.length})
                </span>
              </h2>

              <form onSubmit={handleCreateSnapshot} className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={snapName}
                  onChange={(e) => setSnapName(e.target.value)}
                  placeholder="e.g. before-upgrade"
                  className="h-9 flex-1 rounded-control border border-field-border bg-field px-3 font-mono text-[12px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
                />
                <Button
                  type="submit"
                  variant="secondary"
                  size="sm"
                  disabled={snapWorking === '__new__' || !snapName.trim()}
                  className="gap-1.5 text-[12px]"
                >
                  <Plus size={14} />
                  {snapWorking === '__new__' ? 'Saving...' : 'Snapshot'}
                </Button>
              </form>

              <div className="mt-3 flex flex-col divide-y divide-border/70 rounded-control border border-border">
                {server.snapshots.length === 0 ? (
                  <p className="p-4 text-center text-[12px] text-fg-subtle">No snapshots yet.</p>
                ) : (
                  server.snapshots.map((snap) => (
                    <div key={snap.name} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <div>
                        <div className="font-mono text-[12px] font-semibold text-fg">{snap.name}</div>
                        <div className="text-[11px] text-fg-subtle">
                          {new Date(snap.createdAt).toLocaleString()}
                          {snap.stateful ? ' · stateful' : ''}
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={snapWorking === snap.name}
                          onClick={() => void handleRestoreSnapshot(snap.name)}
                          className="h-7 px-2 text-[11px]"
                        >
                          {snapWorking === snap.name ? 'Working...' : 'Restore'}
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={snapWorking === snap.name}
                          onClick={() => void handleDeleteSnapshot(snap.name)}
                          className="h-7 px-2 text-[11px]"
                        >
                          <Trash size={13} />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Port forwards */}
            <div className="rounded-panel border border-border bg-surface p-5 shadow-2xs">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold text-fg">
                <Gauge size={16} />
                Port Forwards
                <span className="font-mono text-[11px] font-normal text-fg-subtle">
                  ({server.portForwards.length})
                </span>
              </h2>
              {server.portForwards.length === 0 ? (
                <p className="mt-2 text-[12px] text-fg-subtle">
                  No forwards — the owner can add them from the Network page.
                </p>
              ) : (
                <div className="mt-3 flex flex-col divide-y divide-border/70 rounded-control border border-border">
                  {server.portForwards.map((fwd) => (
                    <div
                      key={`${fwd.hostPort}-${fwd.containerPort}-${fwd.protocol}`}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
                    >
                      <div className="flex min-w-0 flex-col">
                        <span className="font-mono text-[12px] font-semibold text-fg">
                          :{fwd.hostPort} → :{fwd.containerPort}
                          <span className="ml-2 rounded-control border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase text-fg-subtle">
                            {fwd.protocol}
                          </span>
                          {fwd.kind === 'ssh' && (
                            <span className="ml-1.5 rounded-control border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] text-fg-subtle">
                              SSH
                            </span>
                          )}
                        </span>
                        {fwd.description && (
                          <span className="truncate text-[11px] text-fg-subtle">
                            {fwd.description}
                          </span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate('/admin/port-forwards')}
                        className="h-7 px-2 text-[11px]"
                        title="Manage all forwards"
                      >
                        <ArrowRight size={14} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <Dialog open={isSuspendOpen} onOpenChange={setIsSuspendOpen}>
          <DialogContent className="max-w-md">
            <DialogTitle>Suspend VPS</DialogTitle>
            <DialogDescription>
              Freeze <strong className="text-fg">{server.name}</strong> in place and record why.
              The owner will see this reason.
            </DialogDescription>

            <form
              onSubmit={handleSuspend}
              className="mt-4 flex flex-col gap-4"
            >
              <div>
                <label className="text-[12px] font-semibold text-fg">
                  Reason <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  placeholder="e.g. Abuse complaint #1234"
                  maxLength={200}
                  className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 text-[13px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2.5">
                <Button type="button" variant="secondary" onClick={() => setIsSuspendOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="danger" disabled={acting || !suspendReason.trim()}>
                  {acting ? 'Suspending...' : 'Suspend VPS'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <DialogContent className="max-w-md">
            <DialogTitle>Delete Server</DialogTitle>
            <DialogDescription>
              Stop and permanently delete <strong className="text-fg">{server.name}</strong>? All
              data, including snapshots, will be destroyed.
            </DialogDescription>

            <div className="mt-5 flex justify-end gap-2.5">
              <Button variant="secondary" onClick={() => setIsDeleteOpen(false)}>
                Cancel
              </Button>
              <Button variant="danger" disabled={acting} onClick={handleDeleteServer}>
                {acting ? 'Deleting...' : 'Delete Server'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  )
}
