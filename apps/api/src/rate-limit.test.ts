import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'

import { useTestDatabase } from './test-db.ts'

// The pool captures DATABASE_URL at import time, so the test database has to exist
// before db.ts is loaded.
const testDb = await useTestDatabase()

const { createMemoryStore, createSqlStore } = await import('./rate-limit.ts')
const { closePool, migrate } = await import('./db.ts')
await migrate()

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

after(async () => {
  await closePool()
  await testDb.drop()
})

describe('memory store', () => {
  it('allows exactly `limit` hits and rejects the next', async () => {
    const store = createMemoryStore()

    for (let i = 1; i <= 3; i += 1) {
      assert.equal((await store.hit('k', 3, 60_000)).allowed, true, `hit ${i} should be allowed`)
    }

    const blocked = await store.hit('k', 3, 60_000)
    assert.equal(blocked.allowed, false)
    assert.equal(blocked.remaining, 0)
    assert.ok(blocked.retryAfterSeconds >= 1)
  })

  it('starts a fresh window once the old one elapses', async () => {
    const store = createMemoryStore()

    assert.equal((await store.hit('k', 1, 30)).allowed, true)
    assert.equal((await store.hit('k', 1, 30)).allowed, false)

    await sleep(60)
    assert.equal((await store.hit('k', 1, 30)).allowed, true)
  })

  it('reset(key) clears only that key', async () => {
    const store = createMemoryStore()
    await store.hit('a', 1, 60_000)
    await store.hit('b', 1, 60_000)

    await store.reset('a')

    assert.equal((await store.hit('a', 1, 60_000)).allowed, true)
    assert.equal((await store.hit('b', 1, 60_000)).allowed, false)
  })

  it('reports remaining budget', async () => {
    const store = createMemoryStore()
    assert.equal((await store.hit('k', 2, 60_000)).remaining, 1)
    assert.equal((await store.hit('k', 2, 60_000)).remaining, 0)
  })
})

describe('sql store', () => {
  it('allows exactly `limit` hits and rejects the next', async () => {
    const store = createSqlStore()
    await store.reset('sql-boundary')

    for (let i = 1; i <= 4; i += 1) {
      assert.equal((await store.hit('sql-boundary', 4, 60_000)).allowed, true, `hit ${i}`)
    }

    const blocked = await store.hit('sql-boundary', 4, 60_000)
    assert.equal(blocked.allowed, false)
    assert.ok(blocked.retryAfterSeconds >= 1)
  })

  it('keeps counting across store instances', async () => {
    await createSqlStore().reset('sql-persist')
    await createSqlStore().hit('sql-persist', 1, 60_000)

    // A fresh instance stands in for a process restart: the count lives in SQL.
    assert.equal((await createSqlStore().hit('sql-persist', 1, 60_000)).allowed, false)
  })

  it('reset() with no key clears every counter', async () => {
    const store = createSqlStore()
    await store.hit('sql-all-a', 1, 60_000)
    await store.hit('sql-all-b', 1, 60_000)

    await store.reset()

    assert.equal((await store.hit('sql-all-a', 1, 60_000)).allowed, true)
    assert.equal((await store.hit('sql-all-b', 1, 60_000)).allowed, true)
  })
})
