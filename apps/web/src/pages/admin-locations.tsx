import {
  ArrowClockwise,
  Buildings,
  CheckCircle,
  Cpu,
  Database,
  DotsThreeVertical,
  GlobeHemisphereWest,
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
import { api, type ApiLocation } from '@/lib/api'
import { cn } from '@/lib/utils'

export function AdminLocationsPage() {
  const navigate = useNavigate()
  const [locations, setLocations] = useState<ApiLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Dialog states
  const [deleteLocation, setDeleteLocation] = useState<ApiLocation | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function loadData() {
    setLoading(true)
    setError(null)
    const res = await api.adminListLocations()
    if (res.ok) {
      const list = res.data.locations || []
      setLocations(list)
      if (list.length > 0 && !selectedLocationId) {
        setSelectedLocationId(list[0].id)
      }
    } else {
      setError(res.error.message || 'Failed to load locations.')
    }
    setLoading(false)
  }

  useEffect(() => {
    void loadData()
  }, [])

  function openCreateLocation() {
    navigate('/admin/locations/new')
  }

  function openEditLocation(loc: ApiLocation) {
    navigate(`/admin/locations/${loc.id}/edit`)
  }

  async function handleDeleteLocation() {
    if (!deleteLocation) return
    setSubmitting(true)
    const res = await api.adminDeleteLocation(deleteLocation.id)
    if (res.ok) {
      setSuccessMsg(`Location "${deleteLocation.name}" removed.`)
      setDeleteLocation(null)
      if (selectedLocationId === deleteLocation.id) {
        const remaining = locations.filter((l) => l.id !== deleteLocation.id)
        setSelectedLocationId(remaining[0]?.id || null)
      }
      await loadData()
    } else {
      setError(res.error.message || 'Failed to delete location.')
    }
    setSubmitting(false)
    setTimeout(() => setSuccessMsg(null), 3500)
  }

  const filteredLocations = useMemo(() => {
    if (!search.trim()) return locations
    const q = search.toLowerCase()
    return locations.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.shortCode.toLowerCase().includes(q) ||
        l.city.toLowerCase().includes(q) ||
        l.countryCode.toLowerCase().includes(q),
    )
  }, [locations, search])

  const selectedLocation = useMemo(() => {
    return locations.find((l) => l.id === selectedLocationId) || locations[0] || null
  }, [locations, selectedLocationId])

  // Aggregate telemetry & stats across selected location
  const locationStats = useMemo(() => {
    if (!selectedLocation?.nodes) {
      return { totalNodes: 0, healthyNodes: 0, totalCores: 0, totalRamGb: 0, totalDiskGb: 0 }
    }
    const nodes = selectedLocation.nodes
    const totalNodes = nodes.length
    const healthyNodes = nodes.filter((n) => !n.maintenance).length
    const totalCores = nodes.reduce((sum, n) => sum + (n.cpuCores || 0), 0)
    const totalRamGb = Math.round(nodes.reduce((sum, n) => sum + (n.memoryMb || 0), 0) / 1024)
    const totalDiskGb = nodes.reduce((sum, n) => sum + (n.diskGb || 0), 0)
    return { totalNodes, healthyNodes, totalCores, totalRamGb, totalDiskGb }
  }, [selectedLocation])

  return (
    <AppShell
      title="Locations"
      description="Manage geographical datacenter zones and assign infrastructure nodes."
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
              <span className="text-[12px] font-medium text-fg">Datacenter Zones</span>
            </div>
            <h1 className="mt-1 text-[28px] font-bold tracking-tight text-fg">Locations</h1>
            <p className="text-[13px] text-fg-subtle">
              Manage regions, compute zone availability, and regional infrastructure distribution.
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
              onClick={openCreateLocation}
              className="gap-1.5 text-[12px]"
            >
              <Plus size={14} weight="bold" />
              New Location
            </Button>
          </div>
        </div>

        {/* Global Overview Metrics */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="flex items-center gap-3.5 rounded-panel border border-border bg-surface p-4 shadow-2xs">
            <div className="flex size-10 items-center justify-center rounded-control bg-sun-500/10 text-sun-500">
              <MapPin size={20} weight="bold" />
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-fg-subtle">Active Regions</span>
              <span className="text-[20px] font-bold tracking-tight text-fg">
                {locations.length}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-panel border border-border bg-surface p-4 shadow-2xs">
            <div className="flex size-10 items-center justify-center rounded-control bg-blue-500/10 text-blue-500">
              <GlobeHemisphereWest size={20} weight="bold" />
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-fg-subtle">Global Compute Nodes</span>
              <span className="text-[20px] font-bold tracking-tight text-fg">
                {locations.reduce((acc, l) => acc + (l.nodeCount || 0), 0)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-panel border border-border bg-surface p-4 shadow-2xs">
            <div className="flex size-10 items-center justify-center rounded-control bg-emerald-500/10 text-emerald-500">
              <Cpu size={20} weight="bold" />
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-fg-subtle">Allocated CPU Capacity</span>
              <span className="text-[20px] font-bold tracking-tight text-fg">
                {locations.reduce(
                  (acc, l) =>
                    acc + (l.nodes?.reduce((sum, n) => sum + (n.cpuCores || 0), 0) || 0),
                  0,
                )}{' '}
                <span className="text-[13px] font-normal text-fg-subtle">cores</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-panel border border-border bg-surface p-4 shadow-2xs">
            <div className="flex size-10 items-center justify-center rounded-control bg-purple-500/10 text-purple-500">
              <Database size={20} weight="bold" />
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-fg-subtle">Total Memory Pool</span>
              <span className="text-[20px] font-bold tracking-tight text-fg">
                {Math.round(
                  locations.reduce(
                    (acc, l) =>
                      acc + (l.nodes?.reduce((sum, n) => sum + (n.memoryMb || 0), 0) || 0),
                    0,
                  ) / 1024,
                )}{' '}
                <span className="text-[13px] font-normal text-fg-subtle">GB</span>
              </span>
            </div>
          </div>
        </div>

        {/* Feedback alerts */}
        {error && <Alert tone="danger">{error}</Alert>}
        {successMsg && <Alert tone="success">{successMsg}</Alert>}

        {/* Main Split Layout: Left Region Nav & Filter (4 cols) | Right Region Detail Inspector (8 cols) */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column: Regions Browser */}
          <div className="flex flex-col gap-4 lg:col-span-5">
            {/* Search Input */}
            <div className="relative">
              <MagnifyingGlass
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search locations..."
                className="h-10 w-full rounded-control border border-border bg-surface pl-9 pr-8 text-[12px] text-fg placeholder:text-fg-subtle focus:border-sun-500 focus:outline-none shadow-2xs"
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

            {/* Locations List */}
            <div className="flex flex-col gap-2.5">
              {loading && locations.length === 0 ? (
                <div className="flex min-h-[220px] items-center justify-center rounded-panel border border-border bg-surface">
                  <span className="flex items-center gap-2 text-[13px] text-fg-subtle">
                    <ArrowClockwise size={16} className="animate-spin" />
                    Loading regions...
                  </span>
                </div>
              ) : filteredLocations.length === 0 ? (
                <div className="flex min-h-[200px] flex-col items-center justify-center rounded-panel border border-dashed border-border bg-surface p-6 text-center">
                  <MapPin size={32} className="text-fg-subtle/40 mb-2" />
                  <span className="text-[13px] font-semibold text-fg">No locations match</span>
                  <span className="text-[11px] text-fg-subtle mt-0.5">
                    Try adjusting your search criteria.
                  </span>
                </div>
              ) : (
                filteredLocations.map((loc) => {
                  const isSelected = selectedLocation?.id === loc.id
                  return (
                    <div
                      key={loc.id}
                      onClick={() => setSelectedLocationId(loc.id)}
                      className={cn(
                        'group flex cursor-pointer flex-col gap-2 rounded-panel border p-4 transition-all',
                        isSelected
                          ? 'border-sun-500 bg-surface shadow-xs ring-1 ring-sun-500/50'
                          : 'border-border bg-surface hover:border-border-strong hover:bg-surface-2/40',
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="flex size-7 items-center justify-center rounded-control bg-surface-2 border border-border font-mono text-[11px] font-bold text-fg">
                            {loc.countryCode}
                          </span>
                          <div>
                            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-sun-500">
                              {loc.shortCode}
                            </span>
                            {loc.city && (
                              <span className="ml-1.5 text-[11px] text-fg-subtle">· {loc.city}</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="rounded-control bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-fg-subtle group-hover:text-fg">
                            {loc.nodes?.length || 0} nodes
                          </span>

                          <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                              <button
                                type="button"
                                onClick={(e) => e.stopPropagation()}
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
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    openEditLocation(loc)
                                  }}
                                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[12px] text-fg hover:bg-surface-2 focus:outline-none"
                                >
                                  <PencilSimple size={14} />
                                  Edit Location
                                </DropdownMenu.Item>
                                <DropdownMenu.Separator className="my-1 h-px bg-border" />
                                <DropdownMenu.Item
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setDeleteLocation(loc)
                                  }}
                                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[12px] text-danger hover:bg-danger-surface focus:outline-none"
                                >
                                  <Trash size={14} />
                                  Delete Location
                                </DropdownMenu.Item>
                              </DropdownMenu.Content>
                            </DropdownMenu.Portal>
                          </DropdownMenu.Root>
                        </div>
                      </div>

                      <div className="mt-1">
                        <h3 className="text-[14px] font-semibold text-fg">{loc.name}</h3>
                        <p className="mt-0.5 line-clamp-1 text-[12px] text-fg-subtle">
                          {loc.description || 'No description provided.'}
                        </p>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Right Column: Detailed Region View & Node Grid */}
          <div className="lg:col-span-7">
            {selectedLocation ? (
              <div className="flex flex-col gap-6">
                {/* Region Banner Header */}
                <div className="rounded-panel border border-border bg-surface p-6 shadow-xs">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-8 items-center justify-center rounded-control bg-sun-500/15 border border-sun-500/30 font-mono text-[12px] font-bold text-sun-500">
                          {selectedLocation.countryCode}
                        </span>
                        <div>
                          <span className="font-mono text-[13px] font-bold uppercase tracking-wider text-sun-500">
                            {selectedLocation.shortCode}
                          </span>
                          <h2 className="text-[20px] font-bold text-fg">
                            {selectedLocation.name}
                          </h2>
                        </div>
                      </div>

                      <p className="mt-3 text-[13px] leading-relaxed text-fg-subtle max-w-xl">
                        {selectedLocation.description ||
                          'Primary infrastructure availability zone for compute nodes and virtual workloads.'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openEditLocation(selectedLocation)}
                        className="gap-1.5 text-[12px]"
                      >
                        <PencilSimple size={14} />
                        Edit
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setDeleteLocation(selectedLocation)}
                        className="gap-1.5 text-[12px]"
                      >
                        <Trash size={14} />
                        Delete
                      </Button>
                    </div>
                  </div>

                  {/* Metadata Chips */}
                  <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-4 text-[12px]">
                    <div className="flex items-center gap-1.5 text-fg-subtle">
                      <Buildings size={15} />
                      <span>City:</span>
                      <strong className="text-fg">{selectedLocation.city || 'Unspecified'}</strong>
                    </div>
                    <span className="text-fg-subtle/40">·</span>
                    <div className="flex items-center gap-1.5 text-fg-subtle">
                      <MapPin size={15} />
                      <span>Country:</span>
                      <strong className="text-fg">{selectedLocation.countryCode}</strong>
                    </div>
                    <span className="text-fg-subtle/40">·</span>
                    <div className="flex items-center gap-1.5 text-fg-subtle">
                      <CheckCircle size={15} className="text-emerald-500" />
                      <span>Status:</span>
                      <strong className="text-emerald-500">Operational</strong>
                    </div>
                  </div>
                </div>

                {/* Sub-metrics for this specific location */}
                <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
                  <div className="rounded-panel border border-border bg-surface p-4">
                    <span className="text-[11px] text-fg-subtle">Active Nodes</span>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="text-[18px] font-bold text-fg">
                        {locationStats.healthyNodes}
                      </span>
                      <span className="text-[11px] text-fg-subtle">/ {locationStats.totalNodes}</span>
                    </div>
                  </div>

                  <div className="rounded-panel border border-border bg-surface p-4">
                    <span className="text-[11px] text-fg-subtle">Cores Online</span>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="text-[18px] font-bold text-fg">
                        {locationStats.totalCores}
                      </span>
                      <span className="text-[11px] text-fg-subtle">vCPU</span>
                    </div>
                  </div>

                  <div className="rounded-panel border border-border bg-surface p-4">
                    <span className="text-[11px] text-fg-subtle">RAM Installed</span>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="text-[18px] font-bold text-fg">
                        {locationStats.totalRamGb}
                      </span>
                      <span className="text-[11px] text-fg-subtle">GB</span>
                    </div>
                  </div>

                  <div className="rounded-panel border border-border bg-surface p-4">
                    <span className="text-[11px] text-fg-subtle">Storage Pool</span>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="text-[18px] font-bold text-fg">
                        {locationStats.totalDiskGb}
                      </span>
                      <span className="text-[11px] text-fg-subtle">GB NVMe</span>
                    </div>
                  </div>
                </div>

                {/* Assigned Nodes Table / Grid */}
                <div className="rounded-panel border border-border bg-surface p-5 shadow-xs">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-[15px] font-bold text-fg">Assigned Compute Nodes</h3>
                      <p className="text-[12px] text-fg-subtle">
                        Physical and virtual hosts configured in this location zone.
                      </p>
                    </div>
                    <span className="font-mono text-[11px] text-fg-subtle">
                      {selectedLocation.nodes?.length || 0} registered
                    </span>
                  </div>

                  {selectedLocation.nodes && selectedLocation.nodes.length > 0 ? (
                    <div className="flex flex-col divide-y divide-border rounded-control border border-border overflow-hidden">
                      {selectedLocation.nodes.map((node) => (
                        <div
                          key={node.id}
                          className="flex flex-wrap items-center justify-between gap-4 bg-surface p-3.5 hover:bg-surface-2/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className={cn(
                                'size-2.5 rounded-full ring-2',
                                node.maintenance
                                  ? 'bg-amber-400 ring-amber-400/20'
                                  : 'bg-emerald-400 ring-emerald-400/20',
                              )}
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[13px] font-semibold text-fg">
                                  {node.name}
                                </span>
                                <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle">
                                  {node.fqdn}
                                </span>
                              </div>
                              <span className="text-[11px] text-fg-subtle font-mono">
                                IP: {node.ipAddress || '—'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-4 font-mono text-[12px] text-fg-subtle">
                            {node.cpuCores ? (
                              <div className="flex items-center gap-1">
                                <Cpu size={14} className="text-fg-subtle/80" />
                                <span>{node.cpuCores}c</span>
                              </div>
                            ) : null}

                            {node.memoryMb ? (
                              <div className="flex items-center gap-1">
                                <Database size={14} className="text-fg-subtle/80" />
                                <span>{Math.round(node.memoryMb / 1024)}GB</span>
                              </div>
                            ) : null}

                            {node.diskGb ? (
                              <div className="flex items-center gap-1">
                                <HardDrives size={14} className="text-fg-subtle/80" />
                                <span>{node.diskGb}GB</span>
                              </div>
                            ) : null}

                            <span
                              className={cn(
                                'rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                                node.maintenance
                                  ? 'bg-amber-500/10 text-amber-400'
                                  : 'bg-emerald-500/10 text-emerald-400',
                              )}
                            >
                              {node.maintenance ? 'Maintenance' : 'Active'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex min-h-[160px] flex-col items-center justify-center rounded-control border border-dashed border-border p-6 text-center">
                      <HardDrives size={28} className="text-fg-subtle/40 mb-2" />
                      <span className="text-[13px] font-semibold text-fg">
                        No nodes in this location
                      </span>
                      <p className="mt-0.5 max-w-sm text-[12px] text-fg-subtle">
                        When compute nodes are created on the Nodes page, map them to this location
                        to activate regional capacity.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex min-h-[300px] flex-col items-center justify-center rounded-panel border border-dashed border-border bg-surface p-8 text-center">
                <MapPin size={40} className="text-fg-subtle/40 mb-2" />
                <h3 className="text-[16px] font-semibold text-fg">Select a Location</h3>
                <p className="mt-1 text-[13px] text-fg-subtle">
                  Pick a regional zone from the left list to inspect capacity and attached nodes.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Delete Location Confirmation Dialog */}
        <Dialog open={!!deleteLocation} onOpenChange={(open) => !open && setDeleteLocation(null)}>
          <DialogContent className="max-w-md">
            <DialogTitle>Delete Location</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the location{' '}
              <strong className="text-fg">{deleteLocation?.name}</strong> (
              <span className="font-mono text-fg">{deleteLocation?.shortCode}</span>)? Assigned nodes
              will become unassigned and will not be deleted.
            </DialogDescription>

            <div className="mt-5 flex justify-end gap-2.5">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setDeleteLocation(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={submitting}
                onClick={handleDeleteLocation}
              >
                {submitting ? 'Deleting...' : 'Delete Location'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  )
}
