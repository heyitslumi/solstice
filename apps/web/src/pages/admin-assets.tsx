import {
  ArrowSquareOut,
  Check,
  CheckCircle,
  Copy,
  DotsThree,
  DownloadSimple,
  Eye,
  FolderPlus,
  FolderSimple,
  MagnifyingGlass,
  Trash,
  UploadSimple,
} from '@phosphor-icons/react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { AppShell } from '@/components/app-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { api, type ApiAssetItem } from '@/lib/api'
import { cn } from '@/lib/utils'

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const val = bytes / Math.pow(1024, i)
  return `${val.toFixed(val >= 10 || i === 0 ? 1 : 2)} ${units[i]}`
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return iso
  }
}

export function AdminAssetsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const currentPath = searchParams.get('path') || 'assets'

  const [items, setItems] = useState<ApiAssetItem[]>([])
  const [driver, setDriver] = useState<string>('local')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())

  // Modals & actions
  const [newDirOpen, setNewDirOpen] = useState(false)
  const [newDirName, setNewDirName] = useState('')
  const [creatingDir, setCreatingDir] = useState(false)

  const [previewItem, setPreviewItem] = useState<ApiAssetItem | null>(null)
  const [deleteTargets, setDeleteTargets] = useState<ApiAssetItem[]>([])
  const [deleting, setDeleting] = useState(false)
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)

  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadAssets = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await api.adminListAssets(currentPath)
    if (res.ok) {
      setItems(res.data.items)
      setDriver(res.data.driver)
      setSelectedPaths(new Set())
    } else {
      setError(res.error.message || 'Failed to load assets.')
    }
    setLoading(false)
  }, [currentPath])

  useEffect(() => {
    loadAssets()
  }, [loadAssets])

  function navigateTo(path: string) {
    setSearchParams({ path })
  }

  // Breadcrumbs segments
  const pathSegments = currentPath.split('/').filter(Boolean)

  function handleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedPaths(new Set(items.map((i) => i.path)))
    } else {
      setSelectedPaths(new Set())
    }
  }

  function handleToggleSelect(path: string) {
    const next = new Set(selectedPaths)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    setSelectedPaths(next)
  }

  async function handleCreateDirectory(e: React.FormEvent) {
    e.preventDefault()
    if (!newDirName.trim()) return

    setCreatingDir(true)
    setError(null)
    const res = await api.adminCreateAssetDirectory(newDirName.trim(), currentPath)
    setCreatingDir(false)

    if (res.ok) {
      setNewDirOpen(false)
      setNewDirName('')
      setSuccessMsg('Directory created.')
      setTimeout(() => setSuccessMsg(null), 3000)
      await loadAssets()
    } else {
      setError(res.error.message || 'Failed to create directory.')
    }
  }

  async function handleFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return

    setUploading(true)
    setError(null)

    const formData = new FormData()
    formData.append('path', currentPath)
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i])
    }

    try {
      const res = await api.adminUploadAssets(formData)
      if (res.ok) {
        setSuccessMsg(`Uploaded ${files.length} file(s).`)
        setTimeout(() => setSuccessMsg(null), 3000)
        await loadAssets()
      } else {
        setError(res.error.message || 'Failed to upload file(s).')
      }
    } catch {
      setError('An error occurred while uploading.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function confirmDelete() {
    if (deleteTargets.length === 0) return
    setDeleting(true)
    const paths = deleteTargets.map((t) => t.path)
    const res = await api.adminDeleteAssets(paths)
    setDeleting(false)

    if (res.ok) {
      setDeleteTargets([])
      setSuccessMsg(`Deleted ${paths.length} item(s).`)
      setTimeout(() => setSuccessMsg(null), 3000)
      await loadAssets()
    } else {
      setError(res.error.message || 'Failed to delete asset(s).')
    }
  }

  function handleCopyUrl(url: string) {
    navigator.clipboard.writeText(url)
    setCopiedUrl(url)
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    copyTimeoutRef.current = setTimeout(() => setCopiedUrl(null), 3000)
  }

  const filteredItems = items.filter((item) => {
    if (!search.trim()) return true
    return item.name.toLowerCase().includes(search.toLowerCase())
  })

  return (
    <AppShell
      title="Assets"
      description={`Manage uploads, images, and public storage assets (${driver.toUpperCase()} storage).`}
    >
      <div className="flex w-full flex-col gap-5">
        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          multiple
          className="hidden"
          onChange={(e) => handleFilesSelected(e.target.files)}
        />

        {/* Top Control Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-[28px] font-bold tracking-tight text-fg">Assets</h1>

          <div className="flex items-center gap-3">
            {/* Search Input */}
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
                className="h-9 w-60 rounded-control border border-border bg-surface-2/50 pl-9 pr-3 text-[13px] text-fg placeholder:text-fg-subtle focus:border-sun-500 focus:outline-none"
              />
            </div>

            {/* New Directory Button */}
            <Button
              variant="secondary"
              onClick={() => {
                setNewDirName('')
                setNewDirOpen(true)
              }}
              className="gap-1.5 text-[13px]"
            >
              <FolderPlus size={16} />
              New Directory
            </Button>

            {/* Upload Button */}
            <Button
              variant="primary"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="gap-1.5 text-[13px]"
            >
              <UploadSimple size={16} weight="bold" />
              {uploading ? 'Uploading...' : 'Upload'}
            </Button>
          </div>
        </div>

        {/* Alert Notifications */}
        {error && <Alert tone="danger">{error}</Alert>}
        {successMsg && <Alert tone="success">{successMsg}</Alert>}

        {/* Path / Breadcrumb Bar */}
        <div className="flex items-center justify-between rounded-control border border-border bg-surface-2/40 px-4 py-2.5 text-[13px]">
          <div className="flex items-center gap-1.5 font-medium text-fg-subtle">
            <button
              type="button"
              onClick={() => navigateTo('assets')}
              className={cn(
                'rounded px-1.5 py-0.5 transition-colors hover:text-fg',
                pathSegments.length === 1 && pathSegments[0] === 'assets'
                  ? 'text-sun-500 font-semibold'
                  : 'text-fg-subtle',
              )}
            >
              assets
            </button>

            {pathSegments.slice(1).map((seg, idx) => {
              const segPath = ['assets', ...pathSegments.slice(1, idx + 2)].join('/')
              const isLast = idx === pathSegments.length - 2
              return (
                <span key={segPath} className="flex items-center gap-1.5">
                  <span className="text-fg-subtle/50">/</span>
                  <button
                    type="button"
                    onClick={() => navigateTo(segPath)}
                    className={cn(
                      'rounded px-1.5 py-0.5 transition-colors hover:text-fg',
                      isLast ? 'text-sun-500 font-semibold' : 'text-fg-subtle',
                    )}
                  >
                    {seg}
                  </button>
                </span>
              )
            })}
          </div>

          {selectedPaths.size > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-[12px] text-fg-subtle">
                {selectedPaths.size} item(s) selected
              </span>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  const targets = items.filter((i) => selectedPaths.has(i.path))
                  setDeleteTargets(targets)
                }}
                className="gap-1.5 text-[12px]"
              >
                <Trash size={14} />
                Delete Selected
              </Button>
            </div>
          )}
        </div>

        {/* Assets Table */}
        <div className="overflow-x-auto rounded-panel border border-border bg-surface">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-border text-[12px] font-medium text-fg-subtle uppercase tracking-wider">
                <th className="w-10 px-4 py-3">
                  <div className="flex items-center">
                    <Checkbox
                      aria-label="Select all"
                      checked={items.length > 0 && selectedPaths.size === items.length}
                      onCheckedChange={(checked) => handleSelectAll(checked === true)}
                    />
                  </div>
                </th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">Created</th>
                <th className="w-16 px-4 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-fg-subtle">
                    Loading assets...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-fg-subtle">
                    No files or directories found in this folder.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const isSelected = selectedPaths.has(item.path)
                  return (
                    <tr
                      key={item.path}
                      className={cn(
                        'group transition-colors hover:bg-surface-2/40',
                        isSelected && 'bg-sun-500/5',
                      )}
                    >
                      {/* Checkbox */}
                      <td className="px-4 py-3">
                        <div className="flex items-center">
                          <Checkbox
                            aria-label={`Select ${item.name}`}
                            checked={isSelected}
                            onCheckedChange={() => handleToggleSelect(item.path)}
                          />
                        </div>
                      </td>

                      {/* Name Column */}
                      <td className="px-4 py-3">
                        {item.isDir ? (
                          <div
                            className="flex items-center gap-2 font-medium text-fg hover:text-sun-500 cursor-pointer select-none"
                            onClick={() => navigateTo(item.path)}
                          >
                            <FolderSimple size={18} weight="fill" className="text-amber-400 shrink-0" />
                            <span>{item.name}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-flex items-center gap-1.5 rounded bg-blue-950/70 px-2.5 py-0.5 font-mono text-[12px] font-medium text-blue-300 hover:bg-blue-900 cursor-pointer transition-colors"
                              onClick={() => {
                                if (item.url) {
                                  const isImg = /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(item.name)
                                  if (isImg) setPreviewItem(item)
                                  else window.open(item.url, '_blank')
                                }
                              }}
                              title="Click to view or preview"
                            >
                              {item.name}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Size */}
                      <td className="px-4 py-3 text-fg-subtle font-mono text-[12px]">
                        {item.isDir ? '—' : formatBytes(item.size)}
                      </td>

                      {/* Created */}
                      <td className="px-4 py-3 text-fg-subtle whitespace-nowrap">
                        {formatDate(item.createdAt)}
                      </td>

                      {/* Action Menu (...) */}
                      <td className="px-4 py-3 text-right">
                        <DropdownMenu.Root>
                          <DropdownMenu.Trigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="size-8 p-0 text-fg-subtle hover:text-fg"
                              aria-label="Actions"
                            >
                              <DotsThree size={20} weight="bold" />
                            </Button>
                          </DropdownMenu.Trigger>

                          <DropdownMenu.Portal>
                            <DropdownMenu.Content
                              align="end"
                              className="z-50 min-w-[160px] rounded-control border border-border bg-surface p-1 shadow-lg text-[13px] animate-dialog-in"
                            >
                              {!item.isDir && item.url && (
                                <>
                                  <DropdownMenu.Item
                                    className="flex items-center gap-2 rounded px-2.5 py-1.5 text-fg hover:bg-surface-2 cursor-pointer outline-none"
                                    onClick={() => setPreviewItem(item)}
                                  >
                                    <Eye size={15} />
                                    Preview
                                  </DropdownMenu.Item>

                                  <DropdownMenu.Item
                                    className="flex items-center gap-2 rounded px-2.5 py-1.5 text-fg hover:bg-surface-2 cursor-pointer outline-none"
                                    onClick={() => handleCopyUrl(item.url)}
                                  >
                                    {copiedUrl === item.url ? (
                                      <Check size={15} className="text-emerald-400" />
                                    ) : (
                                      <Copy size={15} />
                                    )}
                                    {copiedUrl === item.url ? 'Copied!' : 'Copy URL'}
                                  </DropdownMenu.Item>

                                  <DropdownMenu.Item
                                    className="flex items-center gap-2 rounded px-2.5 py-1.5 text-fg hover:bg-surface-2 cursor-pointer outline-none"
                                    onClick={() => {
                                      const a = document.createElement('a')
                                      a.href = item.url
                                      a.download = item.name
                                      a.target = '_blank'
                                      a.click()
                                    }}
                                  >
                                    <DownloadSimple size={15} />
                                    Download
                                  </DropdownMenu.Item>

                                  <DropdownMenu.Item
                                    className="flex items-center gap-2 rounded px-2.5 py-1.5 text-fg hover:bg-surface-2 cursor-pointer outline-none"
                                    onClick={() => window.open(item.url, '_blank')}
                                  >
                                    <ArrowSquareOut size={15} />
                                    Open Link
                                  </DropdownMenu.Item>

                                  <DropdownMenu.Separator className="my-1 h-px bg-border" />
                                </>
                              )}

                              <DropdownMenu.Item
                                className="flex items-center gap-2 rounded px-2.5 py-1.5 text-danger hover:bg-danger/10 cursor-pointer outline-none"
                                onClick={() => setDeleteTargets([item])}
                              >
                                <Trash size={15} />
                                Delete
                              </DropdownMenu.Item>
                            </DropdownMenu.Content>
                          </DropdownMenu.Portal>
                        </DropdownMenu.Root>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Dialog: Create Directory */}
        <Dialog open={newDirOpen} onOpenChange={setNewDirOpen}>
          <DialogContent className="max-w-md">
            <DialogTitle>New Directory</DialogTitle>
            <DialogDescription>
              Create a new folder under{' '}
              <span className="font-mono text-fg font-semibold">{currentPath}</span>.
            </DialogDescription>

            <form onSubmit={handleCreateDirectory} className="mt-4 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-fg">Directory Name</label>
                <input
                  type="text"
                  autoFocus
                  placeholder="e.g. logos, wallpapers, banners"
                  value={newDirName}
                  onChange={(e) => setNewDirName(e.target.value)}
                  className="h-10 rounded-control border border-border bg-surface-2/50 px-3 text-[13px] text-fg placeholder:text-fg-subtle focus:border-sun-500 focus:outline-none"
                  required
                />
              </div>

              <div className="flex justify-end gap-2.5">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={creatingDir}
                  onClick={() => setNewDirOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={creatingDir || !newDirName.trim()}>
                  {creatingDir ? 'Creating...' : 'Create'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Dialog: Delete Confirmation */}
        <Dialog
          open={deleteTargets.length > 0}
          onOpenChange={(open) => {
            if (!open) setDeleteTargets([])
          }}
        >
          <DialogContent className="max-w-md">
            <DialogTitle>Delete Asset</DialogTitle>
            <DialogDescription>
              {deleteTargets.length === 1 ? (
                <>
                  Are you sure you want to delete{' '}
                  <strong className="font-semibold text-fg">
                    &ldquo;{deleteTargets[0].name}&rdquo;
                  </strong>
                  ? This action cannot be undone.
                </>
              ) : (
                <>
                  Are you sure you want to delete{' '}
                  <strong className="font-semibold text-fg">
                    {deleteTargets.length} selected items
                  </strong>
                  ? This action cannot be undone.
                </>
              )}
            </DialogDescription>

            <div className="mt-5 flex justify-end gap-2.5">
              <Button
                type="button"
                variant="secondary"
                disabled={deleting}
                onClick={() => setDeleteTargets([])}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={deleting}
                onClick={confirmDelete}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog: Image Preview */}
        <Dialog
          open={!!previewItem}
          onOpenChange={(open) => {
            if (!open) setPreviewItem(null)
          }}
        >
          <DialogContent className="max-w-2xl">
            <DialogTitle className="truncate">{previewItem?.name}</DialogTitle>
            <DialogDescription>
              Size: {previewItem ? formatBytes(previewItem.size) : ''}
            </DialogDescription>

            {previewItem?.url && (
              <div className="mt-4 flex max-h-[70vh] items-center justify-center overflow-hidden rounded-control border border-border bg-black/40 p-2">
                <img
                  src={previewItem.url}
                  alt={previewItem.name}
                  className="max-h-[60vh] max-w-full rounded object-contain"
                />
              </div>
            )}

            {copiedUrl === previewItem?.url && (
              <div className="mt-3">
                <Alert tone="success">URL copied to clipboard!</Alert>
              </div>
            )}

            <div className="mt-4 flex justify-between items-center">
              <span className="font-mono text-[11px] text-fg-subtle truncate max-w-md">
                {previewItem?.url}
              </span>
              <div className="flex gap-2">
                {previewItem?.url && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => previewItem && handleCopyUrl(previewItem.url)}
                  >
                    Copy URL
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPreviewItem(null)}
                >
                  Close
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Floating Callout */}
        {copiedUrl && (
          <div
            role="status"
            className="fixed bottom-6 right-6 z-[100] flex items-center gap-3 rounded-control border border-success/40 bg-surface px-4 py-3 shadow-2xl text-[13px] text-fg animate-scale-in"
          >
            <CheckCircle size={18} weight="fill" className="text-success shrink-0" aria-hidden />
            <div className="flex flex-col">
              <span className="font-semibold text-fg">URL copied to clipboard</span>
              <span className="font-mono text-[11px] text-fg-subtle max-w-[280px] truncate">
                {copiedUrl}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setCopiedUrl(null)}
              className="ml-2 text-fg-subtle hover:text-fg text-lg leading-none"
              aria-label="Dismiss"
            >
              &times;
            </button>
          </div>
        )}
      </div>
    </AppShell>
  )
}
