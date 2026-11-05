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
import { getOsLogo, OS_LOGOS } from '@/components/os-icons'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

interface OsGroupItem {
  id: string
  name: string
  description: string
  logo: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export function AdminTemplateGroupsPage() {
  const [groups, setGroups] = useState<OsGroupItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Dialogs
  const [modalOpen, setModalOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<OsGroupItem | null>(null)
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formLogo, setFormLogo] = useState('linux')
  const [formEnabled, setFormEnabled] = useState(true)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<OsGroupItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Selection set
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  function handleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedIds(new Set(groups.map((g) => g.id)))
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
      await api.adminDeleteOsGroup(id)
    }
    setSuccessMsg(`Deleted ${selectedIds.size} group(s).`)
    setSelectedIds(new Set())
    await loadGroups()
    setDeleting(false)
    setTimeout(() => setSuccessMsg(null), 3500)
  }

  // Miscellaneous Group (Other) settings state
  const [miscGroup, setMiscGroup] = useState<OsGroupItem | null>(null)
  const [miscName, setMiscName] = useState('Other')
  const [miscLogo, setMiscLogo] = useState('linux')
  const [miscEnabled, setMiscEnabled] = useState(true)
  const [miscSaving, setMiscSaving] = useState(false)

  async function loadGroups() {
    setLoading(true)
    setError(null)
    const res = await api.adminListOsGroups()
    if (res.ok) {
      const all = res.data || []
      const foundMisc = all.find((g) => g.name.toLowerCase() === 'other')
      if (foundMisc) {
        setMiscGroup(foundMisc)
        setMiscName(foundMisc.name)
        setMiscLogo(foundMisc.logo || 'linux')
        setMiscEnabled(foundMisc.enabled !== false)
      }
      // Don't include "Other" on the regular distribution list
      setGroups(all.filter((g) => g.name.toLowerCase() !== 'other'))
    } else {
      setError(res.error.message || 'Failed to load OS template groups.')
    }
    setLoading(false)
  }

  async function handleSaveMisc(e: React.FormEvent) {
    e.preventDefault()
    setMiscSaving(true)
    setError(null)

    const payload = {
      name: miscName.trim() || 'Other',
      logo: miscLogo,
      enabled: miscEnabled,
    }

    const res = miscGroup
      ? await api.adminUpdateOsGroup(miscGroup.id, payload)
      : await api.adminCreateOsGroup(payload)

    if (res.ok) {
      setSuccessMsg('Miscellaneous Group updated.')
      await loadGroups()
    } else {
      setError(res.error.message || 'Failed to update Miscellaneous Group.')
    }
    setMiscSaving(false)
    setTimeout(() => setSuccessMsg(null), 3500)
  }

  useEffect(() => {
    void loadGroups()
  }, [])

  function openCreate() {
    setEditingGroup(null)
    setFormName('')
    setFormDesc('')
    setFormLogo('linux')
    setFormEnabled(true)
    setModalOpen(true)
  }

  function openEdit(g: OsGroupItem) {
    setEditingGroup(g)
    setFormName(g.name)
    setFormDesc(g.description || '')
    setFormLogo(g.logo || 'linux')
    setFormEnabled(g.enabled !== false)
    setModalOpen(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!formName.trim()) return
    setSaving(true)
    setError(null)

    const payload = {
      name: formName.trim(),
      description: formDesc.trim(),
      logo: formLogo,
      enabled: formEnabled,
    }

    const res = editingGroup
      ? await api.adminUpdateOsGroup(editingGroup.id, payload)
      : await api.adminCreateOsGroup(payload)

    if (res.ok) {
      setSuccessMsg(editingGroup ? `Group "${formName}" updated.` : `Group "${formName}" created.`)
      setModalOpen(false)
      await loadGroups()
    } else {
      setError(res.error.message || 'Failed to save group.')
    }
    setSaving(false)
    setTimeout(() => setSuccessMsg(null), 3500)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const res = await api.adminDeleteOsGroup(deleteTarget.id)
    if (res.ok) {
      setSuccessMsg(`Group "${deleteTarget.name}" deleted.`)
      setDeleteTarget(null)
      await loadGroups()
    } else {
      setError(res.error.message || 'Failed to delete group.')
    }
    setDeleting(false)
    setTimeout(() => setSuccessMsg(null), 3500)
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return groups
    const q = search.toLowerCase()
    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        (g.description && g.description.toLowerCase().includes(q)),
    )
  }, [groups, search])

  return (
    <AppShell
      title="Template Groups"
      description="Manage OS template distribution families and branding."
    >
      <div className="flex w-full flex-col gap-5">
        {/* Top Control Bar matching Assets page */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-fg-subtle">
                Media
              </span>
              <span className="text-fg-subtle/50">/</span>
              <span className="text-[12px] font-medium text-fg">Template Groups</span>
            </div>
            <h1 className="mt-1 text-[28px] font-bold tracking-tight text-fg">Template Groups</h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Search Input */}
            <div className="relative">
              <MagnifyingGlass
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
              />
              <input
                type="text"
                placeholder="Search groups..."
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
              onClick={loadGroups}
              disabled={loading}
              className="gap-1.5 text-[13px]"
            >
              <ArrowClockwise size={15} className={loading ? 'animate-spin' : ''} />
              Refresh
            </Button>

            {/* Add Group Button */}
            <Button
              variant="primary"
              onClick={openCreate}
              className="gap-1.5 text-[13px]"
            >
              <Plus size={16} weight="bold" />
              Add Group
            </Button>
          </div>
        </div>

        {/* Alert Notifications */}
        {error && <Alert tone="danger">{error}</Alert>}
        {successMsg && <Alert tone="success">{successMsg}</Alert>}

        {/* Miscellaneous Group Config Row */}
        <div className="rounded-panel border border-border bg-surface p-4 shadow-2xs">
          <div className="text-[12px] font-bold uppercase tracking-wider text-fg-subtle mb-3">
            Miscellaneous Group
          </div>
          <form onSubmit={handleSaveMisc} className="flex flex-wrap items-end gap-3.5">
            <div className="min-w-[160px] flex-1">
              <label className="block text-[11px] font-semibold text-fg-subtle uppercase tracking-wider mb-1">
                Name
              </label>
              <input
                type="text"
                value={miscName}
                onChange={(e) => setMiscName(e.target.value)}
                placeholder="Other"
                className="h-9 w-full rounded-control border border-field-border bg-field px-3 text-[13px] text-fg focus:border-accent focus:outline-none"
              />
            </div>

            <div className="min-w-[150px] flex-1">
              <label className="block text-[11px] font-semibold text-fg-subtle uppercase tracking-wider mb-1">
                Collections
              </label>
              <select
                disabled
                className="h-9 w-full rounded-control border border-border bg-surface-2/40 px-3 text-[13px] text-fg-subtle focus:outline-none cursor-not-allowed"
              >
                <option value="">(None)</option>
              </select>
            </div>

            <div className="min-w-[150px] flex-1">
              <label className="block text-[11px] font-semibold text-fg-subtle uppercase tracking-wider mb-1">
                Logo
              </label>
              <select
                value={miscLogo}
                onChange={(e) => setMiscLogo(e.target.value)}
                className="h-9 w-full rounded-control border border-field-border bg-field px-3 text-[13px] text-fg focus:border-accent focus:outline-none"
              >
                {Object.entries(OS_LOGOS).map(([key, def]) => (
                  <option key={key} value={key}>
                    {def.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col justify-end">
              <label className="block text-[11px] font-semibold text-fg-subtle uppercase tracking-wider mb-1.5">
                Enabled
              </label>
              <button
                type="button"
                onClick={() => setMiscEnabled(!miscEnabled)}
                className={cn(
                  'relative h-7 w-12 rounded-full transition-colors focus:outline-none',
                  miscEnabled ? 'bg-emerald-500' : 'bg-surface-2 border border-border',
                )}
                aria-pressed={miscEnabled}
              >
                <span
                  className={cn(
                    'absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow-sm transition-transform',
                    miscEnabled ? 'translate-x-5' : 'translate-x-0',
                  )}
                />
              </button>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <Button
                type="submit"
                variant="primary"
                disabled={miscSaving}
                className="h-9 px-4 text-[12px]"
              >
                {miscSaving ? 'Updating...' : 'Update'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!miscGroup}
                className="h-9 px-3.5 text-[12px]"
              >
                Manage
              </Button>
            </div>
          </form>
        </div>

        {/* Path / Status Bar matching Assets page */}
        <div className="flex items-center justify-between rounded-control border border-border bg-surface-2/40 px-4 py-2.5 text-[13px]">
          <div className="flex items-center gap-2 font-medium text-fg-subtle">
            <span className="text-sun-500 font-semibold">template-groups</span>
            <span className="text-fg-subtle/50">/</span>
            <span className="text-[12px] text-fg-subtle">
              Showing <strong className="font-semibold text-fg">{filtered.length}</strong> of{' '}
              <strong className="font-semibold text-fg">{groups.length}</strong> distributions
            </span>
          </div>

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-[12px] text-fg-subtle font-mono">
                {selectedIds.size} selected
              </span>
              <Button
                variant="danger"
                size="sm"
                disabled={deleting}
                onClick={handleDeleteBatch}
                className="gap-1.5 text-[12px]"
              >
                <Trash size={14} />
                Delete Selected
              </Button>
            </div>
          )}
        </div>

        {/* Groups Table matching Assets table */}
        <div className="overflow-x-auto rounded-panel border border-border bg-surface shadow-2xs">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface-2/40 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                <th className="w-10 px-4 py-3">
                  <div className="flex items-center">
                    <Checkbox
                      aria-label="Select all"
                      checked={groups.length > 0 && selectedIds.size === groups.length}
                      onCheckedChange={(checked) => handleSelectAll(checked === true)}
                    />
                  </div>
                </th>
                <th className="px-4 py-3">Distribution</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Logo Key</th>
                <th className="px-4 py-3">Status</th>
                <th className="w-24 px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && groups.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-fg-subtle">
                    Loading template groups...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-fg-subtle">
                    No template groups found.
                  </td>
                </tr>
              ) : (
                filtered.map((g) => {
                  const logoDef = getOsLogo(g.logo)
                  const LogoIcon = logoDef.component
                  const isSelected = selectedIds.has(g.id)

                  return (
                    <tr
                      key={g.id}
                      className={cn(
                        'group transition-colors hover:bg-surface-2/40',
                        isSelected && 'bg-sun-500/5',
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center">
                          <Checkbox
                            aria-label={`Select ${g.name}`}
                            checked={isSelected}
                            onCheckedChange={() => handleToggleSelect(g.id)}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-control border border-border bg-surface-2">
                            <LogoIcon size={18} className={logoDef.color} />
                          </div>
                          <span className="font-semibold text-[13px] text-fg group-hover:text-accent">
                            {g.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 max-w-md">
                        <span className="text-[12px] text-fg-muted line-clamp-1">
                          {g.description || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="font-mono text-[11px] text-fg-subtle">
                          {g.logo || 'linux'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-control border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                            g.enabled
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                              : 'border-border bg-surface-2 text-fg-subtle',
                          )}
                        >
                          {g.enabled ? 'ENABLED' : 'DISABLED'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => openEdit(g)}
                            className="h-7 gap-1 px-2.5 text-[11px]"
                          >
                            <PencilSimple size={12} />
                            Edit
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setDeleteTarget(g)}
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

      {/* Create / Edit Group Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>
            {editingGroup ? `Edit Group: ${editingGroup.name}` : 'Add Template Group'}
          </DialogTitle>
          <DialogDescription>
            Configure operating system distribution family and brand icon.
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
                placeholder="e.g. Ubuntu, Debian, Alpine"
                className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 text-[13px] text-fg focus:border-accent focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[12px] font-semibold text-fg">Description</label>
              <textarea
                rows={2}
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="Distribution overview and purpose..."
                className="mt-1.5 w-full rounded-control border border-field-border bg-field p-3 text-[13px] text-fg focus:border-accent focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[12px] font-semibold text-fg">Brand Logo</label>
                <select
                  value={formLogo}
                  onChange={(e) => setFormLogo(e.target.value)}
                  className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 text-[13px] text-fg focus:border-accent focus:outline-none"
                >
                  {Object.entries(OS_LOGOS).map(([key, def]) => (
                    <option key={key} value={key}>
                      {def.label}
                    </option>
                  ))}
                </select>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[11px] text-fg-subtle">Preview:</span>
                  {(() => {
                    const PreviewLogo = getOsLogo(formLogo).component
                    return <PreviewLogo size={16} className={getOsLogo(formLogo).color} />
                  })()}
                </div>
              </div>

              <div>
                <label className="text-[12px] font-semibold text-fg">Status</label>
                <div className="mt-1.5 flex h-10 items-center justify-between rounded-control border border-field-border bg-field px-3">
                  <span className="text-[12px] text-fg">Enabled</span>
                  <input
                    type="checkbox"
                    checked={formEnabled}
                    onChange={(e) => setFormEnabled(e.target.checked)}
                    className="size-4 accent-accent cursor-pointer"
                  />
                </div>
              </div>
            </div>

            <div className="mt-2 flex justify-end gap-2.5 border-t border-border pt-4">
              <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? 'Saving...' : editingGroup ? 'Update' : 'Create Group'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Group Modal */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogTitle>Delete Template Group</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <strong className="text-fg">{deleteTarget?.name}</strong>?
          </DialogDescription>
          <div className="mt-4 flex justify-end gap-2.5">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={deleting} onClick={handleDelete}>
              {deleting ? 'Deleting...' : 'Delete Group'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
