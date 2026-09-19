import { query, queryOne, toIso } from './db.ts'

export interface RateLimitDecision {
  allowed: boolean
  retryAfterSeconds: number
  remaining: number
}

export interface RateLimitStore {
  hit(key: string, limit: number, windowMs: number): Promise<RateLimitDecision>
  reset(key?: string): Promise<void>
}

function decide(count: number, resetAtMs: number, limit: number, now: number): RateLimitDecision {
  const allowed = count <= limit
  return {
    allowed,
    retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((resetAtMs - now) / 1000)),
    remaining: Math.max(0, limit - count),
  }
}

export function createMemoryStore(): RateLimitStore {
  const counters = new Map<string, { count: number; resetAt: number }>()

  // Without this the map grows one entry per distinct client forever.
  const sweep = setInterval(() => {
    const now = Date.now()
    for (const [key, value] of counters) {
      if (value.resetAt <= now) counters.delete(key)
    }
  }, 60_000)
  sweep.unref()

  return {
    async hit(key, limit, windowMs) {
      const now = Date.now()
      const current = counters.get(key)

      if (!current || current.resetAt <= now) {
        const resetAt = now + windowMs
        counters.set(key, { count: 1, resetAt })
        return decide(1, resetAt, limit, now)
      }

      current.count += 1
      return decide(current.count, current.resetAt, limit, now)
    },

    async reset(key) {
      if (key === undefined) counters.clear()
      else counters.delete(key)
    },
  }
}

/*
 * The increment and the window reset have to happen in one statement. Reading
 * the row and writing it back in two round trips lets two concurrent requests
 * for the same key both read the same count and lose one of the increments.
 */
const HIT_SQL = `
  INSERT INTO rate_limits (key, count, reset_at)
  VALUES ($1, 1, $2)
  ON CONFLICT (key) DO UPDATE SET
    count = CASE
      WHEN rate_limits.reset_at <= now() THEN 1
      ELSE rate_limits.count + 1
    END,
    reset_at = CASE
      WHEN rate_limits.reset_at <= now() THEN $2
      ELSE rate_limits.reset_at
    END
  RETURNING count, reset_at
`

export function createSqlStore(): RateLimitStore {
  return {
    async hit(key, limit, windowMs) {
      const now = Date.now()
      const resetAt = new Date(now + windowMs).toISOString()

      const row = await queryOne<{ count: number | string; reset_at: Date | string }>(HIT_SQL, [
        key,
        resetAt,
      ])
      if (!row) throw new Error('rate limit upsert returned no row')

      return decide(Number(row.count), new Date(toIso(row.reset_at)).getTime(), limit, now)
    },

    async reset(key) {
      if (key === undefined) await query('DELETE FROM rate_limits')
      else await query('DELETE FROM rate_limits WHERE key = $1', [key])
    },
  }
}
