import {
  ArrowClockwise,
  Cube,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Trash,
  X,
} from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { AppShell } from '@/components/app-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { api, type OsTemplate } from '@/lib/api'
import { cn } from '@/lib/utils'

export function AdminOsTemplatesPage() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<OsTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<OsTemplate | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function loadTemplates() {
    setLoading(true)
    setError(null)
    const res = await api.adminListOsTemplates()
    if (res.ok) {
      setTemplates(res.data || [])
    } else {
      setError(res.error.message || 'Failed to load OS templates.')
    }
    setLoading(false)
  }

  useEffect(() => {
    void loadTemplates()
  }, [])

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const res = await api.adminDeleteOsTemplate(deleteTarget.id)
    if (res.ok) {
      setSuccessMsg(`Template "${deleteTarget.name}" deleted.`)
      setDeleteTarget(null)
      await loadTemplates()
    } else {
      setError(res.error.message || 'Failed to delete template.')
    }
    setDeleting(false)
    setTimeout(() => setSuccessMsg(null), 3500)
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return templates
    const q = search.toLowerCase()
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.imageAlias.toLowerCase().includes(q) ||
        t.os.toLowerCase().includes(q) ||
        t.release.toLowerCase().includes(q),
    )
  }, [templates, search])

  return (
    <AppShell
      title="OS Templates"
      description="Curate operating system images for VPS provisioning."
    >
      <div className="flex w-full flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-fg-subtle">
                Operating Systems
              </span>
              <span className="text-fg-subtle/50">/</span>
              <span className="text-[12px] font-medium text-fg">Templates</span>
            </div>
            <h1 className="mt-1 text-[28px] font-bold tracking-tight text-fg">OS Templates</h1>
            <p className="text-[13px] text-fg-subtle">
              Choose which images users can deploy when creating a VPS.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={loadTemplates}
              disabled={loading}
              className="gap-1.5 text-[12px]"
            >
              <ArrowClockwise size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate('/admin/os-templates/new')}
              className="gap-1.5 text-[12px]"
            >
              <Plus size={14} weight="bold" />
              New Template
            </Button>
          </div>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}
        {successMsg && <Alert tone="success">{successMsg}</Alert>}

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-panel border border-border bg-surface p-4">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <MagnifyingGlass
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates..."
              className="h-9 w-full rounded-control border border-border bg-surface-2/50 pl-9 pr-8 text-[12px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
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

          <div className="text-[12px] text-fg-subtle">
            Showing <strong className="font-semibold text-fg">{filtered.length}</strong> of{' '}
            <strong className="font-semibold text-fg">{templates.length}</strong> templates
          </div>
        </div>

        <div className="overflow-x-auto rounded-panel border border-border bg-surface shadow-2xs">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface-2/40 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                <th className="px-5 py-3.5">Template</th>
                <th className="px-4 py-3.5">Image Alias</th>
                <th className="px-4 py-3.5">Arch</th>
                <th className="px-4 py-3.5">Enabled</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && templates.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-fg-subtle">
                    Loading templates...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-fg-subtle">
                    No templates found.
                  </td>
                </tr>
              ) : (
                filtered.map((t) => (
                  <tr key={t.id} className="transition-colors hover:bg-surface-2/30">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex size-8 items-center justify-center rounded-control bg-accent/10 text-accent-text">
                          <Cube size={16} weight="bold" />
                        </div>
                        <div>
                          <div className="font-semibold text-fg">{t.name}</div>
                          <div className="text-[11px] text-fg-subtle">
                            {[t.os, t.release, t.variant].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-fg">
                        {t.imageAlias}
                      </code>
                    </td>
                    <td className="px-4 py-4 font-mono text-[12px] text-fg-subtle">{t.arch}</td>
                    <td className="px-4 py-4">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-control border px-2 py-0.5 text-[11px] font-medium',
                          t.enabled
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                            : 'border-border bg-surface-2/60 text-fg-subtle',
                        )}
                      >
                        {t.enabled ? 'On' : 'Off'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => navigate(`/admin/os-templates/${t.id}/edit`)}
                          className="h-7 px-2 text-[11px] gap-1"
                        >
                          <PencilSimple size={13} />
                          Edit
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setDeleteTarget(t)}
                          className="h-7 px-2 text-[11px] gap-1"
                        >
                          <Trash size={13} />
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <DialogContent className="max-w-md">
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              Remove <strong className="text-fg">{deleteTarget?.name}</strong> (
              <span className="font-mono text-fg">{deleteTarget?.imageAlias}</span>)? Existing
              servers are unaffected.
            </DialogDescription>

            <div className="mt-5 flex justify-end gap-2.5">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button variant="danger" disabled={deleting} onClick={handleDelete}>
                {deleting ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  )
}
