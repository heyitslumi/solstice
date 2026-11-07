import {
  ArrowLeft,
  FloppyDisk,
  Globe,
  HardDrives,
  PencilSimple,
  Plus,
  ShareNetwork,
  Trash,
} from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { AppShell } from '@/components/app-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { api, type ApiLocation } from '@/lib/api'
import { cn } from '@/lib/utils'

export function AdminNodeFormPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)

  const [locations, setLocations] = useState<ApiLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form fields
  const [name, setName] = useState('')
  const [fqdn, setFqdn] = useState('')
  const [ipAddress, setIpAddress] = useState('')
  const [publicIp, setPublicIp] = useState('')
  const [port, setPort] = useState(8443)
  const [locationId, setLocationId] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [maintenance, setMaintenance] = useState(false)
  const [cpuCores, setCpuCores] = useState(4)
  const [memoryLimitMb, setMemoryLimitMb] = useState(5894)
  const [diskLimitGb, setDiskLimitGb] = useState(88)

  const isDefaultLocalNode = isEdit && (name === 'local-incus' || fqdn === 'localhost')

  type NodeTab = 'general' | 'network'
  const [activeTab, setActiveTab] = useState<NodeTab>('general')
  const [nodeNetwork, setNodeNetwork] = useState<{
    primaryNetwork: string
    stats?: {
      servers: { total: number; active: number; suspended: number; awaitingSetup: number }
      ports: { total: number; available: number; inUse: number; reserved: number }
    }
    portForwardRange: { start: number; end: number }
    networks: Array<{
      name: string
      type: string
      managed: boolean
      status: string
      description?: string
      config?: Record<string, string>
      used_by?: string[]
    }>
  } | null>(null)
  const [loadingNetwork, setLoadingNetwork] = useState(false)
  const [primaryNetwork, setPrimaryNetwork] = useState('incusbr0')
  const [savingPrimary, setSavingPrimary] = useState(false)

  // System toggles quick save
  const [updatingSystem, setUpdatingSystem] = useState(false)

  // Add network modal state
  const [addNetOpen, setAddNetOpen] = useState(false)
  const [newNetName, setNewNetName] = useState('')
  const [newNetMtu, setNewNetMtu] = useState(1372)
  const [newNetNat, setNewNetNat] = useState(true)
  const [newNetIpv4, setNewNetIpv4] = useState('auto')
  const [addingNet, setAddingNet] = useState(false)
  const [netError, setNetError] = useState<string | null>(null)

  // Edit network modal state
  const [editNetOpen, setEditNetOpen] = useState(false)
  const [editingNetName, setEditingNetName] = useState('')
  const [editNetMtu, setEditNetMtu] = useState(1372)
  const [editNetNat, setEditNetNat] = useState(true)
  const [editNetIpv4, setEditNetIpv4] = useState('')
  const [updatingNet, setUpdatingNet] = useState(false)

  // Delete network confirm state
  const [deleteNetName, setDeleteNetName] = useState<string | null>(null)
  const [deletingNet, setDeletingNet] = useState(false)

  function loadNetworkData() {
    if (!id) return
    setLoadingNetwork(true)
    void api.adminGetNodeNetwork(id).then((res) => {
      if (res.ok) {
        setNodeNetwork({
          primaryNetwork: res.data.node.primaryNetwork,
          stats: res.data.stats,
          portForwardRange: res.data.portForwardRange,
          networks: res.data.networks,
        })
        setPrimaryNetwork(res.data.node.primaryNetwork || 'incusbr0')
      }
      setLoadingNetwork(false)
    })
  }

  useEffect(() => {
    if (id && !nodeNetwork) {
      loadNetworkData()
    }
  }, [id, nodeNetwork])

  async function handleToggleSystem(key: 'maintenance' | 'isPublic', nextVal: boolean) {
    if (!id) return
    setUpdatingSystem(true)
    if (key === 'maintenance') setMaintenance(nextVal)
    if (key === 'isPublic') setIsPublic(nextVal)
    const res = await api.adminUpdateNode(id, { [key]: nextVal } as any)
    if (!res.ok) {
      setNetError(res.error.message || 'Failed to update system state.')
    }
    setUpdatingSystem(false)
  }

  async function handleUpdatePrimaryNetwork(e: React.FormEvent) {
    e.preventDefault()
    if (!id) return
    setSavingPrimary(true)
    setNetError(null)
    const res = await api.adminUpdateNode(id, { primaryNetwork } as any)
    if (res.ok) {
      loadNetworkData()
    } else {
      setNetError(res.error.message || 'Failed to update primary network.')
    }
    setSavingPrimary(false)
  }

  async function handleCreateNetwork(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !newNetName.trim()) return
    setAddingNet(true)
    setNetError(null)
    const res = await api.adminCreateNodeNetwork(id, {
      name: newNetName.trim().toLowerCase(),
      mtu: Number(newNetMtu) || 1372,
      nat: newNetNat,
      ipv4: newNetIpv4.trim() || 'auto',
    })
    if (res.ok) {
      setAddNetOpen(false)
      setNewNetName('')
      setNewNetMtu(1372)
      setNewNetIpv4('auto')
      loadNetworkData()
    } else {
      setNetError(res.error.message || 'Failed to create network bridge.')
    }
    setAddingNet(false)
  }

  function openEditModal(net: { name: string; config?: Record<string, string> }) {
    setEditingNetName(net.name)
    setEditNetMtu(Number(net.config?.['bridge.mtu']) || 1372)
    setEditNetNat(net.config?.['ipv4.nat'] !== 'false')
    setEditNetIpv4(net.config?.['ipv4.address'] || '')
    setEditNetOpen(true)
  }

  async function handleUpdateNetwork(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !editingNetName) return
    setUpdatingNet(true)
    setNetError(null)
    const res = await api.adminUpdateNodeNetwork(id, editingNetName, {
      mtu: Number(editNetMtu) || 1372,
      nat: editNetNat,
      ipv4: editNetIpv4.trim() || 'auto',
    })
    if (res.ok) {
      setEditNetOpen(false)
      loadNetworkData()
    } else {
      setNetError(res.error.message || 'Failed to update network.')
    }
    setUpdatingNet(false)
  }

  async function handleDeleteNetwork() {
    if (!id || !deleteNetName) return
    setDeletingNet(true)
    setNetError(null)
    const res = await api.adminDeleteNodeNetwork(id, deleteNetName)
    if (res.ok) {
      setDeleteNetName(null)
      loadNetworkData()
    } else {
      setNetError(res.error.message || 'Failed to delete network.')
    }
    setDeletingNet(false)
  }

  useEffect(() => {
    let active = true

    async function initData() {
      setLoading(true)
      const [nodesRes, locsRes] = await Promise.all([
        api.adminListNodes(),
        api.adminListLocations(),
      ])

      if (!active) return

      if (locsRes.ok) {
        setLocations(locsRes.data.locations || [])
      }

      if (nodesRes.ok) {
        if (isEdit && id) {
          const found = nodesRes.data.nodes?.find((n) => n.id === id)
          if (found) {
            setName(found.name)
            setFqdn(found.fqdn)
            setIpAddress(found.ipAddress || '')
            setPublicIp(found.publicIp || '')
            setPort(found.port || 8443)
            setLocationId(found.locationId || '')
            setIsPublic(found.isPublic !== false)
            setMaintenance(found.maintenance === true)
            setCpuCores(found.cpuCores || 4)
            setMemoryLimitMb(found.memoryLimitMb || found.memoryMb || 5894)
            setDiskLimitGb(found.diskLimitGb || found.diskGb || 88)
          } else {
            setError('Node not found.')
          }
        } else if (nodesRes.data.systemDefaults) {
          setCpuCores(nodesRes.data.systemDefaults.cpuCores)
          setMemoryLimitMb(nodesRes.data.systemDefaults.memoryLimitMb)
          setDiskLimitGb(nodesRes.data.systemDefaults.diskLimitGb)
        }
      } else {
        setError(nodesRes.error.message || 'Failed to initialize node settings.')
      }

      setLoading(false)
    }

    void initData()
    return () => {
      active = false
    }
  }, [id, isEdit])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !fqdn.trim()) return

    setSubmitting(true)
    setError(null)

    const payload = {
      name: name.trim(),
      fqdn: fqdn.trim(),
      ipAddress: ipAddress.trim() || fqdn.trim(),
      publicIp: publicIp.trim(),
      port: Number(port),
      locationId: locationId || null,
      isPublic,
      maintenance,
      cpuCores: Number(cpuCores),
      memoryLimitMb: Number(memoryLimitMb),
      diskLimitGb: Number(diskLimitGb),
    }

    if (isEdit && id) {
      const res = await api.adminUpdateNode(id, payload)
      if (res.ok) {
        navigate('/admin/nodes')
      } else {
        setError(res.error.message || 'Failed to update node.')
      }
    } else {
      const res = await api.adminCreateNode(payload)
      if (res.ok) {
        navigate('/admin/nodes')
      } else {
        setError(res.error.message || 'Failed to create node.')
      }
    }

    setSubmitting(false)
  }

  return (
    <AppShell
      title={isEdit ? 'Edit Node' : 'New Node'}
      description="Configure hardware hypervisor connection and physical resource limits."
    >
      <div className="flex w-full flex-col gap-6">
        {/* Header navigation */}
        <div className="flex items-center gap-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/admin/nodes')}
            className="gap-1.5 text-[12px]"
          >
            <ArrowLeft size={14} />
            Back to Nodes
          </Button>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-wider text-fg-subtle">
              Infrastructure
            </span>
            <span className="text-fg-subtle/50">/</span>
            <span className="text-[12px] font-medium text-fg">
              {isEdit ? 'Edit Node' : 'New Daemon'}
            </span>
          </div>
        </div>

        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-fg">
            {isEdit ? `Edit Node: ${name || 'Host'}` : 'Register New Node'}
          </h1>
          <p className="mt-0.5 text-[13px] text-fg-subtle">
            Connect an Incus compute daemon or physical virtualization host.
          </p>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}

        {isEdit && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-panel border border-border bg-surface p-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('general')}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-control px-3.5 py-2 text-[13px] font-medium transition-colors',
                activeTab === 'general'
                  ? 'bg-surface-2 text-fg shadow-xs'
                  : 'text-fg-subtle hover:text-fg',
              )}
            >
              <HardDrives size={15} aria-hidden />
              General
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('network')}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-control px-3.5 py-2 text-[13px] font-medium transition-colors',
                activeTab === 'network'
                  ? 'bg-surface-2 text-fg shadow-xs'
                  : 'text-fg-subtle hover:text-fg',
              )}
            >
              <Globe size={15} aria-hidden />
              Network
            </button>
          </div>
        )}

        {/* VirtFusion-style Overview Status Widgets (Servers, System, Port Allocation) */}
        {isEdit && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Widget 1: Servers Status Donut */}
            <div className="flex items-center gap-5 rounded-panel border border-border bg-surface p-5 shadow-2xs">
              <div className="relative flex size-20 shrink-0 items-center justify-center">
                <svg className="size-full -rotate-90" viewBox="0 0 36 36">
                  {/* Background Track */}
                  <path
                    className="text-surface-2"
                    strokeWidth="3.2"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  {/* Active servers slice */}
                  <path
                    className="text-emerald-500"
                    strokeDasharray={`${
                      nodeNetwork?.stats?.servers.total
                        ? Math.round(
                            ((nodeNetwork.stats.servers.active || 0) /
                              nodeNetwork.stats.servers.total) *
                              100,
                          )
                        : 0
                    }, 100`}
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-[16px] font-bold text-fg leading-none">
                    {nodeNetwork?.stats?.servers.total ?? 0}
                  </span>
                  <span className="mt-0.5 text-[9px] uppercase tracking-wider text-fg-subtle">Total</span>
                </div>
              </div>

              <div className="flex flex-1 flex-col justify-center">
                <h3 className="text-[13px] font-semibold text-fg">Servers</h3>
                <div className="mt-3 space-y-1.5 text-[12px]">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-fg-subtle">
                      <span className="size-2 rounded-full bg-emerald-500" />
                      Active
                    </span>
                    <span className="font-mono font-medium text-fg">
                      {nodeNetwork?.stats?.servers.active ?? 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-fg-subtle">
                      <span className="size-2 rounded-full bg-purple-500" />
                      Suspended
                    </span>
                    <span className="font-mono font-medium text-fg">
                      {nodeNetwork?.stats?.servers.suspended ?? 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-fg-subtle">
                      <span className="size-2 rounded-full bg-amber-500" />
                      Awaiting Setup
                    </span>
                    <span className="font-mono font-medium text-fg">
                      {nodeNetwork?.stats?.servers.awaitingSetup ?? 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Widget 2: System Toggles */}
            <div className="flex flex-col justify-between rounded-panel border border-border bg-surface p-6 shadow-2xs">
              <div>
                <h3 className="text-[13px] font-semibold text-fg">System</h3>
                <p className="mt-0.5 text-[11px] text-fg-subtle">
                  Hypervisor operational and scheduling status.
                </p>
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-fg">Enabled</span>
                  <button
                    type="button"
                    disabled={updatingSystem}
                    onClick={() => handleToggleSystem('maintenance', !maintenance)}
                    className={cn(
                      'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                      !maintenance ? 'bg-emerald-500' : 'bg-surface-2',
                    )}
                  >
                    <span
                      className={cn(
                        'pointer-events-none inline-block size-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out',
                        !maintenance ? 'translate-x-4' : 'translate-x-0',
                      )}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-fg">Maintenance Mode</span>
                  <button
                    type="button"
                    disabled={updatingSystem}
                    onClick={() => handleToggleSystem('maintenance', !maintenance)}
                    className={cn(
                      'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                      maintenance ? 'bg-amber-500' : 'bg-surface-2',
                    )}
                  >
                    <span
                      className={cn(
                        'pointer-events-none inline-block size-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out',
                        maintenance ? 'translate-x-4' : 'translate-x-0',
                      )}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-fg">Prohibit New Server Creations</span>
                  <button
                    type="button"
                    disabled={updatingSystem}
                    onClick={() => handleToggleSystem('isPublic', !isPublic)}
                    className={cn(
                      'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                      !isPublic ? 'bg-rose-500' : 'bg-surface-2',
                    )}
                  >
                    <span
                      className={cn(
                        'pointer-events-none inline-block size-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out',
                        !isPublic ? 'translate-x-4' : 'translate-x-0',
                      )}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Widget 3: Port Forwarding Pool Status Donut */}
            <div className="flex items-center gap-5 rounded-panel border border-border bg-surface p-5 shadow-2xs">
              <div className="relative flex size-20 shrink-0 items-center justify-center">
                <svg className="size-full -rotate-90" viewBox="0 0 36 36">
                  {/* Background Track */}
                  <path
                    className="text-surface-2"
                    strokeWidth="3.2"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  {/* Available ports slice */}
                  <path
                    className="text-emerald-500"
                    strokeDasharray={`${
                      nodeNetwork?.stats?.ports.total
                        ? Math.round(
                            ((nodeNetwork.stats.ports.available || 0) /
                              nodeNetwork.stats.ports.total) *
                              100,
                          )
                        : 100
                    }, 100`}
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-[16px] font-bold text-fg leading-none">
                    {nodeNetwork?.stats?.ports.total ?? 1000}
                  </span>
                  <span className="mt-0.5 text-[9px] uppercase tracking-wider text-fg-subtle">Ports</span>
                </div>
              </div>

              <div className="flex flex-1 flex-col justify-center">
                <div className="flex items-center justify-between">
                  <h3 className="text-[13px] font-semibold text-fg">Port Forwards</h3>
                  <span className="font-mono text-[10px] text-fg-subtle">
                    {nodeNetwork?.portForwardRange.start ?? 22000}-{nodeNetwork?.portForwardRange.end ?? 22999}
                  </span>
                </div>
                <div className="mt-3 space-y-1.5 text-[12px]">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-fg-subtle">
                      <span className="size-2 rounded-full bg-emerald-500" />
                      Available
                    </span>
                    <span className="font-mono font-medium text-fg">
                      {nodeNetwork?.stats?.ports.available ?? 1000}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-fg-subtle">
                      <span className="size-2 rounded-full bg-purple-500" />
                      In Use
                    </span>
                    <span className="font-mono font-medium text-fg">
                      {nodeNetwork?.stats?.ports.inUse ?? 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-fg-subtle">
                      <span className="size-2 rounded-full bg-amber-500" />
                      Reserved
                    </span>
                    <span className="font-mono font-medium text-fg">
                      {nodeNetwork?.stats?.ports.reserved ?? 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="rounded-panel border border-border bg-surface p-12 text-center text-[13px] text-fg-subtle">
            Loading node details...
          </div>
        ) : activeTab === 'general' ? (
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-6"
          >
            {/* Two-Column VirtFusion-style Panel Layout */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Left Column: General Configuration */}
              <div className="flex flex-col gap-6">
                {/* Panel 1: Hypervisor Identity */}
                <div className="rounded-panel border border-border bg-surface p-6 shadow-2xs">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <h3 className="text-[14px] font-semibold text-fg">Hypervisor Identity</h3>
                    <span className="rounded bg-accent/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-accent-text">
                      x86_64
                    </span>
                  </div>

                  <div className="mt-4 flex flex-col gap-4">
                    <div>
                      <label className="text-[12px] font-semibold text-fg">Virtualization Engine</label>
                      <input
                        type="text"
                        disabled
                        value="Incus (LXD / KVM Engine) • Unlimited Instances"
                        className="mt-1 h-9 w-full rounded-control border border-field-border bg-surface-2 px-3 text-[12px] text-fg-subtle opacity-80 cursor-not-allowed"
                      />
                    </div>

                    <div>
                      <label className="text-[12px] font-semibold text-fg">
                        Node Name <span className="text-danger">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="node-01"
                        className="mt-1 h-9 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[12px] text-fg focus:border-accent focus:outline-none"
                      />
                      <span className="mt-0.5 block text-[11px] text-fg-subtle">
                        Unique internal hypervisor identifier.
                      </span>
                    </div>

                    <div>
                      <label className="text-[12px] font-semibold text-fg">
                        Hostname / FQDN <span className="text-danger">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={fqdn}
                        onChange={(e) => setFqdn(e.target.value)}
                        placeholder="node01.example.com"
                        disabled={isDefaultLocalNode}
                        className={cn(
                          'mt-1 h-9 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[12px] text-fg focus:border-accent focus:outline-none',
                          isDefaultLocalNode && 'cursor-not-allowed opacity-60 bg-surface-2',
                        )}
                      />
                      <span className="mt-0.5 block text-[11px] text-fg-subtle">
                        Domain endpoint used for public web and API connections.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Panel 2: Endpoints & Routing */}
                <div className="rounded-panel border border-border bg-surface p-6 shadow-2xs">
                  <div className="border-b border-border pb-3">
                    <h3 className="text-[14px] font-semibold text-fg">Network Endpoints & Routing</h3>
                  </div>

                  <div className="mt-4 flex flex-col gap-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="text-[12px] font-semibold text-fg">Daemon IP (Internal)</label>
                        <input
                          type="text"
                          value={ipAddress}
                          onChange={(e) => setIpAddress(e.target.value)}
                          placeholder="127.0.0.1"
                          disabled={isDefaultLocalNode}
                          className={cn(
                            'mt-1 h-9 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[12px] text-fg focus:border-accent focus:outline-none',
                            isDefaultLocalNode && 'cursor-not-allowed opacity-60 bg-surface-2',
                          )}
                        />
                      </div>

                      <div>
                        <label className="text-[12px] font-semibold text-fg">Comms Port</label>
                        <input
                          type="number"
                          value={port}
                          onChange={(e) => setPort(Number(e.target.value))}
                          disabled={isDefaultLocalNode}
                          className={cn(
                            'mt-1 h-9 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[12px] text-fg focus:border-accent focus:outline-none',
                            isDefaultLocalNode && 'cursor-not-allowed opacity-60 bg-surface-2',
                          )}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[12px] font-semibold text-fg">Public IPv4 (Ingress)</label>
                      <input
                        type="text"
                        value={publicIp}
                        onChange={(e) => setPublicIp(e.target.value)}
                        placeholder="5.231.32.77"
                        className="mt-1 h-9 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[12px] text-fg focus:border-accent focus:outline-none"
                      />
                      <span className="mt-0.5 block text-[11px] text-fg-subtle">
                        External address used for SSH port forwards and NAT ingress.
                      </span>
                    </div>

                    <div>
                      <label className="text-[12px] font-semibold text-fg">Assigned Regional Location</label>
                      <select
                        value={locationId}
                        onChange={(e) => setLocationId(e.target.value)}
                        className="mt-1 h-9 w-full rounded-control border border-field-border bg-field px-3 text-[12px] text-fg focus:border-accent focus:outline-none"
                      >
                        <option value="">-- No Location Assigned --</option>
                        {locations.map((loc) => (
                          <option key={loc.id} value={loc.id}>
                            {loc.shortCode.toUpperCase()} - {loc.name} ({loc.countryCode})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Capacity Limits & Virtualization Settings */}
              <div className="flex flex-col gap-6">
                {/* Panel 3: Hardware Capacity Limits */}
                <div className="rounded-panel border border-border bg-surface p-6 shadow-2xs">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <h3 className="text-[14px] font-semibold text-fg">Hardware Capacity Limits</h3>
                    <span className="text-[11px] text-fg-subtle">0 or blank = unlimited</span>
                  </div>

                  <div className="mt-4 flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <span className="w-24 text-[12px] font-medium text-fg">CPU Cores</span>
                      <input
                        type="number"
                        value={cpuCores}
                        onChange={(e) => setCpuCores(Number(e.target.value))}
                        className="h-9 flex-1 rounded-control border border-field-border bg-field px-3 font-mono text-[13px] text-fg focus:border-accent focus:outline-none"
                      />
                      <span className="w-20 text-right font-mono text-[11px] text-fg-subtle">Cores</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="w-24 text-[12px] font-medium text-fg">Memory</span>
                      <input
                        type="number"
                        value={memoryLimitMb}
                        onChange={(e) => setMemoryLimitMb(Number(e.target.value))}
                        className="h-9 flex-1 rounded-control border border-field-border bg-field px-3 font-mono text-[13px] text-fg focus:border-accent focus:outline-none"
                      />
                      <span className="w-20 text-right font-mono text-[11px] text-fg-subtle">MB</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="w-24 text-[12px] font-medium text-fg">Disk Storage</span>
                      <input
                        type="number"
                        value={diskLimitGb}
                        onChange={(e) => setDiskLimitGb(Number(e.target.value))}
                        className="h-9 flex-1 rounded-control border border-field-border bg-field px-3 font-mono text-[13px] text-fg focus:border-accent focus:outline-none"
                      />
                      <span className="w-20 text-right font-mono text-[11px] text-fg-subtle">GB</span>
                    </div>
                  </div>
                </div>

                {/* Panel 4: Virtualization Driver & Storage Options */}
                <div className="rounded-panel border border-border bg-surface p-6 shadow-2xs">
                  <div className="border-b border-border pb-3">
                    <h3 className="text-[14px] font-semibold text-fg">Virtualization Settings</h3>
                  </div>

                  <div className="mt-4 flex flex-col gap-4">
                    <div>
                      <label className="text-[12px] font-semibold text-fg">CPU Mode / Instruction Model</label>
                      <input
                        type="text"
                        disabled
                        value="Host Passthrough (Incus Native)"
                        className="mt-1 h-9 w-full rounded-control border border-field-border bg-surface-2 px-3 text-[12px] text-fg-subtle opacity-80 cursor-not-allowed"
                      />
                    </div>

                    <div>
                      <label className="text-[12px] font-semibold text-fg">Primary Network Adapter</label>
                      <input
                        type="text"
                        disabled
                        value={primaryNetwork || 'incusbr0'}
                        className="mt-1 h-9 w-full rounded-control border border-field-border bg-surface-2 px-3 font-mono text-[12px] text-fg-subtle opacity-80 cursor-not-allowed"
                      />
                      <span className="mt-0.5 block text-[11px] text-fg-subtle">
                        Change default bridge in the Network tab.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Submission controls */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate('/admin/nodes')}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={submitting}
                className="gap-1.5"
              >
                <FloppyDisk size={16} />
                {submitting ? 'Saving...' : isEdit ? 'Update Node' : 'Create Node'}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-6">
            {netError && <Alert tone="danger">{netError}</Alert>}

            {/* Host Routing & Port Range Overview (at top) */}
            <section className="rounded-panel border border-border bg-surface p-6 shadow-2xs">
              <div className="flex items-center gap-3 border-b border-border pb-4">
                <div className="flex size-9 items-center justify-center rounded-control bg-accent/10 text-accent-text">
                  <ShareNetwork size={18} weight="bold" />
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-fg">Host IP & Routing</h2>
                  <p className="text-[11px] text-fg-subtle">
                    Public connectivity endpoints and NAT port allocation range for this compute node.
                  </p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-control border border-border bg-surface-2/40 p-3.5">
                  <span className="text-[11px] font-medium text-fg-subtle">FQDN / Endpoint</span>
                  <p className="mt-1 font-mono text-[13px] font-semibold text-fg">{fqdn || 'localhost'}</p>
                </div>
                <div className="rounded-control border border-border bg-surface-2/40 p-3.5">
                  <span className="text-[11px] font-medium text-fg-subtle">Daemon IP (Internal)</span>
                  <p className="mt-1 font-mono text-[13px] font-semibold text-fg">{ipAddress || '127.0.0.1'}:{port}</p>
                </div>
                <div className="rounded-control border border-border bg-surface-2/40 p-3.5">
                  <span className="text-[11px] font-medium text-fg-subtle">Public IPv4 (Ingress)</span>
                  <p className="mt-1 font-mono text-[13px] font-semibold text-fg">{publicIp || 'None specified'}</p>
                </div>
                <div className="rounded-control border border-border bg-surface-2/40 p-3.5">
                  <span className="text-[11px] font-medium text-fg-subtle">Port Forward Range</span>
                  <p className="mt-1 font-mono text-[13px] font-semibold text-fg">
                    {nodeNetwork?.portForwardRange.start ?? 22000} - {nodeNetwork?.portForwardRange.end ?? 22999}
                  </p>
                </div>
              </div>
            </section>

            {/* VirtFusion-style Primary Network Configuration Form (full width panel like Host IP) */}
            <form
              onSubmit={handleUpdatePrimaryNetwork}
              className="rounded-panel border border-border bg-surface p-6 shadow-2xs"
            >
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-[15px] font-semibold text-fg">Primary Network Configuration</h2>
                    <span className="rounded bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-400">
                      ACTIVE: {primaryNetwork}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-fg-subtle">
                    Default bridge interface and MTU used for provisioning new servers on this node.
                  </p>
                </div>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={savingPrimary}
                >
                  {savingPrimary ? 'Updating...' : 'Update Primary Network'}
                </Button>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
                <div>
                  <label className="text-[12px] font-semibold text-fg">Interface Name</label>
                  <select
                    value={primaryNetwork}
                    onChange={(e) => setPrimaryNetwork(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[13px] text-fg focus:border-accent focus:outline-none"
                  >
                    {nodeNetwork?.networks.map((net) => (
                      <option key={net.name} value={net.name}>
                        {net.name} ({net.type}{net.managed ? ', managed' : ''})
                      </option>
                    ))}
                    {!nodeNetwork?.networks.some((n) => n.name === primaryNetwork) && (
                      <option value={primaryNetwork}>{primaryNetwork}</option>
                    )}
                  </select>
                  <span className="mt-1 block text-[11px] text-fg-subtle">
                    Primary Incus network device attached to guest instances.
                  </span>
                </div>

                <div>
                  <label className="text-[12px] font-semibold text-fg">Network Mode</label>
                  <input
                    type="text"
                    disabled
                    value="NAT / Bridged (Incus)"
                    className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-surface-2 px-3 text-[13px] text-fg-subtle opacity-70 cursor-not-allowed"
                  />
                  <span className="mt-1 block text-[11px] text-fg-subtle">
                    Direct layer-2 attachment or masqueraded NAT bridge.
                  </span>
                </div>
              </div>
            </form>

            {/* Network Interfaces Header with Add Network Button */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[15px] font-semibold text-fg">Hypervisor Network Bridges</h2>
                <p className="text-[11px] text-fg-subtle">
                  All managed primary and secondary network adapters on this hypervisor.
                </p>
              </div>
              <div className="flex items-center gap-3">
                {loadingNetwork && (
                  <span className="text-[12px] text-fg-subtle">Refreshing...</span>
                )}
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => setAddNetOpen(true)}
                  className="gap-1.5"
                >
                  <Plus size={15} />
                  Add Network
                </Button>
              </div>
            </div>

            {/* Grid of Square Cards for ALL Managed Incus Bridges */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {nodeNetwork?.networks
                .filter((net) => net.managed)
                .map((net) => {
                  const isPrimary = net.name === primaryNetwork
                  return (
                    <div
                      key={net.name}
                      className={`flex flex-col justify-between rounded-panel border bg-surface p-6 shadow-2xs ${
                        isPrimary ? 'border-accent/40 bg-accent/[0.02]' : 'border-border'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between border-b border-border pb-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-mono text-[15px] font-semibold text-fg">{net.name}</h3>
                              {isPrimary ? (
                                <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-400">
                                  PRIMARY
                                </span>
                              ) : (
                                <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle">
                                  secondary
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 text-[11px] text-fg-subtle">
                              {net.description || `${net.type.toUpperCase()} bridge on hypervisor.`}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-2.5 py-0.5 font-mono text-[11px] font-semibold tracking-wider ${
                              isPrimary
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : 'bg-surface-2 text-fg-subtle'
                            }`}
                          >
                            {isPrimary ? 'ACTIVE' : 'READY'}
                          </span>
                        </div>

                        <div className="mt-5 grid grid-cols-2 gap-3.5">
                          <div className="rounded-control border border-border bg-surface-2/40 p-3">
                            <span className="text-[11px] font-medium text-fg-subtle">IPv4 Subnet</span>
                            <p className="mt-1 truncate font-mono text-[12px] font-semibold text-fg" title={net.config?.['ipv4.address'] || 'None'}>
                              {net.config?.['ipv4.address'] || 'None'}
                            </p>
                          </div>
                          <div className="rounded-control border border-border bg-surface-2/40 p-3">
                            <span className="text-[11px] font-medium text-fg-subtle">MTU</span>
                            <p className="mt-1 font-mono text-[12px] font-semibold text-fg">
                              {net.config?.['bridge.mtu'] || '1500'}
                            </p>
                          </div>
                          <div className="rounded-control border border-border bg-surface-2/40 p-3">
                            <span className="text-[11px] font-medium text-fg-subtle">NAT Masquerade</span>
                            <p className="mt-1 text-[12px] font-medium text-fg">
                              {net.config?.['ipv4.nat'] === 'true' ? 'Enabled' : 'Disabled'}
                            </p>
                          </div>
                          <div className="rounded-control border border-border bg-surface-2/40 p-3">
                            <span className="text-[11px] font-medium text-fg-subtle">Type</span>
                            <p className="mt-1 font-mono uppercase text-[12px] font-semibold text-fg">
                              {net.type}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
                        <span className="text-[11px] text-fg-subtle">
                          {net.used_by?.length ?? 0} instances attached
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => openEditModal(net)}
                            className="gap-1 px-2.5 text-[12px]"
                            title="Edit Network Bridge"
                          >
                            <PencilSimple size={13} />
                            Edit
                          </Button>

                          {!isPrimary ? (
                            <>
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={async () => {
                                  setPrimaryNetwork(net.name)
                                  if (id) {
                                    setSavingPrimary(true)
                                    const res = await api.adminUpdateNode(id, { primaryNetwork: net.name } as any)
                                    if (res.ok) {
                                      loadNetworkData()
                                    }
                                    setSavingPrimary(false)
                                  }
                                }}
                                className="text-[12px]"
                              >
                                Set as Primary
                              </Button>
                              <Button
                                type="button"
                                variant="danger"
                                size="sm"
                                onClick={() => setDeleteNetName(net.name)}
                                className="px-2"
                                title="Delete Bridge"
                              >
                                <Trash size={13} />
                              </Button>
                            </>
                          ) : (
                            <span className="text-[12px] font-medium text-emerald-400">Default Gateway</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        )}
      </div>

      {/* Add Network Bridge Dialog */}
      <Dialog open={addNetOpen} onOpenChange={setAddNetOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>Add Network Bridge</DialogTitle>
          <DialogDescription>
            Creates a new managed Incus network bridge on this hypervisor host.
          </DialogDescription>

          <form onSubmit={handleCreateNetwork} className="mt-4 flex flex-col gap-4">
            <div>
              <label className="text-[12px] font-semibold text-fg">
                Bridge Name <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                required
                value={newNetName}
                onChange={(e) => setNewNetName(e.target.value)}
                placeholder="natbr0"
                className="mt-1 h-9 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[12px] text-fg focus:border-accent focus:outline-none"
              />
              <span className="mt-0.5 block text-[11px] text-fg-subtle">
                Alphanumeric identifier (e.g. natbr0, privbr0).
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[12px] font-semibold text-fg">MTU</label>
                <input
                  type="number"
                  value={newNetMtu}
                  onChange={(e) => setNewNetMtu(Number(e.target.value))}
                  placeholder="1372"
                  className="mt-1 h-9 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[12px] text-fg focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[12px] font-semibold text-fg">IPv4 Gateway / Subnet</label>
                <input
                  type="text"
                  value={newNetIpv4}
                  onChange={(e) => setNewNetIpv4(e.target.value)}
                  placeholder="auto or 10.200.0.1/24"
                  className="mt-1 h-9 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[12px] text-fg focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            <label className="flex items-center gap-2.5 pt-1 cursor-pointer select-none">
              <Checkbox
                checked={newNetNat}
                onCheckedChange={(checked) => setNewNetNat(checked === true)}
              />
              <span className="text-[12px] font-medium text-fg">Enable Outbound NAT Masquerade</span>
            </label>

            <div className="mt-4 flex justify-end gap-2 border-t border-border pt-4">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setAddNetOpen(false)}
                disabled={addingNet}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={addingNet || !newNetName.trim()}
              >
                {addingNet ? 'Creating...' : 'Create Network'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Network Bridge Dialog */}
      <Dialog open={editNetOpen} onOpenChange={setEditNetOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>Edit Network Bridge: {editingNetName}</DialogTitle>
          <DialogDescription>
            Update MTU, IPv4 address subnet, or NAT settings for this Incus bridge.
          </DialogDescription>

          <form onSubmit={handleUpdateNetwork} className="mt-4 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[12px] font-semibold text-fg">MTU</label>
                <input
                  type="number"
                  value={editNetMtu}
                  onChange={(e) => setEditNetMtu(Number(e.target.value))}
                  placeholder="1372"
                  className="mt-1 h-9 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[12px] text-fg focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[12px] font-semibold text-fg">IPv4 Gateway / Subnet</label>
                <input
                  type="text"
                  value={editNetIpv4}
                  onChange={(e) => setEditNetIpv4(e.target.value)}
                  placeholder="auto or 10.200.0.1/24"
                  className="mt-1 h-9 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[12px] text-fg focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            <label className="flex items-center gap-2.5 pt-1 cursor-pointer select-none">
              <Checkbox
                checked={editNetNat}
                onCheckedChange={(checked) => setEditNetNat(checked === true)}
              />
              <span className="text-[12px] font-medium text-fg">Enable Outbound NAT Masquerade</span>
            </label>

            <div className="mt-4 flex justify-end gap-2 border-t border-border pt-4">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setEditNetOpen(false)}
                disabled={updatingNet}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={updatingNet}
              >
                {updatingNet ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Network Confirmation Dialog */}
      <Dialog open={Boolean(deleteNetName)} onOpenChange={(open) => !open && setDeleteNetName(null)}>
        <DialogContent className="max-w-sm">
          <DialogTitle>Delete Network Bridge</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete bridge <span className="font-mono font-semibold text-fg">{deleteNetName}</span>? This action cannot be undone.
          </DialogDescription>

          <div className="mt-5 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setDeleteNetName(null)}
              disabled={deletingNet}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={handleDeleteNetwork}
              disabled={deletingNet}
            >
              {deletingNet ? 'Deleting...' : 'Delete Bridge'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
