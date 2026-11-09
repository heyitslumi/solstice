import {
  ArrowClockwise,
  CloudArrowDown,
  DownloadSimple,
  Eye,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Trash,
  X,
} from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { AppShell } from '@/components/app-shell'
import { OsLogoImage } from '@/components/os-icons'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { api, type OsGroupItem, type OsTemplate } from '@/lib/api'
import { cn } from '@/lib/utils'

export function AdminTemplatesPage() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<OsTemplate[]>([])
  const [groups, setGroups] = useState<OsGroupItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all')
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Template Manager Modal State (VirtFusion style: Updates, Available, Hidden)
  const [managerOpen, setManagerOpen] = useState(false)
  const [managerTab, setManagerTab] = useState<'available' | 'updates' | 'hidden'>('available')
  const [managerArch, setManagerArch] = useState<'x86_64' | 'aarch64'>('x86_64')
  const [managerData, setManagerData] = useState<{
    available: any[]
    updates: any[]
    hidden: OsTemplate[]
    installedCount: number
  } | null>(null)
  const [, setManagerLoading] = useState(false)
  const [installingSlug, setInstallingSlug] = useState<string | null>(null)

  async function loadManagerData() {
    setManagerLoading(true)
    const res = await api.adminGetTemplateManager()
    if (res.ok) {
      setManagerData(res.data)
      if (res.data.updates.length > 0) {
        setManagerTab('updates')
      }
    }
    setManagerLoading(false)
  }

  async function handleInstallUpstream(tpl: any) {
    setInstallingSlug(tpl.slug || tpl.imageAlias)
    const res = await api.adminInstallUpstreamTemplate(tpl)
    if (res.ok) {
      setSuccessMsg(`Installed template "${tpl.name} ${tpl.version}".`)
      await Promise.all([loadData(), loadManagerData()])
    } else {
      setError(res.error.message || 'Failed to install template.')
    }
    setInstallingSlug(null)
  }

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())


  const [deleteTarget, setDeleteTarget] = useState<OsTemplate | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function loadData() {
    setLoading(true)
    setError(null)
    const [resTpl, resGrp] = await Promise.all([
      api.adminListOsTemplates(),
      api.adminListOsGroups(),
    ])

    if (resTpl.ok) {
      setTemplates(resTpl.data || [])
    } else {
      setError(resTpl.error.message || 'Failed to load templates.')
    }

    if (resGrp.ok) {
      setGroups(resGrp.data || [])
    }

    setLoading(false)
  }

  useEffect(() => {
    void loadData()
  }, [])

  function handleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedIds(new Set(templates.map((t) => t.id)))
    } else {
      setSelectedIds(new Set())
    }
  }

  function handleToggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  async function handleDeleteBatch() {
    if (selectedIds.size === 0) return
    setDeleting(true)
    for (const id of selectedIds) {
      await api.adminDeleteOsTemplate(id)
    }
    setSuccessMsg(`Deleted ${selectedIds.size} template(s).`)
    setSelectedIds(new Set())
    await loadData()
    setDeleting(false)
    setTimeout(() => setSuccessMsg(null), 3500)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const res = await api.adminDeleteOsTemplate(deleteTarget.id)
    if (res.ok) {
      setSuccessMsg(`Template "${deleteTarget.name}" deleted.`)
      setDeleteTarget(null)
      await loadData()
    } else {
      setError(res.error.message || 'Failed to delete template.')
    }
    setDeleting(false)
    setTimeout(() => setSuccessMsg(null), 3500)
  }

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (selectedGroupFilter !== 'all' && t.groupId !== selectedGroupFilter) {
        return false
      }
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return (
        t.name.toLowerCase().includes(q) ||
        (t.groupName && t.groupName.toLowerCase().includes(q)) ||
        t.imageAlias.toLowerCase().includes(q)
      )
    })
  }, [templates, search, selectedGroupFilter])

  return (
    <AppShell
      title="Operating System Templates"
      description="Manage OS container/VM templates, architectures, and cloud-init settings."
    >
      <div className="flex w-full flex-col gap-5">
        {error && <Alert tone="danger">{error}</Alert>}
        {successMsg && <Alert tone="success">{successMsg}</Alert>}

        {/* Top Control Bar matching Assets & Media pages */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-fg-subtle">
                Media
              </span>
              <span className="text-fg-subtle/50">/</span>
              <span className="text-[12px] font-medium text-fg">Templates</span>
            </div>
            <h1 className="mt-1 text-[28px] font-bold tracking-tight text-fg">
              Operating System Templates
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Filter by Group */}
            <select
              value={selectedGroupFilter}
              onChange={(e) => setSelectedGroupFilter(e.target.value)}
              className="h-9 rounded-control border border-border bg-surface-2/50 px-3 text-[13px] text-fg focus:border-sun-500 focus:outline-none"
            >
              <option value="all">All Groups</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>

            {/* Search Input */}
            <div className="relative">
              <MagnifyingGlass
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
              />
              <input
                type="text"
                placeholder="Search templates..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-60 rounded-control border border-border bg-surface-2/50 pl-9 pr-8 text-[13px] text-fg placeholder:text-fg-subtle focus:border-sun-500 focus:outline-none"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Template Manager Button matching VirtFusion */}
            <Button
              variant="secondary"
              onClick={() => {
                setManagerOpen(true)
                loadManagerData()
              }}
              className="gap-1.5 text-[13px]"
            >
              <CloudArrowDown size={15} />
              Template Manager
              {managerData && managerData.updates.length > 0 && (
                <span className="size-2 rounded-full bg-amber-500 animate-pulse" />
              )}
            </Button>

            {/* Refresh Button */}
            <Button
              variant="secondary"
              onClick={loadData}
              disabled={loading}
              className="gap-1.5 text-[13px]"
            >
              <ArrowClockwise size={15} className={loading ? 'animate-spin' : ''} />
              Refresh
            </Button>

            {/* Add Template Button */}
            <Button
              variant="primary"
              onClick={() => navigate('/admin/templates/new')}
              className="gap-1.5 text-[13px]"
            >
              <Plus size={16} weight="bold" />
              Add Template
            </Button>
          </div>
        </div>

        {/* Templates Table matching VirtFusion / Solstice Assets table */}
        <div className="overflow-x-auto rounded-panel border border-border bg-surface shadow-2xs">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface-2/40 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                <th className="w-10 px-4 py-3">
                  <div className="flex items-center">
                    <Checkbox
                      aria-label="Select all"
                      checked={templates.length > 0 && selectedIds.size === templates.length}
                      onCheckedChange={(checked) => handleSelectAll(checked === true)}
                    />
                  </div>
                </th>
                <th className="px-4 py-3">Operating System</th>
                <th className="px-4 py-3">Group</th>
                <th className="px-4 py-3">Version</th>
                <th className="px-4 py-3">Arch</th>
                <th className="px-4 py-3">Cloud-Init</th>
                <th className="px-4 py-3">Status</th>
                <th className="w-24 px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && templates.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-fg-subtle">
                    Loading templates...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-fg-subtle">
                    No operating system templates found.
                  </td>
                </tr>
              ) : (
                filtered.map((t) => {
                  const isSelected = selectedIds.has(t.id)
                  const archLabel = t.arch === 'amd64' ? 'x86_64' : t.arch

                  return (
                    <tr
                      key={t.id}
                      className={cn(
                        'group transition-colors hover:bg-surface-2/40',
                        isSelected && 'bg-sun-500/5',
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center">
                          <Checkbox
                            aria-label={`Select ${t.name}`}
                            checked={isSelected}
                            onCheckedChange={() => handleToggleSelect(t.id)}
                          />
                        </div>
                      </td>

                      {/* OS Name + Logo */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex size-7 shrink-0 items-center justify-center rounded-control border border-border bg-surface-2 p-1">
                            <OsLogoImage logoKey={t.groupLogo || t.os} size={16} />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-semibold text-[13px] text-fg group-hover:text-accent">
                              {t.name}
                            </span>
                            <span className="font-mono text-[11px] text-fg-subtle">
                              {t.imageAlias}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Group */}
                      <td className="px-4 py-3.5">
                        <span className="text-[13px] text-fg font-medium">
                          {t.groupName || '—'}
                        </span>
                      </td>

                      {/* Version */}
                      <td className="px-4 py-3.5">
                        <span className="font-mono text-[12px] text-fg-subtle">
                          {t.version || '1.00'}
                        </span>
                      </td>

                      {/* Arch */}
                      <td className="px-4 py-3.5">
                        <span className="font-mono text-[12px] text-fg">
                          {archLabel}
                        </span>
                      </td>

                      {/* Cloud-Init */}
                      <td className="px-4 py-3.5">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 text-[11px] font-semibold uppercase',
                            t.cloudInit !== false ? 'text-emerald-400' : 'text-fg-subtle',
                          )}
                        >
                          {t.cloudInit !== false ? 'YES' : 'NO'}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-control border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                            t.enabled
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                              : 'border-border bg-surface-2 text-fg-subtle',
                          )}
                        >
                          {t.enabled ? 'ENABLED' : 'DISABLED'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => navigate(`/admin/templates/${t.id}/edit`)}
                            className="h-7 gap-1 px-2.5 text-[11px]"
                          >
                            <PencilSimple size={12} />
                            Edit
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setDeleteTarget(t)}
                            className="h-7 px-2 text-[11px] text-danger hover:bg-danger/10 hover:border-danger/30"
                          >
                            <Trash size={12} />
                          </Button>
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

      {/* Template Manager Dialog (VirtFusion style: Updates, Available, Hidden) */}
      <Dialog open={managerOpen} onOpenChange={setManagerOpen}>
        <DialogContent className="max-w-3xl">
          <DialogTitle>Operating System Template Manager</DialogTitle>
          <DialogDescription>
            Browse upstream Solstice verified templates, apply cloud-init updates, and manage hidden OS options.
          </DialogDescription>

          <div className="mt-4 flex flex-col gap-4">
            {/* Top Tabs (Updates, Available, Hidden) */}
            <div className="flex items-center gap-1.5 rounded-panel border border-border bg-surface p-1">
              <button
                type="button"
                onClick={() => setManagerTab('updates')}
                className={cn(
                  'flex items-center gap-2 rounded-control px-4 py-2 text-[13px] font-medium transition-colors',
                  managerTab === 'updates'
                    ? 'bg-accent text-accent-fg font-semibold shadow-xs'
                    : 'text-fg-subtle hover:text-fg hover:bg-surface-2',
                )}
              >
                <span>Updates</span>
                {managerData && managerData.updates.length > 0 && (
                  <span className="rounded bg-rose-500/20 px-1.5 py-0.2 font-mono text-[10px] text-rose-400">
                    {managerData.updates.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setManagerTab('available')}
                className={cn(
                  'flex items-center gap-2 rounded-control px-4 py-2 text-[13px] font-medium transition-colors',
                  managerTab === 'available'
                    ? 'bg-accent text-accent-fg font-semibold shadow-xs'
                    : 'text-fg-subtle hover:text-fg hover:bg-surface-2',
                )}
              >
                <span>Available</span>
                {managerData && (
                  <span className="rounded bg-surface-2 px-1.5 py-0.2 font-mono text-[10px] text-fg-subtle">
                    {managerData.available.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setManagerTab('hidden')}
                className={cn(
                  'flex items-center gap-2 rounded-control px-4 py-2 text-[13px] font-medium transition-colors',
                  managerTab === 'hidden'
                    ? 'bg-accent text-accent-fg font-semibold shadow-xs'
                    : 'text-fg-subtle hover:text-fg hover:bg-surface-2',
                )}
              >
                <span>Hidden</span>
                {managerData && managerData.hidden.length > 0 && (
                  <span className="rounded bg-surface-2 px-1.5 py-0.2 font-mono text-[10px] text-fg-subtle">
                    {managerData.hidden.length}
                  </span>
                )}
              </button>
            </div>

            {/* Tab: Updates */}
            {managerTab === 'updates' && (
              <div className="flex flex-col gap-4">
                <div className="rounded-control border border-amber-500/30 bg-amber-500/10 p-4 text-[13px] leading-relaxed text-amber-200">
                  <p className="font-semibold text-amber-300">
                    Updates may overwrite a template's cloud-init settings.
                  </p>
                  <p className="mt-0.5 text-[12px] text-amber-200/80">
                    Backup the current cloud-init configuration before updating.
                  </p>
                </div>

                {managerData?.updates.length === 0 ? (
                  <div className="py-12 text-center text-[13px] text-fg-subtle border border-dashed border-border rounded-panel">
                    No updates found. All installed templates are on the latest Solstice revision.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-panel border border-border bg-surface">
                    <table className="w-full text-left text-[13px]">
                      <thead>
                        <tr className="border-b border-border bg-surface-2/40 text-[11px] font-semibold uppercase text-fg-subtle">
                          <th className="px-4 py-2.5">Template</th>
                          <th className="px-3 py-2.5">Arch</th>
                          <th className="px-3 py-2.5">Version</th>
                          <th className="px-3 py-2.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {managerData?.updates.map((u: any) => (
                          <tr key={u.installed.id} className="hover:bg-surface-2/30">
                            <td className="px-4 py-3 font-medium text-fg">{u.installed.name} ({u.installed.version})</td>
                            <td className="px-3 py-3 font-mono text-xs text-fg-subtle">{u.installed.arch}</td>
                            <td className="px-3 py-3 font-mono text-xs text-amber-400">
                              {u.installed.templateVersion || '1.00'} → {u.upstream.templateVersion}
                            </td>
                            <td className="px-3 py-3 text-right">
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => handleInstallUpstream(u.upstream)}
                                disabled={installingSlug === u.upstream.slug}
                              >
                                {installingSlug === u.upstream.slug ? 'Updating...' : 'Update'}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Tab: Available */}
            {managerTab === 'available' && (
              <div className="flex flex-col gap-4">
                {/* Architecture Filter Switcher */}
                <div className="flex items-center gap-1.5 rounded-panel border border-border bg-surface p-1 self-start">
                  <button
                    type="button"
                    onClick={() => setManagerArch('x86_64')}
                    className={cn(
                      'rounded-control px-3 py-1.5 text-[12px] font-medium transition-colors',
                      managerArch === 'x86_64'
                        ? 'bg-accent text-accent-fg font-semibold shadow-xs'
                        : 'text-fg-subtle hover:text-fg hover:bg-surface-2',
                    )}
                  >
                    x86_64 (64-bit Intel/AMD)
                  </button>
                  <button
                    type="button"
                    onClick={() => setManagerArch('aarch64')}
                    className={cn(
                      'rounded-control px-3 py-1.5 text-[12px] font-medium transition-colors',
                      managerArch === 'aarch64'
                        ? 'bg-accent text-accent-fg font-semibold shadow-xs'
                        : 'text-fg-subtle hover:text-fg hover:bg-surface-2',
                    )}
                  >
                    AArch64 (64-bit Arm)
                  </button>
                </div>

                {/* Templates List */}
                <div className="max-h-[50vh] overflow-y-auto rounded-panel border border-border bg-surface divide-y divide-border/60">
                  {managerData?.available
                    .filter((tpl) => {
                      const arch = tpl.arch === 'amd64' ? 'x86_64' : tpl.arch
                      return managerArch === 'x86_64' ? arch === 'x86_64' : arch === 'arm64' || arch === 'aarch64'
                    })
                    .map((tpl) => (
                      <div key={tpl.slug} className="flex items-center justify-between p-4 hover:bg-surface-2/20">
                        <div className="flex items-center gap-3.5">
                          <OsLogoImage logoKey={tpl.os || tpl.name} size={22} className="shrink-0" />
                          <div>
                            <p className="font-semibold text-[13px] text-fg">{tpl.name} {tpl.version}</p>
                            <p className="font-mono text-[11px] text-fg-subtle">{tpl.imageAlias}</p>
                          </div>
                        </div>

                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleInstallUpstream(tpl)}
                          disabled={installingSlug === tpl.slug}
                          className="gap-1.5 text-[12px]"
                        >
                          <DownloadSimple size={14} />
                          {installingSlug === tpl.slug ? 'Installing...' : 'Install'}
                        </Button>
                      </div>
                    ))}
                  {managerData?.available.length === 0 && (
                    <div className="p-8 text-center text-xs text-fg-subtle">
                      All upstream templates are already installed.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab: Hidden */}
            {managerTab === 'hidden' && (
              <div className="flex flex-col gap-4">
                {managerData?.hidden.length === 0 ? (
                  <div className="p-12 text-center text-[13px] text-fg-subtle border border-dashed border-border rounded-panel">
                    No hidden templates. All installed templates are currently enabled for end users.
                  </div>
                ) : (
                  <div className="max-h-[50vh] overflow-y-auto rounded-panel border border-border bg-surface divide-y divide-border/60">
                    {managerData?.hidden.map((t) => (
                      <div key={t.id} className="flex items-center justify-between p-4 hover:bg-surface-2/20">
                        <div className="flex items-center gap-3.5">
                          <OsLogoImage logoKey={t.groupLogo || t.os || t.name} size={22} className="shrink-0 opacity-60" />
                          <div>
                            <p className="font-semibold text-[13px] text-fg">{t.name} {t.version}</p>
                            <p className="font-mono text-[11px] text-fg-subtle">{t.imageAlias}</p>
                          </div>
                        </div>

                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={async () => {
                            await api.adminUpdateOsTemplate(t.id, { enabled: true })
                            await Promise.all([loadData(), loadManagerData()])
                          }}
                          className="gap-1.5 text-[12px]"
                        >
                          <Eye size={14} />
                          Unhide
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogTitle>Delete Template</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <strong className="text-fg">{deleteTarget?.name}</strong>?
          </DialogDescription>
          <div className="mt-4 flex justify-end gap-2.5">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={deleting} onClick={handleDelete}>
              {deleting ? 'Deleting...' : 'Delete Template'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Floating Batch Selection Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 flex items-center gap-4 rounded-panel border border-border bg-surface/95 px-5 py-3 shadow-2xl backdrop-blur-md animate-[float-bar-in_0.22s_cubic-bezier(0.16,1,0.3,1)_both]">
          <div className="flex items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded-full bg-sun-500/20 text-[11px] font-bold text-sun-500">
              {selectedIds.size}
            </span>
            <span className="text-[13px] font-medium text-fg">
              template{selectedIds.size > 1 ? 's' : ''} selected
            </span>
          </div>

          <div className="h-4 w-px bg-border" />

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
              className="h-8 px-3 text-[12px]"
            >
              Deselect
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={deleting}
              onClick={handleDeleteBatch}
              className="h-8 gap-1.5 px-3.5 text-[12px]"
            >
              <Trash size={14} />
              {deleting ? 'Deleting...' : `Delete Selected (${selectedIds.size})`}
            </Button>
          </div>
        </div>
      )}
    </AppShell>
  )
}
