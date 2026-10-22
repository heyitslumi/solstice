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

  it('rejects unauthenticated PATCH /api/admin/settings/metadata with 403', async () => {
    const res = await app.request('/api/admin/settings/metadata', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: 'New description' }),
    })
    assert.equal(res.status, 403)
  })

  it('rejects unauthenticated PATCH /api/admin/settings/captcha with 403', async () => {
    const res = await app.request('/api/admin/settings/captcha', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'turnstile' }),
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

  it('rejects unauthenticated PATCH /api/admin/settings/theme with 403', async () => {
    const res = await app.request('/api/admin/settings/theme', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accentColor: '#fd9d1e' }),
    })
    assert.equal(res.status, 403)
  })

  it('allows public access to GET /api/config', async () => {
    const res = await app.request('/api/config')
    assert.equal(res.status, 200)
    const data = await res.json() as any
    assert.ok(data.name)
    assert.equal(typeof data.enableRegistration, 'boolean')
    assert.equal(typeof data.captchaProvider, 'string')
  })

  it('rejects unauthenticated POST /api/admin/instances with 403', async () => {
    const res = await app.request('/api/admin/instances', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'fake', name: 'test' }),
    })
    assert.equal(res.status, 403)
  })

  it('rejects unauthenticated GET /api/admin/announcements with 403', async () => {
    const res = await app.request('/api/admin/announcements')
    assert.equal(res.status, 403)
  })

  it('allows public access to GET /api/announcements', async () => {
    const res = await app.request('/api/announcements')
    assert.equal(res.status, 200)
    const data = (await res.json()) as any
    assert.ok(Array.isArray(data.announcements))
  })

  it('rejects unauthenticated GET /api/admin/assets with 403', async () => {
    const res = await app.request('/api/admin/assets')
    assert.equal(res.status, 403)
  })

  it('rejects unauthenticated POST /api/admin/assets/directory with 403', async () => {
    const res = await app.request('/api/admin/assets/directory', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'test' }),
    })
    assert.equal(res.status, 403)
  })

  it('rejects unauthenticated GET /api/admin/locations with 403', async () => {
    const res = await app.request('/api/admin/locations')
    assert.equal(res.status, 403)
  })

  it('rejects unauthenticated POST /api/admin/locations with 403', async () => {
    const res = await app.request('/api/admin/locations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ shortCode: 'test', name: 'Test' }),
    })
    assert.equal(res.status, 403)
  })

  it('rejects unauthenticated GET /api/admin/nodes with 403', async () => {
    const res = await app.request('/api/admin/nodes')
    assert.equal(res.status, 403)
  })

  it('rejects unauthenticated GET /api/admin/oauth/providers with 403', async () => {
    const res = await app.request('/api/admin/oauth/providers')
    assert.equal(res.status, 403)
  })

  it('rejects unauthenticated POST /api/admin/oauth/providers with 403', async () => {
    const res = await app.request('/api/admin/oauth/providers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Test' }),
    })
    assert.equal(res.status, 403)
  })

  it('rejects unauthenticated POST /api/admin/oauth/providers/import with 403', async () => {
    const res = await app.request('/api/admin/oauth/providers/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: '{}' }),
    })
    assert.equal(res.status, 403)
  })

  it('rejects unauthenticated PATCH /api/admin/oauth/providers/x with 403', async () => {
    const res = await app.request('/api/admin/oauth/providers/x', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Test' }),
    })
    assert.equal(res.status, 403)
  })

  it('rejects unauthenticated DELETE /api/admin/oauth/providers/x with 403', async () => {
    const res = await app.request('/api/admin/oauth/providers/x', { method: 'DELETE' })
    assert.equal(res.status, 403)
  })

  it('allows public access to GET /api/auth/oauth/providers', async () => {
    const res = await app.request('/api/auth/oauth/providers')
    assert.equal(res.status, 200)
    const data = (await res.json()) as any
    assert.ok(Array.isArray(data))
  })

  it('rejects unauthenticated GET /api/auth/oauth/links with 401', async () => {
    const res = await app.request('/api/auth/oauth/links')
    assert.equal(res.status, 401)
  })

  it('rejects unauthenticated GET /api/admin/users/x/oauth-links with 403', async () => {
    const res = await app.request('/api/admin/users/x/oauth-links')
    assert.equal(res.status, 403)
  })

  it('rejects unauthenticated POST /api/admin/users/x/oauth-links with 403', async () => {
    const res = await app.request('/api/admin/users/x/oauth-links', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ providerId: 'x', identifier: 'y' }),
    })
    assert.equal(res.status, 403)
  })

  it('rejects unauthenticated DELETE /api/admin/users/x/oauth-links/y with 403', async () => {
    const res = await app.request('/api/admin/users/x/oauth-links/y', { method: 'DELETE' })
    assert.equal(res.status, 403)
  })

  it('rejects unauthenticated GET /api/admin/activity with 403', async () => {
    const res = await app.request('/api/admin/activity')
    assert.equal(res.status, 403)
  })

  it('rejects unauthenticated GET /api/admin/os-templates with 403', async () => {
    const res = await app.request('/api/admin/os-templates')
    assert.equal(res.status, 403)
  })

  it('rejects unauthenticated POST /api/admin/os-templates with 403', async () => {
    const res = await app.request('/api/admin/os-templates', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Test', imageAlias: 'ubuntu/noble/cloud' }),
    })
    assert.equal(res.status, 403)
  })

  it('rejects unauthenticated GET /api/admin/os-catalog with 403', async () => {
    const res = await app.request('/api/admin/os-catalog')
    assert.equal(res.status, 403)
  })

  it('rejects unauthenticated GET /api/admin/instances/x with 403', async () => {
    const res = await app.request('/api/admin/instances/x')
    assert.equal(res.status, 403)
  })

  it('rejects unauthenticated PATCH /api/admin/instances/x with 403', async () => {
    const res = await app.request('/api/admin/instances/x', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cores: 2 }),
    })
    assert.equal(res.status, 403)
  })

  it('rejects unauthenticated GET /api/admin/instances/x/snapshots with 403', async () => {
    const res = await app.request('/api/admin/instances/x/snapshots')
    assert.equal(res.status, 403)
  })

  it('rejects unauthenticated POST /api/admin/instances/x/snapshots with 403', async () => {
    const res = await app.request('/api/admin/instances/x/snapshots', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'snap0' }),
    })
    assert.equal(res.status, 403)
  })

  it('rejects unauthenticated GET /api/instances/x/snapshots with 401', async () => {
    const res = await app.request('/api/instances/x/snapshots')
    assert.equal(res.status, 401)
  })

  it('rejects unauthenticated PATCH /api/instances/x with 401', async () => {
    const res = await app.request('/api/instances/x', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'renamed' }),
    })
    assert.equal(res.status, 401)
  })

  it('rejects unauthenticated POST /api/instances/x/reinstall with 401', async () => {
    const res = await app.request('/api/instances/x/reinstall', { method: 'POST' })
    assert.equal(res.status, 401)
  })

  it('rejects unauthenticated POST /api/instances/x/ssh-password with 401', async () => {
    const res = await app.request('/api/instances/x/ssh-password', { method: 'POST' })
    assert.equal(res.status, 401)
  })

  it('rejects unauthenticated POST /api/instances/x/ssh-session with 401', async () => {
    const res = await app.request('/api/instances/x/ssh-session', { method: 'POST' })
    assert.equal(res.status, 401)
  })

  it('rejects unauthenticated DELETE /api/instances/x/ssh-session with 401', async () => {
    const res = await app.request('/api/instances/x/ssh-session', { method: 'DELETE' })
    assert.equal(res.status, 401)
  })

  it('rejects unauthenticated GET /api/instances/x/snapshot-schedule with 401', async () => {
    const res = await app.request('/api/instances/x/snapshot-schedule')
    assert.equal(res.status, 401)
  })

  it('rejects unauthenticated GET /api/api-keys with 401', async () => {
    const res = await app.request('/api/api-keys')
    assert.equal(res.status, 401)
  })

  it('rejects unauthenticated POST /api/api-keys with 401', async () => {
    const res = await app.request('/api/api-keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'x' }),
    })
    assert.equal(res.status, 401)
  })

  it('rejects unauthenticated GET /api/instances/x/firewall with 401', async () => {
    const res = await app.request('/api/instances/x/firewall')
    assert.equal(res.status, 401)
  })

  it('rejects unauthenticated POST /api/instances/x/firewall/rules with 401', async () => {
    const res = await app.request('/api/instances/x/firewall/rules', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ direction: 'ingress', action: 'allow' }),
    })
    assert.equal(res.status, 401)
  })

  it('rejects unauthenticated GET /api/usage with 401', async () => {
    const res = await app.request('/api/usage')
    assert.equal(res.status, 401)
  })

  it('rejects invalid Bearer tokens with 401', async () => {
    const res = await app.request('/api/instances', {
      headers: { authorization: 'Bearer solstice_invalid' },
    })
    assert.equal(res.status, 401)
  })

  it('rejects unauthenticated PUT /api/instances/x/snapshot-schedule with 401', async () => {
    const res = await app.request('/api/instances/x/snapshot-schedule', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ schedule: '@daily' }),
    })
    assert.equal(res.status, 401)
  })

  it('rejects unauthenticated GET /api/admin/port-forwards with 403', async () => {
    const res = await app.request('/api/admin/port-forwards')
    assert.equal(res.status, 403)
  })

  it('rejects unauthenticated GET /api/instances?scope=all with 401', async () => {
    const res = await app.request('/api/instances?scope=all')
    assert.equal(res.status, 401)
  })

  it('rejects unauthenticated POST /api/instances/x/clone with 401', async () => {
    const res = await app.request('/api/instances/x/clone', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'clone-1' }),
    })
    assert.equal(res.status, 401)
  })

  it('rejects unauthenticated GET /api/snapshots with 401', async () => {
    const res = await app.request('/api/snapshots')
    assert.equal(res.status, 401)
  })

  it('rejects unauthenticated GET /api/port-forwards with 401', async () => {
    const res = await app.request('/api/port-forwards')
    assert.equal(res.status, 401)
  })

  it('rejects unauthenticated POST /api/instances/x/port-forwards with 401', async () => {
    const res = await app.request('/api/instances/x/port-forwards', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ containerPort: 80 }),
    })
    assert.equal(res.status, 401)
  })

  it('rejects unauthenticated PATCH /api/admin/settings/legal with 403', async () => {
    const res = await app.request('/api/admin/settings/legal', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ termsUrl: 'https://example.com/terms' }),
    })
    assert.equal(res.status, 403)
  })

  it('rejects unauthenticated PATCH /api/admin/settings/network with 403', async () => {
    const res = await app.request('/api/admin/settings/network', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ portRangeStart: 22000, portRangeEnd: 22999 }),
    })
    assert.equal(res.status, 403)
  })
})
