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

  it('rejects unauthenticated PATCH /api/admin/settings/application with 403', async () => {
    const res = await app.request('/api/admin/settings/application', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'New Name' }),
    })
    assert.equal(res.status, 403)
  })

  it('rejects unauthenticated PATCH /api/admin/settings/mail with 403', async () => {
    const res = await app.request('/api/admin/settings/mail', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mailFrom: 'test@example.com' }),
    })
    assert.equal(res.status, 403)
  })

  it('rejects unauthenticated PATCH /api/admin/settings/storage with 403', async () => {
    const res = await app.request('/api/admin/settings/storage', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ storagePool: 'test-pool' }),
    })
    assert.equal(res.status, 403)
  })

  it('rejects unauthenticated PATCH /api/admin/settings/webauthn with 403', async () => {
    const res = await app.request('/api/admin/settings/webauthn', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rpName: 'New RP' }),
    })
    assert.equal(res.status, 403)
  })

  it('rejects unauthenticated PATCH /api/admin/settings/ratelimits with 403', async () => {
    const res = await app.request('/api/admin/settings/ratelimits', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ maxRequestsPerMin: 120 }),
    })
    assert.equal(res.status, 403)
  })

  it('allows public access to GET /api/config', async () => {
    const res = await app.request('/api/config')
    assert.equal(res.status, 200)
    const data = await res.json() as any
    assert.ok(data.name)
    assert.equal(typeof data.enableRegistration, 'boolean')
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
