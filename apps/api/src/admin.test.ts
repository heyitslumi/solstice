import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'

import { createApp } from './app.ts'
import { closePool, migrate } from './db.ts'

await migrate()
const app = createApp()

after(async () => {
  await closePool()
})

describe('admin endpoint guards', () => {
  it('rejects unauthenticated GET /api/admin/users with 403', async () => {
    const res = await app.request('/api/admin/users')
    assert.equal(res.status, 403)
  })

  it('rejects unauthenticated GET /api/admin/instances with 403', async () => {
    const res = await app.request('/api/admin/instances')
    assert.equal(res.status, 403)
  })

  it('rejects unauthenticated GET /api/admin/stats with 403', async () => {
    const res = await app.request('/api/admin/stats')
    assert.equal(res.status, 403)
  })

  it('rejects unauthenticated GET /api/admin/settings with 403', async () => {
    const res = await app.request('/api/admin/settings')
    assert.equal(res.status, 403)
  })

  it('rejects unauthenticated POST /api/admin/instances with 403', async () => {
    const res = await app.request('/api/admin/instances', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'fake', name: 'test' }),
    })
    assert.equal(res.status, 403)
  })
})
