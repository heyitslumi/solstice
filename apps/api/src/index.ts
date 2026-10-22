import { serve } from '@hono/node-server'

import { createApp } from './app.ts'
import { attachConsoleServer } from './console.ts'
import { closePool, migrate } from './db.ts'
import { startMetricsSampler } from './metrics.ts'

const PORT = Number(process.env.PORT ?? 8787)

await migrate()

const app = createApp()

// Global request logger to catch every in-flight request and status
app.use('*', async (c, next) => {
  const start = Date.now()
  await next()
  console.log(`[http] ${c.req.method} ${c.req.url} -> ${c.res.status} (${Date.now() - start}ms)`)
})

const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`panel api listening on http://localhost:${info.port}`)
})

startMetricsSampler()
attachConsoleServer(server as unknown as import('node:http').Server)

/*
 * Stop accepting connections and drain the pool before exiting. Without this a
 * supervisor's restart cuts in-flight queries off mid-statement and leaves the
 * connections for the server to time out.
 */
async function shutdown() {
  server.close()
  await closePool()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

/*
 * Dev visibility: log fatal errors before exiting non-zero so a supervisor
 * (scripts/dev-api.sh) can restart the process instead of dying silently.
 */
process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaughtException:', err)
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandledRejection:', reason)
  process.exit(1)
})
