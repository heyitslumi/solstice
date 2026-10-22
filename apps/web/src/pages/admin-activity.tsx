import {
  ArrowClockwise,
  CaretLeft,
  CaretRight,
  Info,
  MagnifyingGlass,
  X,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { AppShell } from '@/components/app-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { api, type ActivityEntry } from '@/lib/api'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 25

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(diffMs)) return iso
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function pageWindow(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages = new Set<number>([1, 2, current - 1, current, current + 1, total - 1, total])
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
  const out: (number | '…')[] = []
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push('…')
    out.push(sorted[i])
  }
  return out
}

export function AdminActivityPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [activities, setActivities] = useState<ActivityEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')
  const [userId, setUserId] = useState<string | null>(searchParams.get('userId'))
  const [userName, setUserName] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [infoEntry, setInfoEntry] = useState<ActivityEntry | null>(null)

  const load = useCallback(async (q: string, uid: string | null, p: number) => {
    setLoading(true)
    setError(null)
    const res = await api.adminListActivity({
      q,
      userId: uid ?? undefined,
      limit: PAGE_SIZE,
      offset: (p - 1) * PAGE_SIZE,
    })
    if (res.ok) {
      setActivities(res.data.activities || [])
      setTotal(res.data.total || 0)
    } else {
      setError(res.error.message || 'Failed to load activity.')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load(query, userId, page)
  }, [query, userId, page, load])

  // Debounce the search box.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(searchInput.trim())
      setPage(1)
    }, 350)
    return () => clearTimeout(timer)
  }, [searchInput])

  function filterToUser(entry: ActivityEntry) {
    if (!entry.user) return
    setUserId(entry.user.id)
    setUserName(entry.user.name)
    setPage(1)
    setSearchParams(entry.user.id ? { userId: entry.user.id } : {}, { replace: true })
  }

  function clearUserFilter() {
    setUserId(null)
    setUserName(null)
    setPage(1)
    setSearchParams({}, { replace: true })
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const to = Math.min(page * PAGE_SIZE, total)

  return (
    <AppShell
      title="Activity"
      description="Audit log of every action taken across the panel."
    >
      <div className="flex w-full flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-bold tracking-tight text-fg">Activity</h1>
          </div>
          <div className="relative w-full max-w-xs">
            <MagnifyingGlass
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
            />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search..."
              className="h-9 w-full rounded-control border border-border bg-surface pl-9 pr-8 text-[12px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}

        {userId && (
          <div className="flex items-center gap-2 text-[12px] text-fg-subtle">
            <span>
              Filtered to <strong className="text-fg">{userName ?? 'user'}</strong>
            </span>
            <Button variant="secondary" size="sm" onClick={clearUserFilter} className="h-6 px-2 text-[11px]">
              <X size={12} />
              Clear
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 text-[12px] text-fg-subtle">
          <span>
            Showing <strong className="text-fg">{from}</strong> to{' '}
            <strong className="text-fg">{to}</strong> of{' '}
            <strong className="text-fg">{total}</strong> result{total === 1 ? '' : 's'}.
          </span>

          <div className="flex items-center gap-1">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-7 w-7 p-0"
              aria-label="Previous page"
            >
              <CaretLeft size={14} />
            </Button>
            {pageWindow(page, totalPages).map((p, i) =>
              p === '…' ? (
                <span key={`gap-${i}`} className="px-1 text-fg-subtle">
                  …
                </span>
              ) : (
                <Button
                  key={p}
                  variant={p === page ? 'primary' : 'secondary'}
                  size="sm"
                  disabled={loading}
                  onClick={() => setPage(p)}
                  className="h-7 min-w-7 px-1.5 text-[12px]"
                >
                  {p}
                </Button>
              ),
            )}
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-7 w-7 p-0"
              aria-label="Next page"
            >
              <CaretRight size={14} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={loading}
              onClick={() => void load(query, userId, page)}
              className="ml-1 h-7 w-7 p-0"
              aria-label="Refresh"
            >
              <ArrowClockwise size={14} className={loading ? 'animate-spin' : ''} />
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-panel border border-border bg-surface shadow-2xs">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-border text-[12px] font-medium text-fg-subtle">
                <th className="w-10 px-4 py-3"></th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">IP</th>
                <th className="px-4 py-3">When</th>
                <th className="w-14 px-4 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && activities.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-fg-subtle">
                    Loading activity...
                  </td>
                </tr>
              ) : activities.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-fg-subtle">
                    No activity found.
                  </td>
                </tr>
              ) : (
                activities.map((entry) => (
                  <tr key={entry.id} className="transition-colors hover:bg-surface-2/30">
                    <td className="px-4 py-3">
                      {entry.user?.avatarUrl ? (
                        <img
                          src={entry.user.avatarUrl}
                          alt=""
                          className="size-7 rounded-full border border-border object-cover"
                        />
                      ) : (
                        <div className="flex size-7 items-center justify-center rounded-full bg-accent/15 text-[11px] font-bold text-accent-text">
                          {(entry.user?.name || '?').slice(0, 1).toUpperCase()}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {entry.user ? (
                        <button
                          type="button"
                          onClick={() => filterToUser(entry)}
                          title={`Show only activity from ${entry.user.name}`}
                          className="font-medium text-accent-text hover:underline"
                        >
                          {entry.user.name}
                        </button>
                      ) : (
                        <span className="text-fg-subtle">Deleted user</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-fg">
                        {entry.action}
                      </code>
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] text-fg-subtle">
                      {entry.ipAddress || '—'}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-fg-subtle">
                      {timeAgo(entry.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setInfoEntry(entry)}
                        className={cn('h-7 w-7 p-0')}
                        aria-label={`Details for ${entry.action}`}
                      >
                        <Info size={14} />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Dialog open={!!infoEntry} onOpenChange={(open) => !open && setInfoEntry(null)}>
          <DialogContent className="max-w-md">
            <DialogTitle>Activity Details</DialogTitle>
            <DialogDescription>
              Full record of this audit log entry.
            </DialogDescription>

            {infoEntry && (
              <dl className="mt-4 flex flex-col gap-3 text-[13px]">
                <div className="flex justify-between gap-4">
                  <dt className="text-fg-subtle">Actor</dt>
                  <dd className="font-medium text-fg">
                    {infoEntry.user ? `${infoEntry.user.name} (${infoEntry.user.email})` : 'Deleted user'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-fg-subtle">Event</dt>
                  <dd className="font-mono text-[12px] text-fg">{infoEntry.action}</dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="text-fg-subtle">Details</dt>
                  <dd className="rounded-control border border-border bg-surface-2/40 px-3 py-2 text-fg">
                    {infoEntry.details}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-fg-subtle">IP</dt>
                  <dd className="font-mono text-[12px] text-fg">{infoEntry.ipAddress || '—'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-fg-subtle">When</dt>
                  <dd className="font-mono text-[12px] text-fg">
                    {new Date(infoEntry.createdAt).toLocaleString()}
                  </dd>
                </div>
              </dl>
            )}

            <div className="mt-5 flex justify-end gap-2.5">
              {infoEntry?.user && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (infoEntry) filterToUser(infoEntry)
                    setInfoEntry(null)
                  }}
                >
                  Filter to this user
                </Button>
              )}
              <Button variant="primary" onClick={() => setInfoEntry(null)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  )
}
