import {
  CaretRight,
  FolderSimple,
  Plus,
} from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { AppShell } from '@/components/app-shell'
import { getOsLogo, OS_LOGOS } from '@/components/os-icons'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
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
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Selected row for editing in the top form
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Top edit form fields
  const [formName, setFormName] = useState('')
  const [formLogo, setFormLogo] = useState('linux')
  const [formEnabled, setFormEnabled] = useState(true)
  const [formSaving, setFormSaving] = useState(false)

  // Modal for "Add Group"
  const [modalOpen, setModalOpen] = useState(false)
  const [modalName, setModalName] = useState('')
  const [modalDesc, setModalDesc] = useState('')
  const [modalLogo, setModalLogo] = useState('linux')
  const [modalEnabled, setModalEnabled] = useState(true)
  const [modalSaving, setModalSaving] = useState(false)

  async function loadGroups() {
    setLoading(true)
    setError(null)
    const res = await api.adminListOsGroups()
    if (res.ok) {
      const data = res.data || []
      setGroups(data)
      if (data.length > 0 && !selectedId) {
        const other = data.find((g) => g.name.toLowerCase() === 'other') || data[0]
        selectGroup(other)
      }
    } else {
      setError(res.error.message || 'Failed to load OS groups.')
    }
    setLoading(false)
  }

  function selectGroup(g: OsGroupItem) {
    setSelectedId(g.id)
    setFormName(g.name)
    setFormLogo(g.logo || 'linux')
    setFormEnabled(g.enabled !== false)
  }

  useEffect(() => {
    void loadGroups()
  }, [])

  async function handleUpdateSelected(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedId || !formName.trim()) return
    setFormSaving(true)
    setError(null)

    const res = await api.adminUpdateOsGroup(selectedId, {
      name: formName.trim(),
      logo: formLogo,
      enabled: formEnabled,
    })

    if (res.ok) {
      setSuccessMsg(`Group "${formName}" updated.`)
      await loadGroups()
    } else {
      setError(res.error.message || 'Failed to update group.')
    }
    setFormSaving(false)
    setTimeout(() => setSuccessMsg(null), 3000)
  }

  async function handleCreateModal(e: React.FormEvent) {
    e.preventDefault()
    if (!modalName.trim()) return
    setModalSaving(true)
    setError(null)

    const res = await api.adminCreateOsGroup({
      name: modalName.trim(),
      description: modalDesc.trim(),
      logo: modalLogo,
      enabled: modalEnabled,
    })

    if (res.ok) {
      setSuccessMsg(`Group "${modalName}" created.`)
      setModalOpen(false)
      setModalName('')
      setModalDesc('')
      setModalLogo('linux')
      setModalEnabled(true)
      await loadGroups()
    } else {
      setError(res.error.message || 'Failed to create group.')
    }
    setModalSaving(false)
    setTimeout(() => setSuccessMsg(null), 3000)
  }

  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === selectedId) || null,
    [groups, selectedId],
  )

  return (
    <AppShell
      title="Operating System Template Groups"
      description="Manage OS template groups and distribution categories."
    >
      <div className="flex w-full flex-col gap-6">
        {/* Header Breadcrumbs + Title + Action */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-[12px]">
              <Link to="/admin" className="font-medium text-accent-text hover:underline">
                Dashboard
              </Link>
              <CaretRight size={11} className="text-fg-subtle" />
              <span className="text-fg-subtle">Media</span>
              <CaretRight size={11} className="text-fg-subtle" />
              <span className="text-fg">Template Groups</span>
            </div>
            <h1 className="mt-1 text-[24px] font-bold tracking-tight text-fg">
              Operating System Template Groups
            </h1>
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setModalOpen(true)}
            className="gap-1.5 text-[12px]"
          >
            <Plus size={14} weight="bold" />
            Add Group
          </Button>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}
        {successMsg && <Alert tone="success">{successMsg}</Alert>}

        {/* Selected Group Editor Panel */}
        <div className="rounded-panel border border-border bg-surface p-5 shadow-2xs">
          <div className="flex items-center gap-2 border-b border-border pb-3.5">
            <FolderSimple size={16} className="text-accent-text" />
            <h2 className="text-[13px] font-bold text-fg uppercase tracking-wider">
              {selectedGroup ? `${selectedGroup.name} Group` : 'Edit Group'}
            </h2>
          </div>

          <form onSubmit={handleUpdateSelected} className="mt-4 flex flex-wrap items-end gap-4">
            <div className="min-w-[200px] flex-1">
              <label className="block text-[11px] font-semibold text-fg-subtle uppercase tracking-wider mb-1.5">
                Name
              </label>
              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Group name"
                className="h-10 w-full rounded-control border border-field-border bg-field px-3 text-[13px] text-fg focus:border-accent focus:outline-none"
              />
            </div>

            <div className="min-w-[180px] flex-1">
              <label className="block text-[11px] font-semibold text-fg-subtle uppercase tracking-wider mb-1.5">
                Collections
              </label>
              <select
                disabled
                className="h-10 w-full rounded-control border border-border bg-surface-2/40 px-3 text-[13px] text-fg-subtle focus:outline-none cursor-not-allowed"
              >
                <option value="">(None)</option>
              </select>
            </div>

            <div className="min-w-[180px] flex-1">
              <label className="block text-[11px] font-semibold text-fg-subtle uppercase tracking-wider mb-1.5">
                Logo
              </label>
              <select
                value={formLogo}
                onChange={(e) => setFormLogo(e.target.value)}
                className="h-10 w-full rounded-control border border-field-border bg-field px-3 text-[13px] text-fg focus:border-accent focus:outline-none"
              >
                {Object.entries(OS_LOGOS).map(([key, def]) => (
                  <option key={key} value={key}>
                    {def.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col justify-end">
              <label className="block text-[11px] font-semibold text-fg-subtle uppercase tracking-wider mb-2">
                Enabled
              </label>
              <button
                type="button"
                onClick={() => setFormEnabled(!formEnabled)}
                className={cn(
                  'relative h-7 w-12 rounded-full transition-colors focus:outline-none',
                  formEnabled ? 'bg-emerald-500' : 'bg-surface-2 border border-border',
                )}
                aria-pressed={formEnabled}
              >
                <span
                  className={cn(
                    'absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow-sm transition-transform',
                    formEnabled ? 'translate-x-5' : 'translate-x-0',
                  )}
                />
              </button>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <Button
                type="submit"
                variant="primary"
                disabled={formSaving || !selectedId}
                className="h-10 px-5 text-[12px]"
              >
                {formSaving ? 'Updating...' : 'Update'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!selectedId}
                className="h-10 px-4 text-[12px]"
              >
                Manage
              </Button>
            </div>
          </form>
        </div>

        {/* Template Groups List Table */}
        <div className="overflow-hidden rounded-panel border border-border bg-surface shadow-2xs">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border bg-surface-2/40 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                <th className="w-12 px-4 py-3 text-center"></th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && groups.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-12 text-center text-[13px] text-fg-subtle">
                    Loading groups...
                  </td>
                </tr>
              ) : groups.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-12 text-center text-[13px] text-fg-subtle">
                    No template groups configured.
                  </td>
                </tr>
              ) : (
                groups.map((g) => {
                  const logoDef = getOsLogo(g.logo)
                  const LogoIcon = logoDef.component
                  const isSelected = g.id === selectedId

                  return (
                    <tr
                      key={g.id}
                      onClick={() => selectGroup(g)}
                      className={cn(
                        'cursor-pointer transition-colors',
                        isSelected ? 'bg-surface-2/70' : 'hover:bg-surface-2/30',
                      )}
                    >
                      <td className="w-12 px-4 py-3.5 text-center">
                        <div
                          className={cn(
                            'size-4 rounded-full border-2 mx-auto transition-colors flex items-center justify-center',
                            isSelected
                              ? 'border-accent bg-transparent'
                              : 'border-border/80 bg-transparent',
                          )}
                        >
                          {isSelected && <div className="size-2 rounded-full bg-accent" />}
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex size-6 shrink-0 items-center justify-center">
                            <LogoIcon size={18} className={logoDef.color} />
                          </div>
                          <span
                            className={cn(
                              'text-[13px] font-semibold transition-colors',
                              isSelected ? 'text-accent-text' : 'text-fg',
                            )}
                          >
                            {g.name}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-control border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                            g.enabled
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                              : 'border-border bg-surface-2 text-fg-subtle',
                          )}
                        >
                          {g.enabled ? 'ENABLED' : 'DISABLED'}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>

          {/* Table Footer */}
          <div className="flex items-center justify-end gap-1.5 border-t border-border bg-surface-2/20 px-5 py-3">
            <button
              type="button"
              disabled
              className="flex size-7 items-center justify-center rounded-control border border-border bg-surface-2/40 text-[12px] text-fg-subtle cursor-not-allowed opacity-60"
            >
              «
            </button>
            <button
              type="button"
              className="flex size-7 items-center justify-center rounded-control bg-accent text-[12px] font-bold text-accent-fg shadow-xs"
            >
              1
            </button>
            <button
              type="button"
              disabled
              className="flex size-7 items-center justify-center rounded-control border border-border bg-surface-2/40 text-[12px] text-fg-subtle cursor-not-allowed opacity-60"
            >
              »
            </button>
          </div>
        </div>
      </div>

      {/* Add Group Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>Add OS Template Group</DialogTitle>
          <DialogDescription>
            Create a new operating system template group distribution.
          </DialogDescription>

          <form onSubmit={handleCreateModal} className="mt-4 flex flex-col gap-4">
            <div>
              <label className="text-[12px] font-semibold text-fg">
                Name <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                required
                value={modalName}
                onChange={(e) => setModalName(e.target.value)}
                placeholder="e.g. Windows, Debian, Alpine"
                className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 text-[13px] text-fg focus:border-accent focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[12px] font-semibold text-fg">Description</label>
              <textarea
                rows={2}
                value={modalDesc}
                onChange={(e) => setModalDesc(e.target.value)}
                placeholder="Optional group description..."
                className="mt-1.5 w-full rounded-control border border-field-border bg-field p-3 text-[13px] text-fg focus:border-accent focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[12px] font-semibold text-fg">Logo</label>
                <select
                  value={modalLogo}
                  onChange={(e) => setModalLogo(e.target.value)}
                  className="mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 text-[13px] text-fg focus:border-accent focus:outline-none"
                >
                  {Object.entries(OS_LOGOS).map(([key, def]) => (
                    <option key={key} value={key}>
                      {def.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[12px] font-semibold text-fg">Status</label>
                <div className="mt-1.5 flex h-10 items-center justify-between rounded-control border border-field-border bg-field px-3">
                  <span className="text-[12px] text-fg">Enabled</span>
                  <input
                    type="checkbox"
                    checked={modalEnabled}
                    onChange={(e) => setModalEnabled(e.target.checked)}
                    className="size-4 accent-accent cursor-pointer"
                  />
                </div>
              </div>
            </div>

            <div className="mt-2 flex justify-end gap-2.5 border-t border-border pt-4">
              <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={modalSaving}>
                {modalSaving ? 'Creating...' : 'Create Group'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
