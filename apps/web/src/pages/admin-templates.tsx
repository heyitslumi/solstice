import {
  ArrowClockwise,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Trash,
  X,
} from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'

import { AppShell } from '@/components/app-shell'
import { OsLogoImage } from '@/components/os-icons'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { api, type OsGroupItem, type OsTemplate } from '@/lib/api'
import { cn } from '@/lib/utils'

export function AdminTemplatesPage() {
  const [templates, setTemplates] = useState<OsTemplate[]>([])
  const [groups, setGroups] = useState<OsGroupItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all')
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<OsTemplate | null>(null)
  const [formName, setFormName] = useState('')
  const [formGroupId, setFormGroupId] = useState<string>('')
  const [formVersion, setFormVersion] = useState('1.00')
  const [formArch, setFormArch] = useState('x86_64')
  const [formImageAlias, setFormImageAlias] = useState('')
  const [formCloudInit, setFormCloudInit] = useState(true)
  const [formEnabled, setFormEnabled] = useState(true)
  const [saving, setSaving] = useState(false)

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

  function openCreate() {
    setEditingTemplate(null)
    setFormName('')
    setFormGroupId(groups[0]?.id || '')
    setFormVersion('1.00')
    setFormArch('x86_64')
    setFormImageAlias('')
    setFormCloudInit(true)
    setFormEnabled(true)
    setModalOpen(true)
  }

  function openEdit(t: OsTemplate) {
    setEditingTemplate(t)
    setFormName(t.name)
    setFormGroupId(t.groupId || '')
    setFormVersion(t.version || '1.00')
    setFormArch(t.arch === 'amd64' ? 'x86_64' : t.arch || 'x86_64')
    setFormImageAlias(t.imageAlias)
    setFormCloudInit(t.cloudInit !== false)
    setFormEnabled(t.enabled !== false)
    setModalOpen(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!formName.trim() || !formImageAlias.trim()) return
    setSaving(true)
    setError(null)

    const payload = {
      name: formName.trim(),
      groupId: formGroupId || null,
      version: formVersion.trim() || '1.00',
      arch: formArch === 'x86_64' ? 'amd64' : formArch,
      imageAlias: formImageAlias.trim(),
      cloudInit: formCloudInit,
      enabled: formEnabled,
    }

    const res = editingTemplate
      ? await api.adminUpdateOsTemplate(editingTemplate.id, payload)
      : await api.adminCreateOsTemplate(payload)

    if (res.ok) {
      setSuccessMsg(
        editingTemplate
          ? `Template "${formName}" updated.`
          : `Template "${formName}" added.`,
      )
      setModalOpen(false)
      await loadData()
    } else {
      setError(res.error.message || 'Failed to save template.')
    }
    setSaving(false)
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
              onClick={openCreate}
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
                            onClick={() => openEdit(t)}
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

      {/* Create / Edit Template Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>
            {editingTemplate ? `Edit Template: ${editingTemplate.name}` : 'Add OS Template'}
          </DialogTitle>
          <DialogDescription>
            Configure template distribution image, group, version, and architecture.
          </DialogDescription>

          <form onSubmit={handleSave} className="mt-4 flex flex-col gap-4">
            <div>
              <label className="text-[12px] font-semibold text-fg">
                Name <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Ubuntu 24.04 LTS, Debian 12"
                className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 text-[13px] text-fg focus:border-accent focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[12px] font-semibold text-fg">Template Group</label>
                <select
                  value={formGroupId}
                  onChange={(e) => setFormGroupId(e.target.value)}
                  className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 text-[13px] text-fg focus:border-accent focus:outline-none"
                >
                  <option value="">(None)</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[12px] font-semibold text-fg">Version</label>
                <input
                  type="text"
                  value={formVersion}
                  onChange={(e) => setFormVersion(e.target.value)}
                  placeholder="1.00"
                  className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 text-[13px] text-fg focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[12px] font-semibold text-fg">Architecture</label>
                <select
                  value={formArch}
                  onChange={(e) => setFormArch(e.target.value)}
                  className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 text-[13px] text-fg focus:border-accent focus:outline-none"
                >
                  <option value="x86_64">x86_64</option>
                  <option value="arm64">arm64 (aarch64)</option>
                </select>
              </div>

              <div>
                <label className="text-[12px] font-semibold text-fg">Cloud-Init</label>
                <div className="mt-1.5 flex h-10 items-center justify-between rounded-control border border-field-border bg-field px-3">
                  <span className="text-[12px] text-fg">Support</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={formCloudInit}
                    onClick={() => setFormCloudInit(!formCloudInit)}
                    className={cn(
                      'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                      formCloudInit ? 'bg-sun-500' : 'bg-surface-3',
                    )}
                  >
                    <span
                      className={cn(
                        'pointer-events-none inline-block size-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                        formCloudInit ? 'translate-x-4' : 'translate-x-0',
                      )}
                    />
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="text-[12px] font-semibold text-fg">
                Image Alias <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                required
                value={formImageAlias}
                onChange={(e) => setFormImageAlias(e.target.value)}
                placeholder="e.g. ubuntu/noble/cloud or debian/12/cloud"
                className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[13px] text-fg focus:border-accent focus:outline-none"
              />
              <span className="mt-1 block text-[11px] text-fg-subtle">
                LinuxContainers or Incus remote image alias name.
              </span>
            </div>

            <div>
              <label className="text-[12px] font-semibold text-fg">Status</label>
              <div className="mt-1.5 flex h-10 items-center justify-between rounded-control border border-field-border bg-field px-3">
                <span className="text-[12px] text-fg">Enabled</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={formEnabled}
                  onClick={() => setFormEnabled(!formEnabled)}
                  className={cn(
                    'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                    formEnabled ? 'bg-sun-500' : 'bg-surface-3',
                  )}
                >
                  <span
                    className={cn(
                      'pointer-events-none inline-block size-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                      formEnabled ? 'translate-x-4' : 'translate-x-0',
                    )}
                  />
                </button>
              </div>
            </div>

            <div className="mt-2 flex justify-end gap-2.5 border-t border-border pt-4">
              <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? 'Saving...' : editingTemplate ? 'Update Template' : 'Add Template'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Modal */}
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
