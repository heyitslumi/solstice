import {
  Check,
  Copy,
  Gear,
  Info,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Trash,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useState } from 'react'

import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { api, type ApiAnnouncement } from '@/lib/api'
import { cn } from '@/lib/utils'

export function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<ApiAnnouncement[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // View modes: 'list' | 'create' | 'edit'
  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Form state
  const [type, setType] = useState('info')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [dismissible, setDismissible] = useState(false)
  const [enabledStart, setEnabledStart] = useState('')
  const [enabledEnd, setEnabledEnd] = useState('')
  const [dismissibleEnd, setDismissibleEnd] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null)

  const loadAnnouncements = useCallback(async () => {
    setLoading(true)
    const res = await api.adminListAnnouncements()
    if (res.ok && res.data) {
      setAnnouncements(res.data.announcements)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadAnnouncements()
  }, [loadAnnouncements])

  function resetForm() {
    setType('info')
    setTitle('')
    setContent('')
    setEnabled(true)
    setDismissible(false)
    setEnabledStart('')
    setEnabledEnd('')
    setDismissibleEnd('')
    setError(null)
  }

  function handleStartCreate() {
    resetForm()
    setMode('create')
    setSelectedId(null)
  }

  function handleStartEdit(ann: ApiAnnouncement) {
    setSelectedId(ann.id)
    setType(ann.type || 'info')
    setTitle(ann.title || '')
    setContent(ann.content || '')
    setEnabled(ann.enabled ?? true)
    setDismissible(ann.dismissible ?? false)
    setEnabledStart(ann.enabledStart ? ann.enabledStart.slice(0, 16) : '')
    setEnabledEnd(ann.enabledEnd ? ann.enabledEnd.slice(0, 16) : '')
    setDismissibleEnd(ann.dismissibleEnd ? ann.dismissibleEnd.slice(0, 16) : '')
    setError(null)
    setMode('edit')
  }

  async function handleSave(stayAfterSave = false) {
    if (!title.trim()) {
      setError('Title is required.')
      return
    }
    if (!content.trim()) {
      setError('Content is required.')
      return
    }

    setSaving(true)
    setError(null)

    const payload = {
      type,
      title: title.trim(),
      content: content.trim(),
      enabled,
      dismissible,
      enabledStart: enabledStart ? new Date(enabledStart).toISOString() : null,
      enabledEnd: enabledEnd ? new Date(enabledEnd).toISOString() : null,
      dismissibleEnd: dismissibleEnd ? new Date(dismissibleEnd).toISOString() : null,
    }

    try {
      if (mode === 'create') {
        const res = await api.adminCreateAnnouncement(payload)
        if (!res.ok) {
          setError(res.error?.message || 'Failed to create announcement.')
          return
        }
        setSuccessMsg('Announcement created.')
        setTimeout(() => setSuccessMsg(null), 3000)
        await loadAnnouncements()
        if (stayAfterSave && res.data?.announcement) {
          handleStartEdit(res.data.announcement)
        } else {
          setMode('list')
        }
      } else if (mode === 'edit' && selectedId) {
        const res = await api.adminUpdateAnnouncement(selectedId, payload)
        if (!res.ok) {
          setError(res.error?.message || 'Failed to update announcement.')
          return
        }
        setSuccessMsg('Announcement updated.')
        setTimeout(() => setSuccessMsg(null), 3000)
        await loadAnnouncements()
        if (!stayAfterSave) {
          setMode('list')
        }
      }
    } finally {
      setSaving(false)
    }
  }

  function promptDelete(target: { id: string; title: string }) {
    setDeleteTarget(target)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setSaving(true)
    const id = deleteTarget.id
    const res = await api.adminDeleteAnnouncement(id)
    setSaving(false)
    setDeleteTarget(null)
    if (res.ok) {
      setSuccessMsg('Announcement deleted.')
      setTimeout(() => setSuccessMsg(null), 3000)
      if (selectedId === id) {
        setMode('list')
        setSelectedId(null)
      }
      await loadAnnouncements()
    } else {
      setError(res.error?.message || 'Failed to delete announcement.')
    }
  }

  async function handleDuplicate() {
    resetForm()
    setMode('create')
    setSelectedId(null)
    setTitle(`${title} (Copy)`)
    setContent(content)
    setType(type)
    setEnabled(enabled)
    setDismissible(dismissible)
  }

  function handleCopyId(id: string) {
    navigator.clipboard.writeText(id)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const filtered = announcements.filter((a) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      a.id.toLowerCase().includes(q) ||
      a.title.toLowerCase().includes(q) ||
      a.content.toLowerCase().includes(q) ||
      a.type.toLowerCase().includes(q)
    )
  })

  return (
    <AppShell
      title="Announcements"
      description="Manage system-wide alerts, scheduled notices, and banners for all users."
    >
      <div className="flex w-full flex-col gap-6">
        {/* Banner Alert Preview when editing/creating if content provided */}
        {(mode === 'create' || mode === 'edit') && title && (
          <div className="flex flex-col gap-2 rounded-control border border-border bg-surface-2/60 p-4">
            <div className="flex items-center gap-2 text-[14px] font-semibold text-fg">
              <Info size={18} className="text-sun-500" />
              <span>{title}</span>
            </div>
            <div className="text-[13px] text-fg-subtle whitespace-pre-wrap pl-6">
              {content || 'Announcement content preview will appear here...'}
            </div>
          </div>
        )}

        {/* Header Bar */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-[28px] font-bold tracking-tight text-fg">
              {mode === 'list'
                ? 'Announcements'
                : mode === 'create'
                  ? 'Create Announcement'
                  : title || 'Update Announcement'}
            </h1>
            {mode === 'edit' && (
              <div className="flex items-center gap-1.5 pt-1 text-[13px] font-medium text-sun-500">
                <Gear size={15} />
                <span>General</span>
              </div>
            )}
          </div>

          {mode === 'list' ? (
            <div className="flex items-center gap-3">
              <div className="relative">
                <MagnifyingGlass
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
                />
                <input
                  type="text"
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 w-60 rounded-control border border-border bg-surface-2/40 pl-9 pr-3 text-[13px] text-fg placeholder:text-fg-subtle focus:border-sun-500 focus:outline-none"
                />
              </div>

              <Button
                variant="primary"
                onClick={handleStartCreate}
                className="gap-1.5 text-[13px]"
              >
                <Plus size={16} weight="bold" />
                Create
              </Button>
            </div>
          ) : (
            <Button
              variant="secondary"
              onClick={() => setMode('list')}
              className="gap-1.5 text-[13px]"
            >
              Back to List
            </Button>
          )}
        </div>

        {error && (
          <div className="rounded-control border border-danger/40 bg-danger/10 p-3 text-[13px] text-danger">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="rounded-control border border-emerald-500/40 bg-emerald-500/10 p-3 text-[13px] text-emerald-400">
            {successMsg}
          </div>
        )}

        {/* ── MODE: LIST ────────────────────────────────────────────── */}
        {mode === 'list' && (
          <div className="overflow-x-auto rounded-panel border border-border bg-surface">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-border text-[12px] font-medium text-fg-subtle uppercase tracking-wider">
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Enabled</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-fg-subtle">
                      Loading announcements...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-fg-subtle">
                      No announcements found. Click &quot;Create&quot; to add one.
                    </td>
                  </tr>
                ) : (
                  filtered.map((ann) => (
                    <tr
                      key={ann.id}
                      className="group transition-colors hover:bg-surface-2/40 cursor-pointer"
                      onClick={() => handleStartEdit(ann)}
                    >
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center gap-1.5 rounded bg-blue-950/70 px-2 py-0.5 font-mono text-[11px] text-blue-300 hover:bg-blue-900"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleCopyId(ann.id)
                          }}
                          title="Click to copy ID"
                        >
                          {ann.id}
                          {copiedId === ann.id ? (
                            <Check size={12} className="text-emerald-400" />
                          ) : (
                            <Copy size={12} className="opacity-60" />
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium capitalize text-fg">
                        {ann.type}
                      </td>
                      <td className="px-4 py-3 font-medium text-fg max-w-xs truncate">
                        {ann.title}
                      </td>
                      <td className="px-4 py-3 text-fg">
                        {ann.enabled ? 'Yes' : 'No'}
                      </td>
                      <td className="px-4 py-3 text-fg-subtle whitespace-nowrap">
                        {new Date(ann.createdAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div
                          className="flex items-center justify-end gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleStartEdit(ann)}
                            title="Edit"
                          >
                            <PencilSimple size={15} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-danger hover:text-danger"
                            onClick={() => promptDelete({ id: ann.id, title: ann.title })}
                            title="Delete"
                          >
                            <Trash size={15} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── MODE: CREATE / EDIT ───────────────────────────────────── */}
        {(mode === 'create' || mode === 'edit') && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-5 rounded-panel border border-border bg-surface p-6">
              <h2 className="text-[18px] font-semibold text-fg">
                {mode === 'create' ? 'Create Announcement' : 'Update Announcement'}
              </h2>

              {/* Row 1: Type & Title */}
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-fg">
                    Type <span className="text-danger">*</span>
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="h-10 rounded-control border border-border bg-surface-2/40 px-3 text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                  >
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="danger">Danger</option>
                    <option value="success">Success</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[12px] font-medium text-fg">
                      Title <span className="text-danger">*</span>
                    </label>
                    <span className="text-[11px] text-fg-subtle">English</span>
                  </div>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Title"
                    className="h-10 rounded-control border border-border bg-surface-2/40 px-3 text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Row 2: Content */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[12px] font-medium text-fg">
                    Content <span className="text-danger">*</span>
                  </label>
                  <span className="text-[11px] text-fg-subtle">English</span>
                </div>
                <textarea
                  rows={4}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Content"
                  className="rounded-control border border-border bg-surface-2/40 p-3 font-mono text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                />
              </div>

              {/* Row 3: Dismissible End & Enabled Start */}
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-fg">Dismissible End</label>
                  <input
                    type="datetime-local"
                    value={dismissibleEnd}
                    onChange={(e) => setDismissibleEnd(e.target.value)}
                    className="h-10 rounded-control border border-border bg-surface-2/40 px-3 text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-fg">Enabled Start</label>
                  <input
                    type="datetime-local"
                    value={enabledStart}
                    onChange={(e) => setEnabledStart(e.target.value)}
                    className="h-10 rounded-control border border-border bg-surface-2/40 px-3 text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Row 4: Enabled End */}
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-fg">Enabled End</label>
                  <input
                    type="datetime-local"
                    value={enabledEnd}
                    onChange={(e) => setEnabledEnd(e.target.value)}
                    className="h-10 rounded-control border border-border bg-surface-2/40 px-3 text-[13px] text-fg focus:border-sun-500 focus:outline-none"
                  />
                </div>

                {/* Enabled Toggle */}
                <div className="flex items-center gap-3 pt-6">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    onClick={() => setEnabled(!enabled)}
                    className={cn(
                      'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                      enabled ? 'bg-sun-500' : 'bg-surface-3',
                    )}
                  >
                    <span
                      className={cn(
                        'pointer-events-none inline-block size-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                        enabled ? 'translate-x-4' : 'translate-x-0',
                      )}
                    />
                  </button>
                  <span
                    className="text-[13px] font-medium text-fg cursor-pointer select-none"
                    onClick={() => setEnabled(!enabled)}
                  >
                    Enabled
                  </span>
                </div>
              </div>

              {/* Dismissible Toggle */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={dismissible}
                  onClick={() => setDismissible(!dismissible)}
                  className={cn(
                    'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                    dismissible ? 'bg-sun-500' : 'bg-surface-3',
                  )}
                >
                  <span
                    className={cn(
                      'pointer-events-none inline-block size-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                      dismissible ? 'translate-x-4' : 'translate-x-0',
                    )}
                  />
                </button>
                <span
                  className="text-[13px] font-medium text-fg cursor-pointer select-none"
                  onClick={() => setDismissible(!dismissible)}
                >
                  Dismissible
                </span>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                disabled={saving}
                onClick={() => handleSave(false)}
                className="gap-1.5 text-[13px]"
              >
                {saving ? 'Saving...' : 'Save'}
              </Button>

              {mode === 'create' ? (
                <Button
                  variant="secondary"
                  disabled={saving}
                  onClick={() => handleSave(true)}
                  className="gap-1.5 text-[13px]"
                >
                  Save &amp; Stay
                </Button>
              ) : (
                <>
                  <Button
                    variant="secondary"
                    disabled={saving}
                    onClick={handleDuplicate}
                    className="gap-1.5 text-[13px]"
                  >
                    Duplicate
                  </Button>
                  <Button
                    variant="danger"
                    disabled={saving}
                    onClick={() => selectedId && promptDelete({ id: selectedId, title })}
                    className="gap-1.5 text-[13px]"
                  >
                    Delete
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <Dialog
          open={!!deleteTarget}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null)
          }}
        >
          <DialogContent className="max-w-md">
            <DialogTitle>Delete Announcement</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{' '}
              <strong className="font-semibold text-fg">
                &ldquo;{deleteTarget?.title}&rdquo;
              </strong>
              ? This action cannot be undone.
            </DialogDescription>

            <div className="mt-5 flex justify-end gap-2.5">
              <Button
                type="button"
                variant="secondary"
                disabled={saving}
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={saving}
                onClick={confirmDelete}
              >
                {saving ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  )
}
