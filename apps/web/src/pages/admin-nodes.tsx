import {
  ArrowClockwise,
  Cpu,
  Database,
  DotsThreeVertical,
  HardDrives,
  MagnifyingGlass,
  MapPin,
  PencilSimple,
  Plus,
  Trash,
  X,
} from '@phosphor-icons/react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { AppShell } from '@/components/app-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { api, type ApiNode } from '@/lib/api'
import { cn } from '@/lib/utils'

export function AdminNodesPage() {
  const navigate = useNavigate()
  const [nodes, setNodes] = useState<ApiNode[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Dialog states
  const [deleteNode, setDeleteNode] = useState<ApiNode | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function loadData() {
    setLoading(true)
    setError(null)
    const nodesRes = await api.adminListNodes()

    if (nodesRes.ok) {
      setNodes(nodesRes.data.nodes || [])
    } else {
      setError(nodesRes.error.message || 'Failed to load nodes.')
    }

    setLoading(false)
  }

  useEffect(() => {
    void loadData()
  }, [])

  function openCreateNode() {
    navigate('/admin/nodes/new')
  }

  function openEditNode(node: ApiNode) {
    navigate(`/admin/nodes/${node.id}/edit`)
  }

  async function handleDeleteNode() {
    if (!deleteNode) return
    setSubmitting(true)
    const res = await api.adminDeleteNode(deleteNode.id)
    if (res.ok) {
      setSuccessMsg(`Node "${deleteNode.name}" removed successfully.`)
      setDeleteNode(null)
      await loadData()
    } else {
      setError(res.error.message || 'Failed to delete node.')
    }
    setSubmitting(false)
    setTimeout(() => setSuccessMsg(null), 3500)
  }

  const filteredNodes = useMemo(() => {
    if (!search.trim()) return nodes
    const q = search.toLowerCase()
    return nodes.filter(
      (n) =>
        n.name.toLowerCase().includes(q) ||
        n.fqdn.toLowerCase().includes(q) ||
        (n.ipAddress && n.ipAddress.toLowerCase().includes(q)) ||
        (n.locationName && n.locationName.toLowerCase().includes(q)) ||
        (n.locationShortCode && n.locationShortCode.toLowerCase().includes(q)),
    )
  }, [nodes, search])

  // Overview stats
  const totalCores = useMemo(
    () => nodes.reduce((sum, n) => sum + (n.cpuCores || 0), 0),
    [nodes],
  )
  const totalMemoryGb = useMemo(
    () =>
      Math.round(
        nodes.reduce((sum, n) => sum + (n.memoryLimitMb || n.memoryMb || 0), 0) / 1024,
      ),
    [nodes],
  )
  const totalDiskGb = useMemo(
    () => nodes.reduce((sum, n) => sum + (n.diskLimitGb || n.diskGb || 0), 0),
    [nodes],
  )
  const activeNodesCount = useMemo(
    () => nodes.filter((n) => !n.maintenance).length,
    [nodes],
  )

  return (
    <AppShell
      title="Nodes"
      description="Manage Incus host hypervisors, hardware resource quotas, and regional placement."
    >
      <div className="flex w-full flex-col gap-6">
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-fg-subtle">
                Infrastructure
              </span>
              <span className="text-fg-subtle/50">/</span>
              <span className="text-[12px] font-medium text-fg">Compute Daemons</span>
            </div>
            <h1 className="mt-1 text-[28px] font-bold tracking-tight text-fg">Nodes</h1>
            <p className="text-[13px] text-fg-subtle">
              Manage physical and virtual Incus hypervisors hosting container instances.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={loadData}
              disabled={loading}
              className="gap-1.5 text-[12px]"
            >
              <ArrowClockwise size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={openCreateNode}
              className="gap-1.5 text-[12px]"
            >
              <Plus size={14} weight="bold" />
              Add Node
            </Button>
          </div>
        </div>

        {/* Global Overview Metrics */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="flex items-center gap-3.5 rounded-panel border border-border bg-surface p-4 shadow-2xs">
            <div className="flex size-10 items-center justify-center rounded-control bg-sun-500/10 text-sun-500">
              <HardDrives size={20} weight="bold" />
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-fg-subtle">Total Registered Nodes</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[20px] font-bold tracking-tight text-fg">{nodes.length}</span>
                <span className="text-[11px] text-fg-subtle">({activeNodesCount} online)</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-panel border border-border bg-surface p-4 shadow-2xs">
            <div className="flex size-10 items-center justify-center rounded-control bg-emerald-500/10 text-emerald-500">
              <Cpu size={20} weight="bold" />
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-fg-subtle">Aggregate Cores</span>
              <span className="text-[20px] font-bold tracking-tight text-fg">
                {totalCores} <span className="text-[13px] font-normal text-fg-subtle">vCPU</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-panel border border-border bg-surface p-4 shadow-2xs">
            <div className="flex size-10 items-center justify-center rounded-control bg-purple-500/10 text-purple-500">
              <Database size={20} weight="bold" />
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-fg-subtle">Memory Pool</span>
              <span className="text-[20px] font-bold tracking-tight text-fg">
                {totalMemoryGb} <span className="text-[13px] font-normal text-fg-subtle">GB RAM</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-panel border border-border bg-surface p-4 shadow-2xs">
            <div className="flex size-10 items-center justify-center rounded-control bg-blue-500/10 text-blue-500">
              <HardDrives size={20} weight="bold" />
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-fg-subtle">Storage Pool</span>
              <span className="text-[20px] font-bold tracking-tight text-fg">
                {totalDiskGb} <span className="text-[13px] font-normal text-fg-subtle">GB Storage</span>
              </span>
            </div>
          </div>
        </div>

        {/* Feedback alerts */}
        {error && <Alert tone="danger">{error}</Alert>}
        {successMsg && <Alert tone="success">{successMsg}</Alert>}

        {/* Search bar */}
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
              placeholder="Search by node name, host FQDN, IP, or location..."
              className="h-9 w-full rounded-control border border-border bg-surface-2/50 pl-9 pr-8 text-[12px] text-fg placeholder:text-fg-subtle focus:border-sun-500 focus:outline-none"
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
            Showing <strong className="font-semibold text-fg">{filteredNodes.length}</strong> of{' '}
            <strong className="font-semibold text-fg">{nodes.length}</strong> nodes
          </div>
        </div>

        {/* Nodes Grid */}
        {loading && nodes.length === 0 ? (
          <div className="flex min-h-[220px] items-center justify-center rounded-panel border border-border bg-surface">
            <span className="flex items-center gap-2 text-[13px] text-fg-subtle">
              <ArrowClockwise size={16} className="animate-spin" />
              Loading compute nodes...
            </span>
          </div>
        ) : filteredNodes.length === 0 ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center rounded-panel border border-dashed border-border bg-surface p-8 text-center">
            <HardDrives size={36} className="text-fg-subtle/50 mb-2" />
            <h3 className="text-[15px] font-semibold text-fg">No nodes found</h3>
            <p className="mt-1 text-[12px] text-fg-subtle max-w-sm">
              {search
                ? 'No compute nodes matched your query.'
                : 'Get started by connecting or adding an Incus host node.'}
            </p>
            {!search && (
              <Button
                variant="primary"
                size="sm"
                onClick={openCreateNode}
                className="mt-4 gap-1.5 text-[12px]"
              >
                <Plus size={14} weight="bold" />
                Add Node
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filteredNodes.map((node) => {
              const memMb = node.memoryLimitMb || node.memoryMb || 16384
              const diskGb = node.diskLimitGb || node.diskGb || 250
              const isLocalSocket = node.name === 'local-incus' || node.fqdn === 'localhost'

              return (
                <div
                  key={node.id}
                  className="flex flex-col justify-between rounded-panel border border-border bg-surface p-5 transition-all hover:border-border-strong hover:shadow-xs"
                >
                  <div>
                    {/* Top Row: Name + Local Badge / Status + Actions */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            'size-3 rounded-full ring-2',
                            node.maintenance
                              ? 'bg-amber-400 ring-amber-400/20'
                              : 'bg-emerald-400 ring-emerald-400/20',
                          )}
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[14px] font-bold text-fg">
                              {node.name}
                            </span>
                            {isLocalSocket && (
                              <span className="rounded bg-sun-500/15 border border-sun-500/30 px-1.5 py-0.2 font-mono text-[9px] font-bold uppercase tracking-wider text-sun-500">
                                Socket
                              </span>
                            )}
                          </div>
                          <span className="font-mono text-[11px] text-fg-subtle truncate max-w-[180px] block">
                            {node.fqdn}:{node.port || 8443}
                          </span>
                        </div>
                      </div>

                      {/* Dropdown Menu */}
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                          <button
                            type="button"
                            className="flex size-7 items-center justify-center rounded-control text-fg-subtle hover:bg-surface-2 hover:text-fg"
                          >
                            <DotsThreeVertical size={16} weight="bold" />
                          </button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content
                            align="end"
                            className="z-50 min-w-[140px] rounded-control border border-border bg-surface p-1 shadow-md animate-scale-in"
                          >
                            <DropdownMenu.Item
                              onClick={() => openEditNode(node)}
                              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[12px] text-fg hover:bg-surface-2 focus:outline-none"
                            >
                              <PencilSimple size={14} />
                              Edit Node
                            </DropdownMenu.Item>
                            <DropdownMenu.Separator className="my-1 h-px bg-border" />
                            <DropdownMenu.Item
                              onClick={() => setDeleteNode(node)}
                              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[12px] text-danger hover:bg-danger-surface focus:outline-none"
                            >
                              <Trash size={14} />
                              Delete Node
                            </DropdownMenu.Item>
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Root>
                    </div>

                    {/* Location Badge */}
                    <div className="mt-4 flex items-center gap-2">
                      <span className="text-[11px] text-fg-subtle">Location:</span>
                      {node.locationShortCode ? (
                        <span className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface-2/60 px-2 py-0.5 text-[11px] font-medium text-fg">
                          <MapPin size={12} className="text-sun-500" />
                          <strong className="font-mono uppercase">{node.locationShortCode}</strong>
                          {node.locationName ? (
                            <span className="text-fg-subtle">· {node.locationName}</span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="rounded-control border border-dashed border-border bg-surface-2/30 px-2 py-0.5 text-[11px] text-fg-subtle/80">
                          Unassigned (No location)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Resource Allocation Footer */}
                  <div className="mt-5 border-t border-border/80 pt-4">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="flex flex-col rounded-control bg-surface-2/40 border border-border/60 p-2">
                        <span className="text-[10px] uppercase font-mono tracking-wider text-fg-subtle">
                          CPU
                        </span>
                        <span className="font-mono font-bold text-[13px] text-fg mt-0.5">
                          {node.cpuCores || 8}c
                        </span>
                      </div>

                      <div className="flex flex-col rounded-control bg-surface-2/40 border border-border/60 p-2">
                        <span className="text-[10px] uppercase font-mono tracking-wider text-fg-subtle">
                          Memory
                        </span>
                        <span className="font-mono font-bold text-[13px] text-fg mt-0.5">
                          {(memMb / 1024).toFixed(1).replace(/\.0$/, '')}GB
                        </span>
                      </div>

                      <div className="flex flex-col rounded-control bg-surface-2/40 border border-border/60 p-2">
                        <span className="text-[10px] uppercase font-mono tracking-wider text-fg-subtle">
                          Disk
                        </span>
                        <span className="font-mono font-bold text-[13px] text-fg mt-0.5">
                          {diskGb}GB
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-[11px] text-fg-subtle font-mono">
                      <span>IP: {node.ipAddress || '—'}</span>
                      <span
                        className={cn(
                          'font-semibold uppercase tracking-wider text-[10px]',
                          node.maintenance ? 'text-amber-400' : 'text-emerald-400',
                        )}
                      >
                        {node.maintenance ? 'Maintenance' : 'Ready'}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Delete Node Confirmation Dialog */}
        <Dialog open={!!deleteNode} onOpenChange={(open) => !open && setDeleteNode(null)}>
          <DialogContent className="max-w-md">
            <DialogTitle>Delete Node</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete node{' '}
              <strong className="text-fg">{deleteNode?.name}</strong> (
              <span className="font-mono text-fg">{deleteNode?.fqdn}</span>)? This action cannot be
              undone.
            </DialogDescription>

            <div className="mt-5 flex justify-end gap-2.5">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setDeleteNode(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={submitting}
                onClick={handleDeleteNode}
              >
                {submitting ? 'Deleting...' : 'Delete Node'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  )
}
