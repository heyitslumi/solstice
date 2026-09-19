import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { createTransport } from 'nodemailer'

export interface MailMessage {
  to: string
  subject: string
  text: string
  html?: string
}

export interface SentMail {
  id: string
  to: string
  subject: string
  filePath?: string
}

export interface MailboxEntry {
  id: string
  to: string
  subject: string
  createdAt: string
  filePath: string
  text: string
}

const DEFAULT_FROM = 'Solstice Host <no-reply@solstice.host>'

export function mailTransportName(): 'smtp' | 'file' {
  return process.env.SMTP_URL ? 'smtp' : 'file'
}

export function mailboxDir(): string {
  return resolve(process.env.MAIL_DIR ?? './data/mail')
}

function sender() {
  return process.env.MAIL_FROM ?? DEFAULT_FROM
}

function encodeHeader(value: string) {
  return /^[\u0020-\u007e]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

function decodeHeader(value: string) {
  const encoded = /^=\?UTF-8\?B\?(.+)\?=$/i.exec(value)
  return encoded?.[1] ? Buffer.from(encoded[1], 'base64').toString('utf8') : value
}

function parseHeaders(block: string) {
  const headers = new Map<string, string>()

  for (const line of block.split(/\r?\n/)) {
    const at = line.indexOf(':')
    if (at === -1) continue
    headers.set(line.slice(0, at).trim().toLowerCase(), line.slice(at + 1).trim())
  }

  return headers
}

function splitMessage(raw: string) {
  const match = /\r?\n\r?\n/.exec(raw)
  if (!match) return { headers: parseHeaders(raw), body: '' }

  return {
    headers: parseHeaders(raw.slice(0, match.index)),
    body: raw.slice(match.index + match[0].length),
  }
}

function extractText(headers: Map<string, string>, body: string) {
  const contentType = headers.get('content-type') ?? ''
  if (!contentType.startsWith('multipart/')) return body.trim()

  const boundary = /boundary="?([^";]+)"?/.exec(contentType)?.[1]
  if (!boundary) return body.trim()

  for (const part of body.split(`--${boundary}`)) {
    const parsed = splitMessage(part.trim())
    if ((parsed.headers.get('content-type') ?? '').startsWith('text/plain')) {
      return parsed.body.trim()
    }
  }

  return ''
}

function buildMessage(message: MailMessage, id: string, date: Date) {
  const headers = [
    `From: ${sender()}`,
    `To: ${message.to}`,
    `Subject: ${encodeHeader(message.subject)}`,
    `Date: ${date.toUTCString()}`,
    `Message-ID: <${id}@solstice.host>`,
    'MIME-Version: 1.0',
  ]

  if (!message.html) {
    return [
      ...headers,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      message.text,
      '',
    ].join('\r\n')
  }

  const boundary = `solstice-${id}`
  return [
    ...headers,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    message.text,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    message.html,
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n')
}

function smtpOptions() {
  return {
    url: process.env.SMTP_URL,
    // Security: without requireTLS a stripped-down server can downgrade the
    // session and take the credentials in clear.
    requireTLS: process.env.SMTP_REQUIRE_TLS === '1',
  }
}

export async function sendMail(message: MailMessage): Promise<SentMail> {
  const id = randomUUID()
  const date = new Date()

  if (mailTransportName() === 'smtp') {
    const transport = createTransport(smtpOptions())
    await transport.sendMail({
      from: sender(),
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    })

    return { id, to: message.to, subject: message.subject }
  }

  const dir = mailboxDir()
  await mkdir(dir, { recursive: true })

  const stamp = date.toISOString().replace(/[:.]/g, '-')
  const filePath = join(dir, `${stamp}-${id}.eml`)
  await writeFile(filePath, buildMessage(message, id, date), 'utf8')

  return { id, to: message.to, subject: message.subject, filePath }
}

export async function listMailbox(limit = 50): Promise<MailboxEntry[]> {
  const dir = mailboxDir()

  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return []
  }

  // Filenames start with a fixed-width timestamp, so a descending sort is
  // newest-first without stat-ing every file.
  const files = names
    .filter((name) => name.endsWith('.eml'))
    .sort()
    .reverse()
    .slice(0, limit)

  const entries: MailboxEntry[] = []

  for (const name of files) {
    const filePath = join(dir, name)
    const { headers, body } = splitMessage(await readFile(filePath, 'utf8'))
    const sentAt = new Date(headers.get('date') ?? '')

    entries.push({
      id: name.replace(/\.eml$/, ''),
      to: headers.get('to') ?? '',
      subject: decodeHeader(headers.get('subject') ?? ''),
      createdAt: Number.isNaN(sentAt.getTime())
        ? new Date(0).toISOString()
        : sentAt.toISOString(),
      filePath,
      text: extractText(headers, body),
    })
  }

  return entries
}
