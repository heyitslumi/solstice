import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'

const mailDir = mkdtempSync(join(tmpdir(), 'solstice-mail-'))
process.env.MAIL_DIR = mailDir
delete process.env.SMTP_URL

const { listMailbox, mailboxDir, mailTransportName, sendMail } = await import('./mail.ts')

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

after(() => {
  rmSync(mailDir, { recursive: true, force: true })
})

describe('mail transport', () => {
  it('uses the file transport when SMTP_URL is unset', () => {
    assert.equal(mailTransportName(), 'file')
    assert.equal(mailboxDir(), mailDir)
  })

  it('writes an .eml carrying the recipient, subject and body', async () => {
    const sent = await sendMail({
      to: 'ada@example.com',
      subject: 'Reset your password',
      text: 'Follow https://solstice.host/reset-password?token=abc',
    })

    assert.ok(sent.filePath, 'expected a file path')
    assert.ok(existsSync(sent.filePath))

    const raw = readFileSync(sent.filePath, 'utf8')
    assert.match(raw, /To: ada@example\.com/)
    assert.match(raw, /Subject: Reset your password/)
    assert.match(raw, /token=abc/)
  })

  it('lists messages newest first', async () => {
    const before = await listMailbox()

    await sendMail({ to: 'first@example.com', subject: 'First', text: 'one' })
    await sleep(5)
    await sendMail({ to: 'second@example.com', subject: 'Second', text: 'two' })

    const entries = await listMailbox()
    assert.equal(entries.length, before.length + 2)
    assert.equal(entries[0]?.to, 'second@example.com')
    assert.equal(entries[0]?.subject, 'Second')
    assert.equal(entries[0]?.text, 'two')
    assert.equal(entries[1]?.to, 'first@example.com')
  })

  it('keeps the plain-text part when html is supplied', async () => {
    await sendMail({
      to: 'multi@example.com',
      subject: 'Multipart',
      text: 'plain body',
      html: '<p>rich body</p>',
    })

    const entries = await listMailbox()
    assert.equal(entries[0]?.text, 'plain body')
  })

  it('round-trips a non-ascii subject', async () => {
    await sendMail({ to: 'uni@example.com', subject: 'Passwort zurücksetzen', text: 'body' })

    const entries = await listMailbox()
    assert.equal(entries[0]?.subject, 'Passwort zurücksetzen')
  })

  it('returns an empty list when the mailbox directory does not exist', async () => {
    const previous = process.env.MAIL_DIR
    process.env.MAIL_DIR = join(tmpdir(), `solstice-mail-missing-${randomUUID()}`)

    try {
      assert.deepEqual(await listMailbox(), [])
    } finally {
      process.env.MAIL_DIR = previous
    }
  })
})
