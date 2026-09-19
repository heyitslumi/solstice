import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'

import { Client } from 'pg'

import { useTestDatabase } from './test-db.ts'

process.env.NODE_ENV = 'test'

/*
 * Seeded before db.ts is imported: the pool captures DATABASE_URL at import time, and
 * the migration can only be exercised against a database that already has a users
 * table lacking email_verified_at — which is what every pre-existing install looks
 * like.
 */
const testDb = await useTestDatabase()

const seed = new Client({ connectionString: process.env.DATABASE_URL })
await seed.connect()
await seed.query(`
  CREATE TABLE users (
    id            uuid PRIMARY KEY,
    email         text NOT NULL,
    name          text NOT NULL,
    password_hash text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
  );
`)
await seed.query(`
  INSERT INTO users (id, email, name, password_hash, created_at)
  VALUES (
    '11111111-1111-1111-1111-111111111111',
    'legacy@example.com',
    'Legacy',
    'scrypt$placeholder',
    now() - interval '30 days'
  );
`)
await seed.end()

const { closePool, migrate, query, queryOne } = await import('./db.ts')

after(async () => {
  await closePool()
  await testDb.drop()
})

interface VerifiedRow {
  email_verified_at: Date | string | null
}

describe('email verification migration', () => {
  it('grandfathers accounts that predate verification', async () => {
    await migrate()

    const row = await queryOne<VerifiedRow>(
      'SELECT email_verified_at FROM users WHERE email = $1',
      ['legacy@example.com'],
    )

    assert.ok(row, 'the pre-existing account must survive the migration')
    assert.ok(row.email_verified_at, 'a pre-existing account must not be locked out')
  })

  it('does not sweep up accounts created after the migration', async () => {
    await migrate()

    await query(
      `INSERT INTO users (id, email, name, password_hash, email_verified_at)
       VALUES (
         '22222222-2222-2222-2222-222222222222',
         'fresh@example.com',
         'Fresh',
         'scrypt$placeholder',
         NULL
       )`,
    )

    // A later boot must not treat the new account as a legacy one, which is the
    // whole reason the backfill is gated on the column being absent.
    await migrate()

    const row = await queryOne<VerifiedRow>(
      'SELECT email_verified_at FROM users WHERE email = $1',
      ['fresh@example.com'],
    )

    assert.equal(row?.email_verified_at, null, 'a new account must stay unverified')
  })
})
