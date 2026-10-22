import { ArrowClockwise, ChartLineUp } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { AppShell } from '@/components/app-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

interface UsagePoint {
  t: string
  cpu: number | null
  ram: number
  disk: number | null
  rx: number
  tx: number
}

type MetricKey = 'cpu' | 'ram' | 'disk' | 'rx' | 'tx'

interface UsageServer {
  id: string
  name: string
  points: UsagePoint[]
}

const RANGES = [
  { hours: 1, label: '1H' },
  { hours: 24, label: '24H' },
  { hours: 168, label: '7D' },
]

function Chart({
  points,
  series,
  height = 160,
  unit,
  title,
}: {
  points: UsagePoint[]
  series: Array<{ key: MetricKey; color: string; label: string }>
  height?: number
  unit: string
  title: string
}) {
  const W = 720
  const H = 200
  const PAD = 8

  const max = useMemo(() => {
    let m = 0
    for (const p of points) {
      for (const s of series) {
        const raw = p[s.key]
        if (raw === null) continue
        const v = s.key === 'rx' || s.key === 'tx' ? raw / 60 / 1024 : raw
        if (v > m) m = v
      }
    }
    return Math.max(m * 1.15, unit === '%' ? 10 : 1)
  }, [points, series, unit])

  function valueOf(p: UsagePoint, key: MetricKey): number | null {
    const raw = p[key]
    if (raw === null) return null
    return key === 'rx' || key === 'tx' ? raw / 60 / 1024 : raw
  }

  // One sub-path per run of known values so gaps stay gaps.
  function segmentsFor(key: MetricKey): string[] {
    if (points.length === 0) return []
    const step = points.length === 1 ? 0 : (W - PAD * 2) / (points.length - 1)
    const segs: string[] = []
    let cur: string[] = []
    points.forEach((p, i) => {
      const v = valueOf(p, key)
      if (v === null) {
        if (cur.length > 0) segs.push(cur.join(' '))
        cur = []
        return
      }
      const x = PAD + i * step
      const y = H - PAD - (v / max) * (H - PAD * 2)
      cur.push(`${cur.length === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    })
    if (cur.length > 0) segs.push(cur.join(' '))
    return segs
  }

  const ticks = useMemo(() => {
    if (points.length === 0) return []
    const idx = [0, Math.floor(points.length / 2), points.length - 1]
    return idx.map((i) => ({
      x: points.length === 1 ? PAD : PAD + (i / (points.length - 1)) * (W - PAD * 2),
      label: new Date(points[Math.min(i, points.length - 1)].t).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    }))
  }, [points])

  return (
    <div className="rounded-panel border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[14px] font-semibold text-fg">{title}</h2>
        <div className="flex items-center gap-3">
          {series.map((s) => (
            <span key={s.label} className="flex items-center gap-1.5 text-[11px] text-fg-subtle">
              <span className="size-2 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>
      {points.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-fg-subtle">No data in this range.</p>
      ) : (
        <div className="mt-3">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full"
            style={{ height }}
            role="img"
            aria-label={title}
            preserveAspectRatio="none"
          >
            {[0.25, 0.5, 0.75].map((f) => (
              <line
                key={f}
                x1={PAD}
                x2={W - PAD}
                y1={H * f}
                y2={H * f}
                stroke="currentColor"
                strokeOpacity={0.08}
                strokeWidth={1}
              />
            ))}
            {series.map((s) =>
              segmentsFor(s.key).map((d, i) => (
                <g key={`${s.label}:${i}`}>
                  <path d={`${d} L${W - PAD},${H - PAD} L${PAD},${H - PAD} Z`} fill={s.color} fillOpacity={0.12} />
                  <path
                    d={d}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              )),
            )}
            <text x={W - PAD} y={PAD + 4} textAnchor="end" fontSize={10} fill="currentColor" opacity={0.5}>
              {max >= 1000 ? `${(max / 1000).toFixed(1)}k` : max.toFixed(max < 10 ? 1 : 0)}{unit}
            </text>
          </svg>
          <div className="mt-1 flex justify-between font-mono text-[10px] text-fg-subtle">
            {ticks.map((t, i) => (
              <span key={i} className={cn(i === 1 && 'hidden sm:inline')}>
                {t.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function UsagePage() {
  const [servers, setServers] = useState<UsageServer[]>([])
  const [serverId, setServerId] = useState('')
  const [hours, setHours] = useState(24)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await api.getUsage(hours)
    if (res.ok) {
      setServers(res.data.servers || [])
      setServerId((prev) => {
        if (prev && res.data.servers.some((s) => s.id === prev)) return prev
        return res.data.servers[0]?.id ?? ''
      })
    } else {
      setError(res.error.message || 'Failed to load usage.')
    }
    setLoading(false)
  }, [hours])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const active = useMemo(
    () => servers.find((s) => s.id === serverId) ?? servers[0] ?? null,
    [servers, serverId],
  )
  const pts = active?.points ?? []
  const lastKnown = useMemo(() => {
    const at = (key: MetricKey): number | null => {
      for (let i = pts.length - 1; i >= 0; i--) {
        const v = pts[i][key]
        if (v !== null) return v
      }
      return null
    }
    return { cpu: at('cpu'), ram: at('ram'), disk: at('disk'), rx: at('rx'), tx: at('tx') }
  }, [pts])

  const fmtPct = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)}%`)
  const stats = useMemo(() => {
    if (pts.length === 0) return []
    const net =
      lastKnown.rx !== null && lastKnown.tx !== null
        ? `${((lastKnown.rx + lastKnown.tx) / 60 / 1024).toFixed(1)} KB/s`
        : '—'
    return [
      { label: 'CPU', value: fmtPct(lastKnown.cpu), color: 'bg-accent' },
      { label: 'Memory', value: fmtPct(lastKnown.ram), color: 'bg-sky-500' },
      { label: 'Disk', value: fmtPct(lastKnown.disk), color: 'bg-emerald-400' },
      { label: 'Network', value: net, color: 'bg-violet-500' },
    ]
  }, [pts.length, lastKnown])

  return (
    <AppShell title="Usage" description="Resource history sampled every minute.">
      <div className="flex w-full flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-bold tracking-tight text-fg">Usage</h1>
            <p className="mt-0.5 font-mono text-[11px] text-fg-subtle">Dashboard · Usage</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={loadAll}
            disabled={loading}
            className="gap-1.5 text-[12px]"
          >
            <ArrowClockwise size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </Button>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={serverId}
            onChange={(e) => setServerId(e.target.value)}
            disabled={loading || servers.length === 0}
            aria-label="Select server"
            className="h-9 rounded-control border border-field-border bg-field px-3 text-[13px] text-fg focus:border-accent focus:outline-none"
          >
            {servers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1 rounded-control border border-border bg-surface p-1">
            {RANGES.map((r) => (
              <button
                key={r.hours}
                type="button"
                onClick={() => setHours(r.hours)}
                className={cn(
                  'rounded-control px-3 py-1.5 font-mono text-[12px] font-medium transition-colors',
                  hours === r.hours ? 'bg-surface-2 text-fg shadow-xs' : 'text-fg-subtle hover:text-fg',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {loading && servers.length === 0 ? (
          <p className="p-8 text-center text-[13px] text-fg-subtle">Loading usage...</p>
        ) : !active || active.points.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-panel border border-border bg-surface px-6 py-12 text-center">
            <ChartLineUp size={32} className="text-fg-subtle/50" aria-hidden />
            <p className="text-[15px] font-semibold text-fg">No Metrics Yet</p>
            <p className="max-w-sm text-[13px] text-fg-subtle">
              {servers.length === 0
                ? 'No servers on your account yet.'
                : 'The sampler records every minute — check back shortly after your servers have been running.'}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {stats.map((s) => (
                <div
                  key={s.label}
                  className="flex items-center gap-3 rounded-panel border border-border bg-surface p-4 shadow-2xs"
                >
                  <span className={cn('h-9 w-1.5 shrink-0 rounded-full', s.color)} />
                  <div className="flex flex-col">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
                      {s.label}
                    </span>
                    <span className="font-mono text-[18px] font-bold leading-tight text-fg">
                      {s.value}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <Chart
              title="CPU & Memory"
              unit="%"
              points={active.points}
              series={[
                { key: 'cpu', color: '#fd9d1e', label: 'CPU %' },
                { key: 'ram', color: '#38bdf8', label: 'RAM %' },
              ]}
            />
            <Chart
              title="Network throughput"
              unit=" KB/s"
              points={active.points}
              series={[
                { key: 'rx', color: '#34d399', label: 'Down' },
                { key: 'tx', color: '#a78bfa', label: 'Up' },
              ]}
            />
            <Chart
              title="Disk usage"
              unit="%"
              points={active.points}
              series={[{ key: 'disk', color: '#f472b6', label: 'Disk %' }]}
            />
          </>
        )}
      </div>
    </AppShell>
  )
}
