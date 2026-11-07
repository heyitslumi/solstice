import {
  ArrowLeft,
  CheckCircle,
  ClockCounterClockwise,
  Database,
  FloppyDisk,
  Globe,
  HardDrives,
  ListChecks,
  PencilSimple,
  Plus,
  ShareNetwork,
  Trash,
  WarningCircle,
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
  const [displayName, setDisplayName] = useState('')
  const [cpuModel, setCpuModel] = useState('')
  const [cpuDisplay, setCpuDisplay] = useState('')
  const [fqdn, setFqdn] = useState('')
  const [ipAddress, setIpAddress] = useState('')
  const [publicIp, setPublicIp] = useState('')
  const [port, setPort] = useState(8443)
  const [locationId, setLocationId] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [maintenance, setMaintenance] = useState(false)
  const [cpuCores, setCpuCores] = useState(4)
  const [memoryLimitMb, setMemoryLimitMb] = useState(5894)
  const [serverLimit, setServerLimit] = useState(0)

  const isDefaultLocalNode = isEdit && (name === 'local-incus' || fqdn === 'localhost')

  type NodeTab = 'general' | 'network' | 'storage' | 'tasks'
  const [activeTab, setActiveTab] = useState<NodeTab>('general')
  const [nodeNetwork, setNodeNetwork] = useState<{
    primaryNetwork: string
    stats?: {
      servers: { total: number; active: number; suspended: number; awaitingSetup: number }
      ports: { total: number; available: number; inUse: number }
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

  // Storage tab state
  const [nodeStorage, setNodeStorage] = useState<{
    storageEnabled: boolean
    diskLimitGb: number
    pools: Array<{
      name: string
      driver: string
      status: string
      description?: string
      config?: Record<string, string>
      used_by?: string[]
    }>
  } | null>(null)
  const [loadingStorage, setLoadingStorage] = useState(false)
  const [storageEnabled, setStorageEnabled] = useState(true)
  const [storageMaxDisk, setStorageMaxDisk] = useState(1000)
  const [updatingStorage, setUpdatingStorage] = useState(false)
  const [storageSavedMsg, setStorageSavedMsg] = useState(false)

  // Add storage pool modal state
  const [addPoolOpen, setAddPoolOpen] = useState(false)
  const [newPoolName, setNewPoolName] = useState('')
  const [newPoolDriver, setNewPoolDriver] = useState<'dir' | 'btrfs' | 'zfs'>('dir')
  const [newPoolSource, setNewPoolSource] = useState('')
  const [newPoolSizeGb, setNewPoolSizeGb] = useState(100)
  const [addingPool, setAddingPool] = useState(false)
  const [storageError, setStorageError] = useState<string | null>(null)

  // Delete storage pool modal state
  const [deletePoolName, setDeletePoolName] = useState<string | null>(null)
  const [deletingPool, setDeletingPool] = useState(false)

  function loadStorageData() {
    if (!id) return
    setLoadingStorage(true)
    setStorageError(null)
    void api.adminGetNodeStorage(id).then((res) => {
      if (res.ok) {
        setNodeStorage(res.data)
        setStorageEnabled(res.data.storageEnabled !== false)
        setStorageMaxDisk(res.data.diskLimitGb || 1000)
      }
      setLoadingStorage(false)
    })
  }

  async function handleCreatePool(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !newPoolName.trim()) return
    setAddingPool(true)
    setStorageError(null)

    const res = await api.adminCreateNodeStoragePool(id, {
      name: newPoolName.trim(),
      driver: newPoolDriver,
      source: newPoolSource.trim() || undefined,
      sizeGb: ['btrfs', 'zfs'].includes(newPoolDriver) ? Number(newPoolSizeGb) || 0 : undefined,
    })

    if (res.ok) {
      setAddPoolOpen(false)
      setNewPoolName('')
      setNewPoolSource('')
      loadStorageData()
    } else {
      setStorageError(res.error.message || 'Failed to create storage pool.')
    }
    setAddingPool(false)
  }

  async function handleDeletePool() {
    if (!id || !deletePoolName) return
    setDeletingPool(true)
    setStorageError(null)
    const res = await api.adminDeleteNodeStoragePool(id, deletePoolName)
    if (res.ok) {
      setDeletePoolName(null)
      loadStorageData()
    } else {
      setStorageError(res.error.message || 'Failed to delete storage pool.')
    }
    setDeletingPool(false)
  }

  async function handleSaveStorage() {
    if (!id) return
    setUpdatingStorage(true)
    setStorageSavedMsg(false)
    const res = await api.adminUpdateNodeStorage(id, {
      storageEnabled,
      diskLimitGb: Number(storageMaxDisk) || 0,
    })
    if (res.ok) {
      setStorageSavedMsg(true)
      setTimeout(() => setStorageSavedMsg(false), 3000)
      loadStorageData()
    }
    setUpdatingStorage(false)
  }

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

  // Tasks tab state
  const [nodeTasks, setNodeTasks] = useState<
    Array<{
      id: string
      task: string
      action: string
      details: string
      server: string
      serverId: string | null
      started: string
      finished: string | null
      durationSec: number
      progress: number
      status: string
      user: string | null
    }>
  >([])
  const [loadingTasks, setLoadingTasks] = useState(false)

  function loadTasksData() {
    if (!id) return
    setLoadingTasks(true)
    void api.adminGetNodeTasks(id).then((res) => {
      if (res.ok) {
        setNodeTasks(res.data.tasks)
      }
      setLoadingTasks(false)
    })
  }

  useEffect(() => {
    if (id && !nodeNetwork) {
      loadNetworkData()
    }
    if (id && !nodeStorage) {
      loadStorageData()
    }
    if (id && activeTab === 'tasks') {
      loadTasksData()
    }
  }, [id, nodeNetwork, nodeStorage, activeTab])

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
            setDisplayName(found.displayName || '')
            setCpuModel(found.cpuModel || '')
            setCpuDisplay(found.cpuDisplay || '')
            setFqdn(found.fqdn)
            setIpAddress(found.ipAddress || '')
            setPublicIp(found.publicIp || '')
            setPort(found.port || 8443)
            setLocationId(found.locationId || '')
            setIsPublic(found.isPublic !== false)
            setMaintenance(found.maintenance === true)
            setCpuCores(found.cpuCores || 4)
            setMemoryLimitMb(found.memoryLimitMb || found.memoryMb || 5894)
            setServerLimit(found.serverLimit || 0)
          } else {
            setError('Node not found.')
          }
        } else if (nodesRes.data.systemDefaults) {
          setCpuCores(nodesRes.data.systemDefaults.cpuCores)
          setMemoryLimitMb(nodesRes.data.systemDefaults.memoryLimitMb)
          setServerLimit(0)
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
      displayName: displayName.trim(),
      cpuModel: cpuModel.trim(),
      cpuDisplay: cpuDisplay.trim(),
      fqdn: fqdn.trim(),
      ipAddress: ipAddress.trim() || fqdn.trim(),
      publicIp: publicIp.trim(),
      port: Number(port),
      locationId: locationId || null,
      isPublic,
      maintenance,
      cpuCores: Number(cpuCores),
      memoryLimitMb: Number(memoryLimitMb),
      serverLimit: Number(serverLimit),
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
            <button
              type="button"
              onClick={() => setActiveTab('storage')}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-control px-3.5 py-2 text-[13px] font-medium transition-colors',
                activeTab === 'storage'
                  ? 'bg-surface-2 text-fg shadow-xs'
                  : 'text-fg-subtle hover:text-fg',
              )}
            >
              <Database size={15} aria-hidden />
              Storage
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('tasks')}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-control px-3.5 py-2 text-[13px] font-medium transition-colors',
                activeTab === 'tasks'
                  ? 'bg-surface-2 text-fg shadow-xs'
                  : 'text-fg-subtle hover:text-fg',
              )}
            >
              <ClockCounterClockwise size={15} aria-hidden />
              Tasks
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
                        Unique internal hypervisor identifier (admin view only).
                      </span>
                    </div>

                    <div>
                      <label className="text-[12px] font-semibold text-fg">Display Name</label>
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="e.g. Solstice US-East (Virginia)"
                        className="mt-1 h-9 w-full rounded-control border border-field-border bg-field px-3 text-[12px] text-fg focus:border-accent focus:outline-none"
                      />
                      <span className="mt-0.5 block text-[11px] text-fg-subtle">
                        Name shown to end users. Leave blank to default to Node Name.
                      </span>
                    </div>

                    <div>
                      <label className="text-[12px] font-semibold text-fg">CPU Model (Marketing / End User)</label>
                      <input
                        type="text"
                        value={cpuDisplay}
                        onChange={(e) => setCpuDisplay(e.target.value)}
                        placeholder="e.g. Intel(R) Xeon(R) E5-2680 v4"
                        className="mt-1 h-9 w-full rounded-control border border-field-border bg-field px-3 text-[12px] text-fg focus:border-accent focus:outline-none"
                      />
                      <span className="mt-0.5 block text-[11px] text-fg-subtle">
                        This will be shown to the end user. Leave blank if you don't want to show a CPU model.
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
                      <span className="w-24 text-[12px] font-medium text-fg">Servers</span>
                      <input
                        type="number"
                        value={serverLimit}
                        onChange={(e) => setServerLimit(Number(e.target.value))}
                        className="h-9 flex-1 rounded-control border border-field-border bg-field px-3 font-mono text-[13px] text-fg focus:border-accent focus:outline-none"
                      />
                      <span className="w-20 text-right font-mono text-[11px] text-fg-subtle">Instances</span>
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
                      <select
                        value={cpuModel}
                        onChange={(e) => setCpuModel(e.target.value)}
                        className="mt-1 h-9 w-full rounded-control border border-field-border bg-field px-3 text-[12px] text-fg focus:border-accent focus:outline-none"
                      >
                        <option value="">⚙️ Inherit from virtualization settings (Host Passthrough)</option>
                        <option value="host">Host Passthrough</option>
                        <option value="host-model">Host Model</option>
                        <option value="max">Max (All Host Features)</option>
                        <option value="qemu64">QEMU 64-bit</option>
                        <option value="kvm64">KVM 64-bit</option>
                        
                        <optgroup label="AMD EPYC & Zen Series">
                          <option value="EPYC-Genoa">AMD EPYC Genoa (Zen 4)</option>
                          <option value="EPYC-Milan">AMD EPYC Milan (Zen 3)</option>
                          <option value="EPYC-Milan-v2">AMD EPYC Milan v2</option>
                          <option value="EPYC-Rome">AMD EPYC Rome (Zen 2)</option>
                          <option value="EPYC-Rome-v2">AMD EPYC Rome v2</option>
                          <option value="EPYC-Rome-v3">AMD EPYC Rome v3</option>
                          <option value="EPYC-Rome-v4">AMD EPYC Rome v4</option>
                          <option value="EPYC">AMD EPYC (Naples)</option>
                          <option value="EPYC-IBPB">AMD EPYC (Naples IBPB)</option>
                          <option value="EPYC-v2">AMD EPYC v2</option>
                          <option value="EPYC-v3">AMD EPYC v3</option>
                          <option value="EPYC-v4">AMD EPYC v4</option>
                          <option value="Phenom">AMD Phenom</option>
                          <option value="Athlon">AMD Athlon</option>
                          <option value="Opteron_G5">AMD Opteron G5</option>
                          <option value="Opteron_G4">AMD Opteron G4</option>
                          <option value="Opteron_G3">AMD Opteron G3</option>
                          <option value="Opteron_G2">AMD Opteron G2</option>
                          <option value="Opteron_G1">AMD Opteron G1</option>
                        </optgroup>

                        <optgroup label="Intel Xeon Scalable & Enterprise">
                          <option value="GraniteRapids">Intel Granite Rapids</option>
                          <option value="GraniteRapids-v2">Intel Granite Rapids v2</option>
                          <option value="SierraForest">Intel Sierra Forest</option>
                          <option value="SapphireRapids">Intel Sapphire Rapids</option>
                          <option value="SapphireRapids-v2">Intel Sapphire Rapids v2</option>
                          <option value="SapphireRapids-v3">Intel Sapphire Rapids v3</option>
                          <option value="Cooperlake">Intel Cooper Lake</option>
                          <option value="Icelake-Server">Intel Ice Lake Server</option>
                          <option value="Icelake-Server-noTSX">Intel Ice Lake Server (no TSX)</option>
                          <option value="Icelake-Server-v2">Intel Ice Lake Server v2</option>
                          <option value="Icelake-Server-v3">Intel Ice Lake Server v3</option>
                          <option value="Icelake-Server-v4">Intel Ice Lake Server v4</option>
                          <option value="Icelake-Server-v5">Intel Ice Lake Server v5</option>
                          <option value="Icelake-Server-v6">Intel Ice Lake Server v6</option>
                          <option value="Cascadelake-Server">Intel Cascade Lake Server</option>
                          <option value="Cascadelake-Server-noTSX">Intel Cascade Lake Server (no TSX)</option>
                          <option value="Skylake-Server">Intel Skylake Server</option>
                          <option value="Skylake-Server-IBRS">Intel Skylake Server IBRS</option>
                          <option value="Skylake-Server-noTSX-IBRS">Intel Skylake Server no TSX IBRS</option>
                          <option value="Broadwell">Intel Broadwell</option>
                          <option value="Broadwell-IBRS">Intel Broadwell IBRS</option>
                          <option value="Broadwell-noTSX">Intel Broadwell (no TSX)</option>
                          <option value="Broadwell-noTSX-IBRS">Intel Broadwell no TSX IBRS</option>
                          <option value="Haswell">Intel Haswell</option>
                          <option value="Haswell-IBRS">Intel Haswell IBRS</option>
                          <option value="Haswell-noTSX">Intel Haswell (no TSX)</option>
                          <option value="Haswell-noTSX-IBRS">Intel Haswell no TSX IBRS</option>
                          <option value="IvyBridge">Intel Ivy Bridge</option>
                          <option value="IvyBridge-IBRS">Intel Ivy Bridge IBRS</option>
                          <option value="SandyBridge">Intel Sandy Bridge</option>
                          <option value="SandyBridge-IBRS">Intel Sandy Bridge IBRS</option>
                          <option value="Westmere">Intel Westmere</option>
                          <option value="Westmere-IBRS">Intel Westmere IBRS</option>
                          <option value="Nehalem">Intel Nehalem</option>
                          <option value="Nehalem-IBRS">Intel Nehalem IBRS</option>
                          <option value="Penryn">Intel Penryn</option>
                          <option value="Conroe">Intel Conroe</option>
                        </optgroup>

                        <optgroup label="Intel Client & Embedded">
                          <option value="Icelake-Client">Intel Ice Lake Client</option>
                          <option value="Icelake-Client-noTSX">Intel Ice Lake Client (no TSX)</option>
                          <option value="Skylake-Client">Intel Skylake Client</option>
                          <option value="Skylake-Client-IBRS">Intel Skylake Client IBRS</option>
                          <option value="Skylake-Client-noTSX-IBRS">Intel Skylake Client no TSX IBRS</option>
                          <option value="Snowridge">Intel Snowridge</option>
                          <option value="Denverton">Intel Denverton</option>
                          <option value="Denverton-v2">Intel Denverton v2</option>
                          <option value="Denverton-v3">Intel Denverton v3</option>
                          <option value="KnightsMill">Intel Knights Mill</option>
                          <option value="n270">Intel Atom N270</option>
                          <option value="core2duo">Intel Core 2 Duo</option>
                          <option value="coreduo">Intel Core Duo</option>
                          <option value="pentium">Intel Pentium</option>
                          <option value="pentium2">Intel Pentium 2</option>
                          <option value="pentium3">Intel Pentium 3</option>
                          <option value="pentiumpro">Intel Pentium Pro</option>
                          <option value="486">486</option>
                        </optgroup>

                        <optgroup label="ARM & Other Architectures">
                          <option value="Dhyana">Hygon Dhyana</option>
                          <option value="Dhyana-v2">Hygon Dhyana v2</option>
                          <option value="neoverse-n1">Neoverse N1</option>
                          <option value="neoverse-v1">Neoverse V1</option>
                          <option value="cortex-a72">Cortex-A72</option>
                        </optgroup>
                      </select>
                      <span className="mt-0.5 block text-[11px] text-fg-subtle">
                        Applies to KVM instances only. LXC containers directly inherit the host kernel CPU model.
                      </span>
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
        ) : activeTab === 'network' ? (
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
        ) : activeTab === 'storage' ? (
          /* Storage Tab (VirtFusion style Square Cards Grid) */
          <div className="flex flex-col gap-6">
            {storageSavedMsg && (
              <Alert tone="success">Storage settings updated successfully.</Alert>
            )}
            {storageError && <Alert tone="danger">{storageError}</Alert>}

            {/* Storage Header with Add Storage Button */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[15px] font-semibold text-fg">Storage Pools & Mountpoints</h2>
                <p className="text-[11px] text-fg-subtle">
                  Managed storage pools, volume backends, and storage limits configured on this hypervisor.
                </p>
              </div>
              <div className="flex items-center gap-3">
                {loadingStorage && (
                  <span className="text-[12px] text-fg-subtle">Refreshing...</span>
                )}
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => setAddPoolOpen(true)}
                  className="gap-1.5"
                >
                  <Plus size={15} />
                  Add Storage
                </Button>
              </div>
            </div>

            {/* Grid of Square Cards for Storage Pools */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {(nodeStorage?.pools || []).map((pool) => {
                const isDefault = pool.name === 'default'
                return (
                  <div
                    key={pool.name}
                    className={`flex flex-col justify-between rounded-panel border bg-surface p-6 shadow-2xs ${
                      isDefault ? 'border-accent/40 bg-accent/[0.02]' : 'border-border'
                    }`}
                  >
                    <div>
                      {/* Card Header */}
                      <div className="flex items-center justify-between border-b border-border pb-4">
                        <div className="flex items-center gap-2">
                          <h3 className="font-mono text-[15px] font-semibold text-fg">
                            {isDefault ? 'Local (default)' : pool.name}
                          </h3>
                          {isDefault ? (
                            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-400">
                              DEFAULT
                            </span>
                          ) : (
                            <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle">
                              POOL
                            </span>
                          )}
                        </div>
                        <span
                          className={cn(
                            'rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider',
                            storageEnabled
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : 'bg-surface-2 text-fg-subtle',
                          )}
                        >
                          {storageEnabled ? 'Enabled' : 'Disabled'}\n                        </span>
                      </div>

                      {/* Card Body */}
                      <div className="mt-4 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[12px] font-medium text-fg-subtle">Enabled</span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={storageEnabled}
                            onClick={() => setStorageEnabled(!storageEnabled)}
                            className={cn(
                              'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                              storageEnabled ? 'bg-emerald-500' : 'bg-surface-2',
                            )}
                          >
                            <span
                              className={cn(
                                'pointer-events-none inline-block size-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out',
                                storageEnabled ? 'translate-x-4' : 'translate-x-0',
                              )}
                            />
                          </button>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-[12px] font-medium text-fg-subtle">Driver</span>
                          <span className="font-mono text-[12px] uppercase text-fg">
                            {pool.driver || 'dir'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-[12px] font-medium text-fg-subtle">Path</span>
                          <span
                            className="max-w-[190px] truncate font-mono text-[11px] text-fg"
                            title={pool.config?.source || '/var/lib/incus/disks/default.img'}
                          >
                            {pool.config?.source || '/var/lib/incus/disks/default.img'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-[12px] font-medium text-fg-subtle">Attached Targets</span>
                          <span className="font-mono text-[12px] text-fg">
                            {pool.used_by?.length || 0} instances/volumes
                          </span>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[12px] font-medium text-fg-subtle">Maximum Disk</span>
                          <div className="flex items-center">
                            <input
                              type="number"
                              value={storageMaxDisk}
                              onChange={(e) => setStorageMaxDisk(Number(e.target.value))}
                              className="h-8 w-24 rounded-l-control border border-r-0 border-field-border bg-field px-2 text-right font-mono text-[12px] text-fg focus:border-accent focus:outline-none"
                            />
                            <div className="flex h-8 items-center justify-center rounded-r-control border border-field-border bg-surface-2 px-2 font-mono text-[11px] font-semibold text-fg-subtle">
                              GB
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
                      {!isDefault ? (
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          onClick={() => setDeletePoolName(pool.name)}
                          className="gap-1 px-2 text-[11px]"
                        >
                          <Trash size={13} />
                          Delete Pool
                        </Button>
                      ) : (
                        <span className="text-[11px] font-medium text-fg-subtle">System Pool</span>
                      )}

                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={handleSaveStorage}
                        disabled={updatingStorage}
                      >
                        {updatingStorage ? 'Updating...' : 'Update'}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          /* Tasks Tab (VirtFusion Node Tasks List) */
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[15px] font-semibold text-fg">Node Tasks & Activity</h2>
                <p className="text-[11px] text-fg-subtle">
                  Chronological history of provisioning, rebuilds, console, and management tasks executed on this node.
                </p>
              </div>
              <div className="flex items-center gap-3">
                {loadingTasks && (
                  <span className="text-[12px] text-fg-subtle">Refreshing tasks...</span>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={loadTasksData}
                  disabled={loadingTasks}
                  className="gap-1.5"
                >
                  <ClockCounterClockwise size={14} />
                  Refresh
                </Button>
              </div>
            </div>

            <div className="overflow-hidden rounded-panel border border-border bg-surface shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-border/80 bg-surface-2/40 text-[12px] font-semibold text-fg-subtle">
                      <th className="py-3.5 pl-6 pr-4">Task</th>
                      <th className="py-3.5 px-4">Server</th>
                      <th className="py-3.5 px-4">Started</th>
                      <th className="py-3.5 px-4">Finished</th>
                      <th className="py-3.5 px-4 text-right">Duration</th>
                      <th className="py-3.5 pl-4 pr-6 text-right">Progress</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {nodeTasks.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-[13px] text-fg-subtle">
                          {loadingTasks ? 'Loading node tasks...' : 'No tasks recorded for this node yet.'}
                        </td>
                      </tr>
                    ) : (
                      nodeTasks.map((t) => {
                        const isSuccess = t.status === 'success'
                        const isFailed = t.status === 'failure' || t.status === 'failed'
                        const progressColor = isFailed
                          ? 'bg-rose-500'
                          : isSuccess
                            ? 'bg-emerald-500'
                            : 'bg-amber-500'

                        const formatDate = (iso: string | null) => {
                          if (!iso) return '—'
                          try {
                            const d = new Date(iso)
                            return d.toLocaleString('en-US', {
                              month: 'short',
                              day: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: false,
                            })
                          } catch {
                            return iso
                          }
                        }

                        return (
                          <tr
                            key={t.id}
                            className="transition-colors hover:bg-surface-2/20"
                          >
                            {/* Task Column */}
                            <td className="py-3 pl-6 pr-4">
                              <div className="flex items-center gap-2.5">
                                <span className="text-fg-subtle/80">
                                  <ListChecks size={15} />
                                </span>
                                <span className="font-medium text-fg">{t.task}</span>
                              </div>
                            </td>

                            {/* Server Column */}
                            <td className="py-3 px-4">
                              {t.serverId ? (
                                <a
                                  href={`/servers/${t.serverId}`}
                                  className="font-medium text-accent hover:underline"
                                >
                                  {t.server}
                                </a>
                              ) : (
                                <span className="text-fg-subtle">{t.server}</span>
                              )}
                            </td>

                            {/* Started */}
                            <td className="py-3 px-4 font-mono text-[12px] text-fg-subtle">
                              {formatDate(t.started)}
                            </td>

                            {/* Finished */}
                            <td className="py-3 px-4 font-mono text-[12px] text-fg-subtle">
                              {formatDate(t.finished)}
                            </td>

                            {/* Duration */}
                            <td className="py-3 px-4 text-right font-mono text-[12px] text-fg">
                              {t.durationSec} sec
                            </td>

                            {/* Progress Bar + Percentage + Status Indicator */}
                            <td className="py-3 pl-4 pr-6">
                              <div className="flex items-center justify-end gap-2.5">
                                <div className="flex w-32 items-center gap-2">
                                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                                    <div
                                      className={`h-full ${progressColor}`}
                                      style={{ width: `${Math.min(100, Math.max(5, t.progress))}%` }}
                                    />
                                  </div>
                                  <span className="w-9 text-right font-mono text-[11px] text-fg-subtle">
                                    {t.progress}%
                                  </span>
                                </div>
                                {isFailed ? (
                                  <span title="Failed">
                                    <WarningCircle size={14} className="shrink-0 text-rose-500" />
                                  </span>
                                ) : isSuccess ? (
                                  <span title="Completed">
                                    <CheckCircle size={14} className="shrink-0 text-emerald-500" />
                                  </span>
                                ) : (
                                  <span title="Running">
                                    <ClockCounterClockwise size={14} className="shrink-0 animate-spin text-amber-500" />
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
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

      {/* Add Storage Pool Dialog */}
      <Dialog open={addPoolOpen} onOpenChange={setAddPoolOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>Add Storage Pool</DialogTitle>
          <DialogDescription>
            Creates a new storage pool or attaches an existing directory/disk mountpoint.
          </DialogDescription>

          <form onSubmit={handleCreatePool} className="mt-4 flex flex-col gap-4">
            <div>
              <label className="text-[12px] font-semibold text-fg">
                Pool Name <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                required
                value={newPoolName}
                onChange={(e) => setNewPoolName(e.target.value)}
                placeholder="fast-nvme"
                className="mt-1 h-9 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[12px] text-fg focus:border-accent focus:outline-none"
              />
              <span className="mt-0.5 block text-[11px] text-fg-subtle">
                Alphanumeric identifier for this storage pool.
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[12px] font-semibold text-fg">Driver / Type</label>
                <select
                  value={newPoolDriver}
                  onChange={(e) => setNewPoolDriver(e.target.value as any)}
                  className="mt-1 h-9 w-full rounded-control border border-field-border bg-field px-3 text-[12px] text-fg focus:border-accent focus:outline-none"
                >
                  <option value="dir">dir (Directory / Mountpoint)</option>
                  <option value="btrfs">btrfs (Btrfs Subvolume/Loop)</option>
                  <option value="zfs">zfs (ZFS zpool / Dataset)</option>
                </select>
              </div>

              <div>
                <label className="text-[12px] font-semibold text-fg">Max Size (GB)</label>
                <input
                  type="number"
                  value={newPoolSizeGb}
                  onChange={(e) => setNewPoolSizeGb(Number(e.target.value))}
                  disabled={newPoolDriver === 'dir'}
                  className="mt-1 h-9 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[12px] text-fg focus:border-accent focus:outline-none disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label className="text-[12px] font-semibold text-fg">Source Path (Optional)</label>
              <input
                type="text"
                value={newPoolSource}
                onChange={(e) => setNewPoolSource(e.target.value)}
                placeholder="/mnt/nvme-drive/pool"
                className="mt-1 h-9 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[12px] text-fg focus:border-accent focus:outline-none"
              />
              <span className="mt-0.5 block text-[11px] text-fg-subtle">
                Existing directory path or block device. Leave blank for Incus default managed path.
              </span>
            </div>

            <div className="mt-2 flex items-center justify-end gap-2 border-t border-border pt-4">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setAddPoolOpen(false)}
                disabled={addingPool}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={addingPool || !newPoolName.trim()}
              >
                {addingPool ? 'Creating...' : 'Create Storage Pool'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Storage Pool Confirmation Dialog */}
      <Dialog open={Boolean(deletePoolName)} onOpenChange={(open) => !open && setDeletePoolName(null)}>
        <DialogContent className="max-w-sm">
          <DialogTitle>Delete Storage Pool</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete storage pool <span className="font-mono font-semibold text-fg">{deletePoolName}</span>? This action cannot be undone.
          </DialogDescription>

          <div className="mt-5 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setDeletePoolName(null)}
              disabled={deletingPool}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={handleDeletePool}
              disabled={deletingPool}
            >
              {deletingPool ? 'Deleting...' : 'Delete Pool'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
