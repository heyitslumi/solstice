import {
  ArrowLeft,
  Cpu,
  FloppyDisk,
  Globe,
  HardDrives,
  ShareNetwork,
} from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { AppShell } from '@/components/app-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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

  useEffect(() => {
    if (activeTab === 'network' && id && !nodeNetwork) {
      setLoadingNetwork(true)
      void api.adminGetNodeNetwork(id).then((res) => {
        if (res.ok) {
          setNodeNetwork({
            portForwardRange: res.data.portForwardRange,
            networks: res.data.networks,
          })
        }
        setLoadingNetwork(false)
      })
    }
  }, [activeTab, id, nodeNetwork])

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

        {loading ? (
          <div className="rounded-panel border border-border bg-surface p-12 text-center text-[13px] text-fg-subtle">
            Loading node details...
          </div>
        ) : activeTab === 'general' ? (
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-6 rounded-panel border border-border bg-surface p-6 shadow-2xs"
          >
            {/* Connection Information */}
            <div>
              <div className="flex items-center gap-3 border-b border-border pb-4">
                <div className="flex size-9 items-center justify-center rounded-control bg-accent/10 text-accent-text">
                  <HardDrives size={18} weight="bold" />
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-fg">Host Connection</h2>
                  <p className="text-[11px] text-fg-subtle">
                    Network FQDN and API daemon endpoints for communication.
                  </p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
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
                    className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[13px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
                  />
                  <span className="mt-1 block text-[11px] text-fg-subtle">
                    Unique identifier for this compute hypervisor.
                  </span>
                </div>

                <div>
                  <label className="text-[12px] font-semibold text-fg">
                    FQDN / Hostname <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={fqdn}
                    onChange={(e) => setFqdn(e.target.value)}
                    placeholder="node01.example.com"
                    disabled={isDefaultLocalNode}
                    className={cn(
                      'mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[13px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none',
                      isDefaultLocalNode && 'cursor-not-allowed opacity-60 bg-surface-2',
                    )}
                  />
                  <span className="mt-1 block text-[11px] text-fg-subtle">
                    Host domain name or endpoint where clients connect to services on this node.
                  </span>
                </div>

                <div>
                  <label className="text-[12px] font-semibold text-fg">Daemon IP Address</label>
                  <input
                    type="text"
                    value={ipAddress}
                    onChange={(e) => setIpAddress(e.target.value)}
                    placeholder="10.0.1.10"
                    disabled={isDefaultLocalNode}
                    className={cn(
                      'mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[13px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none',
                      isDefaultLocalNode && 'cursor-not-allowed opacity-60 bg-surface-2',
                    )}
                  />
                  <span className="mt-1 block text-[11px] text-fg-subtle">
                    {isDefaultLocalNode
                      ? 'Bound to local unix/loopback socket (read-only).'
                      : 'Internal IP address used by the panel to communicate with the daemon.'}
                  </span>
                </div>

                <div>
                  <label className="text-[12px] font-semibold text-fg">Daemon Port</label>
                  <input
                    type="number"
                    value={port}
                    onChange={(e) => setPort(Number(e.target.value))}
                    disabled={isDefaultLocalNode}
                    className={cn(
                      'mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[13px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none',
                      isDefaultLocalNode && 'cursor-not-allowed opacity-60 bg-surface-2',
                    )}
                  />
                  <span className="mt-1 block text-[11px] text-fg-subtle">
                    {isDefaultLocalNode
                      ? 'Local daemon port is fixed (read-only).'
                      : 'API daemon port (standard Incus port is 8443).'}
                  </span>
                </div>

                <div>
                  <label className="text-[12px] font-semibold text-fg">Public IPv4 Address</label>
                  <input
                    type="text"
                    value={publicIp}
                    onChange={(e) => setPublicIp(e.target.value)}
                    placeholder="203.0.113.10"
                    className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[13px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
                  />
                  <span className="mt-1 block text-[11px] text-fg-subtle">
                    Public address users connect to (e.g. for SSH port forwards).
                  </span>
                </div>

                <div>
                  <label className="text-[12px] font-semibold text-fg">Assigned Regional Location</label>
                  <select
                    value={locationId}
                    onChange={(e) => setLocationId(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 text-[13px] text-fg focus:border-accent focus:outline-none"
                  >
                    <option value="">-- No Location Assigned (Unassigned) --</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.shortCode.toUpperCase()} - {loc.name} ({loc.countryCode})
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-[11px] text-fg-subtle">
                    Physical datacenter cluster where this node operates.
                  </span>
                </div>
              </div>
            </div>

            {/* Hardware limits */}
            <div className="border-t border-border pt-6">
              <div className="flex items-center gap-3 border-b border-border pb-4">
                <div className="flex size-9 items-center justify-center rounded-control bg-accent/10 text-accent-text">
                  <Cpu size={18} weight="bold" />
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-fg">Hardware Capacity Quotas</h2>
                  <p className="text-[11px] text-fg-subtle">
                    Total assignable physical limits for container scheduling on this node.
                  </p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
                <div>
                  <label className="text-[12px] font-semibold text-fg">CPU Cores</label>
                  <input
                    type="number"
                    value={cpuCores}
                    onChange={(e) => setCpuCores(Number(e.target.value))}
                    className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[13px] text-fg focus:border-accent focus:outline-none"
                  />
                  <span className="mt-1 block text-[11px] text-fg-subtle">
                    Total available logical vCPU cores.
                  </span>
                </div>

                <div>
                  <label className="text-[12px] font-semibold text-fg">Memory (MB)</label>
                  <input
                    type="number"
                    value={memoryLimitMb}
                    onChange={(e) => setMemoryLimitMb(Number(e.target.value))}
                    className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[13px] text-fg focus:border-accent focus:outline-none"
                  />
                  <span className="mt-1 block text-[11px] text-fg-subtle">
                    {(memoryLimitMb / 1024).toFixed(1).replace(/\.0$/, '')} GB assignable RAM.
                  </span>
                </div>

                <div>
                  <label className="text-[12px] font-semibold text-fg">Disk Storage (GB)</label>
                  <input
                    type="number"
                    value={diskLimitGb}
                    onChange={(e) => setDiskLimitGb(Number(e.target.value))}
                    className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[13px] text-fg focus:border-accent focus:outline-none"
                  />
                  <span className="mt-1 block text-[11px] text-fg-subtle">
                    Total assignable root pool NVMe/SSD space.
                  </span>
                </div>
              </div>
            </div>

            {/* Flags */}
            <div className="border-t border-border pt-6">
              <div className="flex flex-col gap-4 rounded-control border border-border bg-surface-2/30 p-4">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <div className="pt-0.5">
                    <Checkbox
                      checked={isPublic}
                      onCheckedChange={(checked) => setIsPublic(checked === true)}
                    />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[13px] font-medium text-fg">Public Deployments</span>
                    <span className="text-[11px] text-fg-subtle">
                      Allow users to select this node when provisioning new servers.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <div className="pt-0.5">
                    <Checkbox
                      checked={maintenance}
                      onCheckedChange={(checked) => setMaintenance(checked === true)}
                    />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[13px] font-medium text-fg">Maintenance Mode</span>
                    <span className="text-[11px] text-fg-subtle">
                      Prevents new container creation while allowing existing instances to continue running.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Submission controls */}
            <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
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
            {/* Host Routing & Port Range Overview */}
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

            {/* Incus Managed Networks & Bridges */}
            <section className="rounded-panel border border-border bg-surface p-6 shadow-2xs">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <h2 className="text-[15px] font-semibold text-fg">Hypervisor Network Interfaces</h2>
                  <p className="text-[11px] text-fg-subtle">
                    Bridges, physical adapters, and subnet ranges managed by Incus on this host.
                  </p>
                </div>
                {loadingNetwork && (
                  <span className="text-[12px] text-fg-subtle">Loading networks...</span>
                )}
              </div>

              {loadingNetwork && !nodeNetwork ? (
                <p className="mt-4 text-[13px] text-fg-subtle">Querying node network interfaces...</p>
              ) : !nodeNetwork || nodeNetwork.networks.length === 0 ? (
                <p className="mt-4 text-[13px] text-fg-subtle">No network adapters reported by daemon.</p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-[12px]">
                    <thead>
                      <tr className="border-b border-border text-fg-subtle">
                        <th className="py-2.5 pr-4 font-medium">Interface</th>
                        <th className="py-2.5 pr-4 font-medium">Type</th>
                        <th className="py-2.5 pr-4 font-medium">IPv4 Subnet / Gateway</th>
                        <th className="py-2.5 pr-4 font-medium">IPv6 Subnet</th>
                        <th className="py-2.5 pr-4 font-medium">NAT</th>
                        <th className="py-2.5 font-medium">MTU</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nodeNetwork.networks.map((net) => (
                        <tr key={net.name} className="border-b border-border/50 last:border-0">
                          <td className="py-2.5 pr-4">
                            <span className="font-mono font-semibold text-fg">{net.name}</span>
                            {net.managed && (
                              <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] text-accent-text">
                                managed
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 pr-4 font-mono uppercase text-fg-subtle">{net.type}</td>
                          <td className="py-2.5 pr-4 font-mono text-fg">
                            {net.config?.['ipv4.address'] || '—'}
                          </td>
                          <td className="py-2.5 pr-4 font-mono text-fg-subtle">
                            {net.config?.['ipv6.address'] || '—'}
                          </td>
                          <td className="py-2.5 pr-4">
                            {net.config?.['ipv4.nat'] === 'true' ? (
                              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                                Enabled
                              </span>
                            ) : (
                              <span className="text-fg-subtle">—</span>
                            )}
                          </td>
                          <td className="py-2.5 font-mono text-fg-subtle">
                            {net.config?.['bridge.mtu'] || '1500'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </AppShell>
  )
}
