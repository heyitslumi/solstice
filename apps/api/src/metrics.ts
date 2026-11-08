/* Background sampler for the Usage page: one row per running instance per
   minute, pruned to 7 days. Runs only in the prod server (index.ts); tests
   import app.ts directly and never start it. */

import os from 'node:os'
import { incus } from './incus/client.ts'
import { query } from './db.ts'

const prev = new Map<string, { cpu: number; at: number; rx: number; tx: number }>()
let prevHostCpu: { idle: number; total: number } | null = null

function getHostCpuSample() {
  const cpus = os.cpus()
  let idle = 0
  let total = 0
  for (const cpu of cpus) {
    for (const type in cpu.times) {
      total += (cpu.times as any)[type]
    }
    idle += cpu.times.idle
  }
  return { idle, total }
}

async function collectNodeMetricsOnce(): Promise<void> {
  try {
    const nodes = await query<{ id: string; name: string }>(
      'SELECT id, name FROM nodes ORDER BY (name = \'local-incus\') DESC LIMIT 1',
    )
    const localNode = nodes[0]
    if (!localNode) return

    // Host CPU
    const curSample = getHostCpuSample()
    let cpuPct = 0
    if (prevHostCpu) {
      const idleDiff = curSample.idle - prevHostCpu.idle
      const totalDiff = curSample.total - prevHostCpu.total
      if (totalDiff > 0) {
        cpuPct = Math.min(100, Math.max(0, (1 - idleDiff / totalDiff) * 100))
      }
    }
    prevHostCpu = curSample

    // Host Memory
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    const ramPct = totalMem > 0 ? Math.min(100, Math.max(0, ((totalMem - freeMem) / totalMem) * 100)) : 0

    // Host Load Averages
    const load = os.loadavg()
    const load1 = Math.round(load[0] * 100) / 100
    const load5 = Math.round(load[1] * 100) / 100
    const load15 = Math.round(load[2] * 100) / 100

    await query(
      `INSERT INTO node_metrics (node_id, cpu_pct, ram_pct, load_1, load_5, load_15)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [localNode.id, cpuPct, ramPct, load1, load5, load15],
    )

    await query(`DELETE FROM node_metrics WHERE ts < now() - interval '30 days'`).catch(() => {})
  } catch (err) {
    console.warn('Failed to collect node metrics:', err)
  }
}

export async function collectMetricsOnce(): Promise<void> {
  const rows = await query<{ id: string; name: string; cores: number; memory_mb: number; disk_gb: number }>(
    'SELECT id, name, cores, memory_mb, disk_gb FROM instances',
  ).catch(() => [])

  let live: Awaited<ReturnType<typeof incus.listInstances>> = []
  try {
    live = await incus.listInstances()
  } catch {
    return
  }
  const liveMap = new Map(live.map((i) => [i.name, i]))
  const now = Date.now()

  for (const row of rows) {
    try {
      const li = liveMap.get(row.name)
      const state = li?.state
      if (!li || (li.status || '').toLowerCase() !== 'running' || !state) continue

      const cores = row.cores || 1
      const cpuNanos = state.cpu?.usage ?? 0
      const p = prev.get(row.name)

      let rx = 0
      let tx = 0
      if (state.network) {
        for (const [ifaceName, iface] of Object.entries(state.network)) {
          if (ifaceName === 'lo') continue
          rx += iface.counters?.bytes_received || 0
          tx += iface.counters?.bytes_sent || 0
        }
      }

      // Rates need two samples; unknown (not zero) until then.
      let cpuPct: number | null = null
      let rxDelta = 0
      let txDelta = 0
      if (p && now > p.at && cpuNanos >= p.cpu) {
        const elapsedNs = (now - p.at) * 1e6
        if (elapsedNs > 0) {
          cpuPct = Math.min(100, Math.max(0, ((cpuNanos - p.cpu) / (elapsedNs * cores)) * 100))
        }
        rxDelta = Math.max(0, rx - p.rx)
        txDelta = Math.max(0, tx - p.tx)
      }
      prev.set(row.name, { cpu: cpuNanos, at: now, rx, tx })

      const memTotal = (row.memory_mb || 1024) * 1024 * 1024
      const ramPct =
        memTotal > 0 ? Math.min(100, Math.max(0, ((state.memory?.usage || 0) / memTotal) * 100)) : 0
      const diskTotal = (row.disk_gb || 10) * 1024 * 1024 * 1024
      // Incus reports usage -1 when the pool has no quotas: unknown, not 0.
      const diskUsed = state.disk?.root?.usage ?? -1
      const diskPct: number | null =
        diskUsed >= 0 && diskTotal > 0
          ? Math.min(100, Math.max(0, (diskUsed / diskTotal) * 100))
          : null

      await query(
        `INSERT INTO instance_metrics (instance_id, cpu_pct, ram_pct, disk_pct, net_rx_bytes, net_tx_bytes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [row.id, cpuPct, ramPct, diskPct, rxDelta, txDelta],
      )
    } catch {
      // One bad instance must not kill the whole pass.
    }
  }

  await query(`DELETE FROM instance_metrics WHERE ts < now() - interval '7 days'`).catch(() => {})
}

export function startMetricsSampler(): NodeJS.Timeout {
  void collectMetricsOnce()
  void collectNodeMetricsOnce()
  return setInterval(() => {
    void collectMetricsOnce()
    void collectNodeMetricsOnce()
  }, 60000)
}
