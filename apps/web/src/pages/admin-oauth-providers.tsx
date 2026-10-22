import {
  ArrowClockwise,
  CheckCircle,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  ShieldCheck,
  Trash,
  UploadSimple,
  X,
} from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { AppShell } from '@/components/app-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { api, type OAuthProvider } from '@/lib/api'
import { cn } from '@/lib/utils'

function Flag({ value, label }: { value: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-control border px-2 py-0.5 text-[11px] font-medium',
        value
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
          : 'border-border bg-surface-2/60 text-fg-subtle',
      )}
      title={label}
    >
      {value ? <CheckCircle size={12} weight="bold" /> : <X size={12} />}
      {label}
    </span>
  )
}

export function AdminOAuthProvidersPage() {
  const navigate = useNavigate()
  const [providers, setProviders] = useState<OAuthProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<OAuthProvider | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function loadProviders() {
    setLoading(true)
    setError(null)
    const res = await api.adminListOAuthProviders()
    if (res.ok) {
      setProviders(res.data || [])
    } else {
      setError(res.error.message || 'Failed to load OAuth providers.')
    }
    setLoading(false)
  }

  useEffect(() => {
    void loadProviders()
  }, [])

  async function handleImportFile(file: File) {
    if (!/\.ya?ml$/i.test(file.name) && !/\.json$/i.test(file.name)) {
      setError('Only .json, .yml or .yaml provider files can be imported.')
      return
    }
    setImporting(true)
    setError(null)
    try {
      const content = await file.text()
      const res = await api.adminImportOAuthProvider(content)
      if (res.ok) {
        navigate(`/admin/oauth-providers/${res.data.id}/edit`)
      } else {
        setError(res.error.message || 'Failed to import provider.')
      }
    } catch {
      setError('Could not read the file.')
    }
    setImporting(false)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const res = await api.adminDeleteOAuthProvider(deleteTarget.id)
    if (res.ok) {
      setSuccessMsg(`Provider "${deleteTarget.name}" deleted.`)
      setDeleteTarget(null)
      await loadProviders()
    } else {
      setError(res.error.message || 'Failed to delete provider.')
    }
    setDeleting(false)
    setTimeout(() => setSuccessMsg(null), 3500)
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return providers
    const q = search.toLowerCase()
    return providers.filter(
      (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q),
    )
  }, [providers, search])

  return (
    <AppShell
      title="OAuth Providers"
      description="Configure external OAuth2 services for login and account linking."
    >
      <div className="flex w-full flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-fg-subtle">
                Users &amp; Access
              </span>
              <span className="text-fg-subtle/50">/</span>
              <span className="text-[12px] font-medium text-fg">OAuth Providers</span>
            </div>
            <h1 className="mt-1 text-[28px] font-bold tracking-tight text-fg">OAuth Providers</h1>
            <p className="text-[13px] text-fg-subtle">
              Let users sign in and link accounts through Discord, GitHub, Google, or any
              OIDC-compliant provider.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.yml,.yaml,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) void handleImportFile(file)
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="gap-1.5 text-[12px]"
            >
              <UploadSimple size={14} />
              {importing ? 'Importing...' : 'Import'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={loadProviders}
              disabled={loading}
              className="gap-1.5 text-[12px]"
            >
              <ArrowClockwise size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate('/admin/oauth-providers/new')}
              className="gap-1.5 text-[12px]"
            >
              <Plus size={14} weight="bold" />
              New Provider
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="flex items-center gap-3.5 rounded-panel border border-border bg-surface p-4 shadow-2xs">
            <div className="flex size-10 items-center justify-center rounded-control bg-sun-500/10 text-sun-500">
              <ShieldCheck size={20} weight="bold" />
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-fg-subtle">Configured</span>
              <span className="text-[20px] font-bold tracking-tight text-fg">
                {providers.length}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-panel border border-border bg-surface p-4 shadow-2xs">
            <div className="flex size-10 items-center justify-center rounded-control bg-emerald-500/10 text-emerald-500">
              <CheckCircle size={20} weight="bold" />
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-fg-subtle">Enabled</span>
              <span className="text-[20px] font-bold tracking-tight text-fg">
                {providers.filter((p) => p.enabled).length}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-panel border border-border bg-surface p-4 shadow-2xs">
            <div className="flex size-10 items-center justify-center rounded-control bg-blue-500/10 text-blue-500">
              <ShieldCheck size={20} weight="bold" />
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-fg-subtle">Linked Accounts</span>
              <span className="text-[20px] font-bold tracking-tight text-fg">
                {providers.reduce((sum, p) => sum + (p.linkCount || 0), 0)}
              </span>
            </div>
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
              placeholder="Search providers..."
              className="h-9 w-full rounded-control border border-border bg-surface-2/50 pl-9 pr-8 text-[12px] text-fg placeholder:text-fg-subtle focus:border-sun-500 focus:outline-none"
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
            <strong className="font-semibold text-fg">{providers.length}</strong> providers
          </div>
        </div>

        <div
          onDragOver={(e) => {
            if ([...e.dataTransfer.types].includes('Files')) {
              e.preventDefault()
              setDragging(true)
            }
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            const file = e.dataTransfer.files?.[0]
            if (file) void handleImportFile(file)
          }}
          className={cn(
            'overflow-x-auto rounded-panel border bg-surface shadow-2xs transition-colors',
            dragging ? 'border-dashed border-accent' : 'border-border',
          )}
        >
          {dragging ? (
            <div className="p-8 text-center text-[13px] font-medium text-accent-text">
              Drop the .json, .yml or .yaml provider file to import it.
            </div>
          ) : null}
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface-2/40 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                <th className="px-5 py-3.5">Provider</th>
                <th className="px-4 py-3.5">Enabled</th>
                <th className="px-4 py-3.5">Login Only</th>
                <th className="px-4 py-3.5">Link Viewable</th>
                <th className="px-4 py-3.5">User Manageable</th>
                <th className="px-4 py-3.5">Links</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && providers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-fg-subtle">
                    Loading OAuth providers...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-fg-subtle">
                    No OAuth providers configured yet.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-surface-2/30">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-fg">{p.name}</div>
                      {p.description && (
                        <div className="text-[12px] text-fg-subtle">{p.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <Flag value={p.enabled} label={p.enabled ? 'Yes' : 'No'} />
                    </td>
                    <td className="px-4 py-4">
                      <Flag value={p.loginOnly} label={p.loginOnly ? 'Yes' : 'No'} />
                    </td>
                    <td className="px-4 py-4">
                      <Flag value={p.linkViewable} label={p.linkViewable ? 'Yes' : 'No'} />
                    </td>
                    <td className="px-4 py-4">
                      <Flag value={p.userManageable} label={p.userManageable ? 'Yes' : 'No'} />
                    </td>
                    <td className="px-4 py-4 font-mono text-[12px] text-fg">
                      {p.linkCount || 0}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => navigate(`/admin/oauth-providers/${p.id}/edit`)}
                          className="h-7 px-2 text-[11px] gap-1"
                        >
                          <PencilSimple size={13} />
                          Edit
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setDeleteTarget(p)}
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
            <DialogTitle>Delete Provider</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong className="text-fg">{deleteTarget?.name}</strong>?
              All {deleteTarget?.linkCount || 0} linked account(s) will be detached. This cannot be
              undone.
            </DialogDescription>

            <div className="mt-5 flex justify-end gap-2.5">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button variant="danger" disabled={deleting} onClick={handleDelete}>
                {deleting ? 'Deleting...' : 'Delete Provider'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  )
}
