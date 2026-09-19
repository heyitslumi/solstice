import { randomBytes } from 'node:crypto'

import { Client } from 'pg'

const baseUrl = process.env.DATABASE_URL

function withDatabase(url: string, name: string) {
  const parsed = new URL(url)
  parsed.pathname = `/${name}`
  return parsed.toString()
}

/*
 * One database per test file, dropped afterwards, so files cannot see each other's
 * rows. The connection in DATABASE_URL doubles as the admin connection used to create
 * it, which is why the tests need a database that already exists to connect to.
 */
export async function useTestDatabase() {
  if (!baseUrl) {
    throw new Error('DATABASE_URL is not set. Run the tests through `npm test`, which loads .env.')
  }

  const name = `test_${randomBytes(6).toString('hex')}`

  const admin = new Client({ connectionString: baseUrl })
  await admin.connect()
  await admin.query(`CREATE DATABASE ${name}`)
  await admin.end()

  process.env.DATABASE_URL = withDatabase(baseUrl, name)

  return {
    name,
    async drop() {
      const client = new Client({ connectionString: baseUrl })
      await client.connect()
      await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
      await client.end()
    },
  }
}
