import { ArrowLeft, Cube, Desktop, FloppyDisk } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { AppShell } from '@/components/app-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { api, type AdminUser, type ApiLocation, type ApiNode } from '@/lib/api'
import { useDirtyForm } from '@/components/unsaved-changes-provider'
import { cn } from '@/lib/utils'

export function AdminServerFormPage() {
  const navigate = useNavigate()

  const [users, setUsers] = useState<AdminUser[]>([])
  const [nodes, setNodes] = useState<ApiNode[]>([])
  const [locations, setLocations] = useState<ApiLocation[]>([])
  const [loading, setLoading] = useState(true)

  const [userQuery, setUserQuery] = useState('')
  const [userId, setUserId] = useState('')
  const [nodeId, setNodeId] = useState('')
  const [type, setType] = useState<'lxc' | 'kvm'>('lxc')
  const [cores, setCores] = useState(2)
  const [memoryMb, setMemoryMb] = useState(2048)
  const [diskGb, setDiskGb] = useState(20)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)

  useDirtyForm(isDirty && !saving)

  useEffect(() => {
    let active = true
    async function init() {
      setLoading(true)
      const [usersRes, nodesRes] = await Promise.all([
        api.adminListUsers(),
        api.adminListNodes(),
      ])
      if (!active) return
      if (usersRes.ok) setUsers(usersRes.data || [])
      if (nodesRes.ok) {
        const list = nodesRes.data.nodes || []
        setNodes(list)
        const local = list.find((n) => n.name === 'local-incus') || list[0]
        if (local) setNodeId(local.id)
      }
      if (nodesRes.ok && 'locations' in (nodesRes.data as object)) {
        setLocations((nodesRes.data as { locations?: ApiLocation[] }).locations || [])
      } else {
        const locsRes = await api.adminListLocations()
        if (locsRes.ok) setLocations(locsRes.data.locations || [])
      }
      setLoading(false)
    }
    void init()
    return () => {
      active = false
    }
  }, [])

  const matchingUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase()
    if (!q) return users.slice(0, 8)
    return users
      .filter((u) => u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q))
      .slice(0, 8)
  }, [users, userQuery])

  const selectedUser = useMemo(() => users.find((u) => u.id === userId) || null, [users, userId])
  const selectedNode = useMemo(() => nodes.find((n) => n.id === nodeId) || null, [nodes, nodeId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!userId || !nodeId) return
    setSaving(true)
    setError(null)

    const res = await api.adminCreateInstance({
      userId,
      type,
      nodeId,
      cores: Number(cores),
      memoryMb: Number(memoryMb),
      diskGb: Number(diskGb),
    })

    if (res.ok) {
      navigate('/admin/servers')
    } else {
      setError(res.error.message || 'Failed to provision server.')
    }
    setSaving(false)
  }

  return (
    <AppShell
      title="New Server"
      description="Create a bare server for a user. They install the OS on first access."
    >
      <div className="flex w-full flex-col gap-6">
        <div className="flex items-center gap-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/admin/servers')}
            className="gap-1.5 text-[12px]"
          >
            <ArrowLeft size={14} />
            Back to Servers
          </Button>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-wider text-fg-subtle">
              Servers
            </span>
            <span className="text-fg-subtle/50">/</span>
            <span className="text-[12px] font-medium text-fg">Provision</span>
          </div>
        </div>

        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-fg">Provision Server</h1>
          <p className="mt-0.5 text-[13px] text-fg-subtle">
            Linked to a user account, placed on a node, with hard resource limits.
          </p>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}

        {loading ? (
          <div className="rounded-panel border border-border bg-surface p-12 text-center text-[13px] text-fg-subtle">
            Loading provisioning options...
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            onChange={() => setIsDirty(true)}
            className="flex flex-col gap-6 rounded-panel border border-border bg-surface p-6 shadow-2xs"
          >
            {/* Owner + placement */}
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <label className="text-[12px] font-semibold text-fg">
                  Owner <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  value={selectedUser ? `${selectedUser.name} (${selectedUser.email})` : userQuery}
                  onChange={(e) => {
                    setUserQuery(e.target.value)
                    setUserId('')
                  }}
                  placeholder="Search users by name or email..."
                  className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 text-[13px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
                />
                {!selectedUser && userQuery.trim() && (
                  <div className="mt-1.5 flex flex-col overflow-hidden rounded-control border border-border">
                    {matchingUsers.length === 0 ? (
                      <span className="px-3 py-2 text-[12px] text-fg-subtle">No users match.</span>
                    ) : (
                      matchingUsers.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => {
                            setUserId(u.id)
                            setUserQuery('')
                          }}
                          className="px-3 py-2 text-left text-[12px] text-fg hover:bg-surface-2"
                        >
                          <span className="font-medium">{u.name}</span>{' '}
                          <span className="font-mono text-fg-subtle">{u.email}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
                {selectedUser && (
                  <button
                    type="button"
                    onClick={() => setUserId('')}
                    className="mt-1 text-[11px] text-accent-text hover:underline"
                  >
                    Choose a different user
                  </button>
                )}
              </div>

              <div>
                <label className="text-[12px] font-semibold text-fg">
                  Node <span className="text-danger">*</span>
                </label>
                <select
                  value={nodeId}
                  onChange={(e) => setNodeId(e.target.value)}
                  required
                  className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 text-[13px] text-fg focus:border-accent focus:outline-none"
                >
                  <option value="">Select a node...</option>
                  {nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name} ({n.cpuCores}c / {Math.round((n.memoryLimitMb || 0) / 1024)}GB
                      {n.maintenance ? ' · maintenance' : ''})
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[11px] text-fg-subtle">
                  {selectedNode?.locationShortCode
                    ? `Placed in ${selectedNode.locationShortCode.toUpperCase()}`
                    : locations.length > 0
                      ? 'Node has no location assigned.'
                      : ''}
                  {selectedNode && selectedNode.ipAddress
                    ? ` · daemon ${selectedNode.ipAddress}`
                    : ''}
                </span>
              </div>

              <div>
                <label className="text-[12px] font-semibold text-fg">Server Name</label>
                <p className="mt-1.5 text-[13px] text-fg-muted">Auto-generated. The owner picks the OS on first access.</p>
                <span className="mt-1 block text-[11px] text-fg-subtle">A bare server is created — no OS installed yet.</span>
              </div>
            </div>

            {/* Type */}
            <div className="border-t border-border pt-6">
              <h2 className="text-[15px] font-semibold text-fg">Virtualization</h2>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(
                  [
                    { id: 'lxc', name: 'LXC Container', desc: 'Lightweight OS container, fast boot, shared kernel.' },
                    { id: 'kvm', name: 'KVM Virtual Machine', desc: 'Full virtualization with dedicated kernel.' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setType(opt.id)}
                    className={cn(
                      'flex items-start gap-3 rounded-panel border p-4 text-left transition-colors',
                      type === opt.id
                        ? 'border-accent bg-accent/5'
                        : 'border-border bg-surface-2/20 hover:border-border-strong',
                    )}
                  >
                    <div
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-control',
                        type === opt.id ? 'bg-accent/15 text-accent-text' : 'bg-surface-2 text-fg-subtle',
                      )}
                    >
                      {opt.id === 'lxc' ? <Cube size={18} /> : <Desktop size={18} />}
                    </div>
                    <div>
                      <div className="text-[13px] font-semibold text-fg">{opt.name}</div>
                      <div className="text-[11px] text-fg-subtle">{opt.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Resources */}
            <div className="border-t border-border pt-6">
              <h2 className="text-[15px] font-semibold text-fg">Resource Limits</h2>
              <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-3">
                <div>
                  <label className="text-[12px] font-semibold text-fg">vCPU Cores</label>
                  <input
                    type="number"
                    min={1}
                    max={64}
                    value={cores}
                    onChange={(e) => setCores(Number(e.target.value))}
                    className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[13px] text-fg focus:border-accent focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[12px] font-semibold text-fg">Memory (MB)</label>
                  <input
                    type="number"
                    min={256}
                    step={256}
                    value={memoryMb}
                    onChange={(e) => setMemoryMb(Number(e.target.value))}
                    className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[13px] text-fg focus:border-accent focus:outline-none"
                  />
                  <span className="mt-1 block text-[11px] text-fg-subtle">
                    {(memoryMb / 1024).toFixed(1).replace(/\.0$/, '')} GB
                  </span>
                </div>
                <div>
                  <label className="text-[12px] font-semibold text-fg">Disk (GB)</label>
                  <input
                    type="number"
                    min={5}
                    value={diskGb}
                    onChange={(e) => setDiskGb(Number(e.target.value))}
                    className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[13px] text-fg focus:border-accent focus:outline-none"
                  />
                </div>
              </div>
              <p className="mt-3 text-[11px] text-fg-subtle">
                The owner's SSH keys are injected via cloud-init. Networking is NAT (bridged) —
                no dedicated IPv4 is assigned.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate('/admin/servers')}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={saving || !userId} className="gap-1.5">
                <FloppyDisk size={16} />
                {saving ? 'Provisioning...' : 'Provision Server'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </AppShell>
  )
}
