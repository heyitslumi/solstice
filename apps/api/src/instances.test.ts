import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'

import { createApp } from './app.ts'
import { closePool, migrate } from './db.ts'
import { incus } from './incus/client.ts'

await migrate()
const app = createApp()

after(async () => {
  await closePool()
})

describe('incus instance endpoints', () => {
  it('connects to Incus daemon and reads system info', async () => {
    const info = await incus.getSystemInfo()
    assert.ok(info.api_version || info.environment?.server_version)
  })

  it('rejects unauthenticated GET /api/instances', async () => {
    const res = await app.request('/api/instances')
    assert.equal(res.status, 401)
  })

  it('rejects unauthenticated POST /api/instances', async () => {
    const res = await app.request('/api/instances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test-inst' }),
    })
    assert.equal(res.status, 401)
  })

  it('rejects unauthenticated GET /api/instances/stats', async () => {
    const res = await app.request('/api/instances/stats')
    assert.equal(res.status, 401)
  })

  it('rejects unauthenticated GET /api/auth/ssh-keys', async () => {
    const res = await app.request('/api/auth/ssh-keys')
    assert.equal(res.status, 401)
  })

  it('rejects unauthenticated POST /api/auth/ssh-keys', async () => {
    const res = await app.request('/api/auth/ssh-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Key 1', publicKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIG... key' }),
    })
    assert.equal(res.status, 401)
  })
})
