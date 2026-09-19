import { serve } from '@hono/node-server'

import { createApp } from './app.ts'
import { closePool, migrate } from './db.ts'

const PORT = Number(process.env.PORT ?? 8787)

await migrate()

const server = serve({ fetch: createApp().fetch, port: PORT }, (info) => {
  console.log(`solstice api listening on http://localhost:${info.port}`)
})

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
