/* Embedded console: browser WebSocket <-> Incus interactive exec, proxied
   through the API over the Incus unix socket. Mounted as a raw HTTP upgrade
   handler (index.ts) because the framework server has no WS helper.

   Wire format browser->server: binary frames are shell stdin; a text frame of
   exactly {"cols":N,"rows":N} resizes the pty. */

import crypto from 'node:crypto'
import type { IncomingMessage, Server } from 'node:http'
import net from 'node:net'
import type { Duplex } from 'node:stream'
import { WebSocketServer, type WebSocket } from 'ws'

import { query, queryOne, type InstanceRow } from './db.ts'
import { incus, incusRequest } from './incus/client.ts'
import { readSession, SESSION_COOKIE } from './session.ts'

const SOCKET_PATH = process.env.INCUS_SOCKET_PATH || '/var/lib/incus/unix.socket'
const IDLE_MS = 20 * 60 * 1000

/* Minimal client-side WebSocket framing over a raw unix-socket connection. */
class IncusWs {
  private sock: net.Socket
  private buf = Buffer.alloc(0)
  private ready = false
  private fragments: Buffer[] = []
  onMessage: ((op: number, payload: Buffer) => void) | null = null
  onClose: (() => void) | null = null

  constructor(sock: net.Socket) {
    this.sock = sock
    sock.on('close', () => this.onClose?.())
    sock.on('error', () => this.onClose?.())
  }

  handshake(path: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const key = crypto.randomBytes(16).toString('base64')
      let header = Buffer.alloc(0)
      const onError = (err: Error) => reject(err)
      const onData = (chunk: Buffer) => {
        header = Buffer.concat([header, chunk])
        const idx = header.indexOf('\r\n\r\n')
        if (idx === -1) return
        const head = header.slice(0, idx).toString()
        this.buf = header.slice(idx + 4)
        this.sock.off('data', onData)
        this.sock.off('error', onError)
        this.sock.on('data', (c: Buffer) => this.feed(c))
        if (!head.includes('101')) {
          reject(new Error(`Incus websocket handshake failed: ${head.split('\r\n')[0]}`))
          return
        }
        this.ready = true
        this.feed(Buffer.alloc(0))
        resolve()
      }
      this.sock.on('data', onData)
      this.sock.once('error', onError)
      this.sock.write(
        `GET ${path} HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
      )
    })
  }

  private frame(op: number, payload: Buffer) {
    const mask = crypto.randomBytes(4)
    let header: Buffer
    if (payload.length < 126) {
      header = Buffer.alloc(2 + 4)
      header[1] = 0x80 | payload.length
    } else if (payload.length < 65536) {
      header = Buffer.alloc(4 + 4)
      header[1] = 0x80 | 126
      header.writeUInt16BE(payload.length, 2)
    } else {
      header = Buffer.alloc(10 + 4)
      header[1] = 0x80 | 127
      header.writeBigUInt64BE(BigInt(payload.length), 2)
    }
    header[0] = 0x80 | op
    mask.copy(header, header.length - 4)
    const masked = Buffer.alloc(payload.length)
    for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i % 4]
    if (this.ready) this.sock.write(Buffer.concat([header, masked]))
  }

  sendBinary(data: Buffer) {
    this.frame(0x2, data)
  }

  sendText(text: string) {
    this.frame(0x1, Buffer.from(text))
  }

  private pong(payload: Buffer) {
    this.frame(0xa, payload)
  }

  private feed(chunk: Buffer) {
    this.buf = Buffer.concat([this.buf, chunk])
    while (this.buf.length >= 2) {
      const fin = (this.buf[0] & 0x80) !== 0
      const op = this.buf[0] & 0x0f
      let len = this.buf[1] & 0x7f
      let off = 2
      if (len === 126) {
        if (this.buf.length < 4) break
        len = this.buf.readUInt16BE(2)
        off = 4
      } else if (len === 127) {
        if (this.buf.length < 10) break
        len = Number(this.buf.readBigUInt64BE(2))
        off = 10
      }
      if (this.buf.length < off + len) break
      const payload = this.buf.slice(off, off + len)
      this.buf = this.buf.slice(off + len)
      if (op === 0x8) {
        this.onClose?.()
        return
      }
      if (op === 0x9) {
        this.pong(payload)
        continue
      }
      if (op === 0x0) {
        this.fragments.push(payload)
        if (fin) {
          this.onMessage?.(0x2, Buffer.concat(this.fragments))
          this.fragments = []
        }
        continue
      }
      if (!fin) {
        this.fragments = [payload]
        continue
      }
      this.onMessage?.(op, payload)
    }
  }

  close() {
    try {
      this.frame(0x8, Buffer.alloc(0))
    } catch {
      // ignore
    }
    this.sock.destroy()
  }
}

export interface ExecSession {
  writeStdin(data: Buffer): void
  resize(cols: number, rows: number): void
  onData(cb: (data: Buffer) => void): void
  onEnd(cb: () => void): void
  close(): void
}

async function openExecSession(
  instanceName: string,
  cols: number,
  rows: number,
  shell: string,
): Promise<ExecSession> {
  const res = await incusRequest<any>(
    'POST',
    `/1.0/instances/${encodeURIComponent(instanceName)}/exec`,
    {
      // Run directly (no sh -c wrapper): wrappers break interactive startup.
      command: [shell, '-l'],
      environment: { TERM: 'xterm-256color' },
      'wait-for-websocket': true,
      interactive: true,
      width: cols,
      height: rows,
    },
    30000,
  )
  const opId = String(res.operation || '').split('/').pop()
  const fds = res.metadata?.metadata?.fds as Record<string, string> | undefined
  if (!opId || !fds?.['0'] || !fds?.control) {
    throw new Error('Incus did not return exec websocket channels.')
  }

  const stdio = new IncusWs(net.connect(SOCKET_PATH))
  const control = new IncusWs(net.connect(SOCKET_PATH))
  // Buffer anything bash prints during setup (the prompt!) so it is replayed
  // instead of dropped before the consumer attaches.
  const early: Buffer[] = []
  let dataCb: ((data: Buffer) => void) | null = null
  let endCb: (() => void) | null = null
  stdio.onMessage = (op, payload) => {
    if ((op === 0x2 || op === 0x1) && payload.length > 0) {
      if (dataCb) dataCb(payload)
      else early.push(payload)
    }
  }
  await stdio.handshake(`/1.0/operations/${opId}/websocket?secret=${fds['0']}`)
  await control.handshake(`/1.0/operations/${opId}/websocket?secret=${fds['control']}`)
  const ended = () => endCb?.()
  stdio.onClose = ended
  control.onClose = ended

  return {
    writeStdin: (data: Buffer) => {
      if (data.length > 0) stdio.sendBinary(data)
    },
    resize: (c: number, r: number) => {
      control.sendText(JSON.stringify({ command: 'window-resize', width: c, height: r }))
    },
    onData: (cb) => {
      dataCb = cb
      for (const payload of early.splice(0)) cb(payload)
    },
    onEnd: (cb) => {
      endCb = cb
    },
    close: () => {
      stdio.close()
      control.close()
    },
  }
}

/* Delete any live console operations holding this instance's console. */
async function releaseStaleConsoles(instanceName: string) {
  const res = await incusRequest<any>('GET', '/1.0/operations?recursion=1', undefined, 15000)
  const ops = (res.metadata || []) as Array<{
    id: string
    class: string
    description?: string
    resources?: { instances?: string[] }
  }>
  for (const op of ops) {
    if (op.class !== 'websocket' || !/console/i.test(op.description || '')) continue
    if (!(op.resources?.instances || []).some((p) => p.endsWith(`/${instanceName}`))) continue
    await incusRequest('DELETE', `/1.0/operations/${op.id}`).catch(() => {})
  }
}

/* Attach to the instance's serial/text console (boot log + login prompt). Unlike
   exec, only one client may hold the console: we take it over with force and
   MUST release the operation on disconnect or the user is locked out. */
async function openConsoleSession(
  instanceName: string,
  cols: number,
  rows: number,
  takeover = false,
): Promise<ExecSession> {
  const path = `/1.0/instances/${encodeURIComponent(instanceName)}/console`
  const body = { width: cols, height: rows }
  let res: any
  try {
    res = await incusRequest<any>('POST', path, body, 30000)
  } catch (err: any) {
    // A previous session that never released blocks the console. Incus's own
    // `force` takeover breaks forkconsole for containers, so clear the stale
    // operation(s) and retry once instead.
    if (/already connected/i.test(err?.message || '')) {
      if (!takeover) {
        // Someone else is holding the console — ask the user before taking over.
        throw new Error('CONSOLE_TAKEN')
      }
      // Force-release the holder, then retry while forkconsole tears down.
      await releaseStaleConsoles(instanceName).catch(() => {})
      let lastErr: any = err
      for (let attempt = 0; attempt < 5; attempt++) {
        await new Promise((r) => setTimeout(r, 1500))
        try {
          res = await incusRequest<any>('POST', path, body, 30000)
          lastErr = null
          break
        } catch (retryErr: any) {
          lastErr = retryErr
          if (!/already connected/i.test(retryErr?.message || '')) break
        }
      }
      if (lastErr) throw lastErr
    } else {
      throw err
    }
  }
  const opId = String(res.operation || '').split('/').pop()
  const fds = res.metadata?.metadata?.fds as Record<string, string> | undefined
  if (!opId || !fds?.['0']) {
    throw new Error('Incus did not return console websocket channels.')
  }

  // Console uses only fd 0; opening the control channel makes Incus end the
  // session. Geometry is fixed at attach time, so we don't need it.
  const stdio = new IncusWs(net.connect(SOCKET_PATH))
  const early: Buffer[] = []
  let dataCb: ((data: Buffer) => void) | null = null
  let endCb: (() => void) | null = null
  let closed = false
  stdio.onMessage = (op, payload) => {
    if ((op === 0x2 || op === 0x1) && payload.length > 0) {
      if (dataCb) dataCb(payload)
      else early.push(payload)
    }
  }
  await stdio.handshake(`/1.0/operations/${opId}/websocket?secret=${fds['0']}`)
  stdio.onClose = () => endCb?.()

  const release = () => {
    if (closed) return
    closed = true
    stdio.close()
    // Free the console for the next attach (Incus UI, CLI, or us again).
    void incusRequest('DELETE', `/1.0/operations/${opId}`).catch(() => {})
  }

  // A just-detached console can greet us with a transient forkconsole error
  // while the old process exits. Surface it as retryable.
  await new Promise<void>((resolve) => setTimeout(resolve, 350))
  if (early.some((b) => /forkconsole|attaching to the container failed/i.test(b.toString()))) {
    release()
    throw new Error('CONSOLE_BUSY')
  }

  return {
    writeStdin: (data: Buffer) => {
      if (data.length > 0) stdio.sendBinary(data)
    },
    // Console geometry is fixed at attach time; ignore live resizes.
    resize: () => {},
    onData: (cb) => {
      dataCb = cb
      for (const payload of early.splice(0)) cb(payload)
    },
    onEnd: (cb) => {
      endCb = cb
    },
    close: release,
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (header || '').split(';')) {
    const idx = part.indexOf('=')
    if (idx > 0) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim())
  }
  return out
}

async function serveConsole(
  ws: WebSocket,
  req: IncomingMessage,
  id: string,
  drainEarlyBuffer: () => void,
) {
  const url = new URL(req.url || '', 'http://localhost')
  const session = await readSession(parseCookies(req.headers.cookie)[SESSION_COOKIE]).catch(
    () => null,
  )
  if (!session) {
    ws.close(4401, 'Not signed in.')
    return
  }
  const me = await queryOne<{ is_admin: boolean }>(
    'SELECT is_admin FROM users WHERE id = $1',
    [session.user_id],
  ).catch(() => null)
  const instance = await queryOne<InstanceRow>(
    me?.is_admin ? 'SELECT * FROM instances WHERE id = $1' : 'SELECT * FROM instances WHERE id = $1 AND user_id = $2',
    me?.is_admin ? [id] : [id, session.user_id],
  ).catch(() => null)
  if (!instance) {
    ws.close(4404, 'Instance not found.')
    return
  }

  let live: { status?: string } | null = null
  try {
    live = await incusRequest<any>('GET', `/1.0/instances/${encodeURIComponent(instance.name)}`).then(
      (r) => r.metadata,
    )
  } catch {
    live = null
  }
  if (!live || (live.status || '').toLowerCase() !== 'running') {
    ws.close(4410, 'Start the server first.')
    return
  }

  const cols = Math.min(300, Math.max(20, Math.floor(Number(url.searchParams.get('cols')) || 80)))
  const rows = Math.min(100, Math.max(5, Math.floor(Number(url.searchParams.get('rows')) || 24)))

  const mode = url.searchParams.get('mode') === 'console' ? 'console' : 'shell'
  const takeover = url.searchParams.get('takeover') === '1'

  let exec: ExecSession | null = null
  try {
    if (mode === 'console') {
      // Retry across the forkconsole teardown window of a previous session.
      for (let attempt = 0; ; attempt++) {
        try {
          exec = await openConsoleSession(instance.name, cols, rows, takeover)
          break
        } catch (err: any) {
          if (err?.message === 'CONSOLE_BUSY' && attempt < 3) {
            await new Promise((r) => setTimeout(r, 2000))
            continue
          }
          throw err
        }
      }
    } else {
      // Probe for bash first so Alpine/minimal images fall back to sh.
      let shell = '/bin/bash'
      try {
        const hasBash = await incus.execInstance(instance.name, ['command', '-v', 'bash'], 10)
        if (!hasBash) shell = '/bin/sh'
      } catch {
        shell = '/bin/bash'
      }
      exec = await openExecSession(instance.name, cols, rows, shell)
    }
  } catch (err: any) {
    if (err?.message === 'CONSOLE_TAKEN') {
      ws.close(4409, 'Someone is already using this console.')
      return
    }
    const msg =
      mode === 'console'
        ? err?.message || 'Could not attach to the console.'
        : 'Could not open a shell.'
    ws.close(4500, msg)
    return
  }

  let idle = setTimeout(kill, IDLE_MS)
  const touch = () => {
    clearTimeout(idle)
    idle = setTimeout(kill, IDLE_MS)
  }
  function kill() {
    cleanup()
    try {
      ws.close(4408, 'Idle timeout.')
    } catch {
      // ignore
    }
  }
  let done = false
  function cleanup() {
    if (done) return
    done = true
    clearTimeout(idle)
    try {
      exec?.close()
    } catch {
      // ignore
    }
  }


  exec.onData((data) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(data, { binary: true })
      touch()
    }
  })
  exec.onEnd(() => {
    cleanup()
    if (ws.readyState === ws.OPEN) ws.close(1000, 'Shell exited.')
  })

  ws.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
    touch()
    if (!exec || done) return
    if (!isBinary) {
      const text = data.toString()
      try {
        const msg = JSON.parse(text)
        if (
          msg &&
          typeof msg.cols === 'number' &&
          typeof msg.rows === 'number' &&
          Object.keys(msg).length === 2
        ) {
          exec.resize(
            Math.min(300, Math.max(20, Math.floor(msg.cols))),
            Math.min(100, Math.max(5, Math.floor(msg.rows))),
          )
          return
        }
      } catch {
        // Not JSON: fall through as stdin.
      }
      exec.writeStdin(Buffer.from(text))
    } else if (Buffer.isBuffer(data)) {
      exec.writeStdin(data)
    } else if (data instanceof ArrayBuffer) {
      exec.writeStdin(Buffer.from(data))
    } else if (Array.isArray(data)) {
      exec.writeStdin(Buffer.concat(data))
    }
  })
  drainEarlyBuffer()
  ws.on('close', cleanup)
  ws.on('error', cleanup)

  query(
    `INSERT INTO activity_logs (id, user_id, action, details, ip_address)
     VALUES (gen_random_uuid(), $1, 'console_open', $2, $3)`,
    [
      session.user_id,
      mode === 'console'
        ? `Attached to the console of "${instance.name}"`
        : `Opened a shell on "${instance.name}"`,
      null,
    ],
  ).catch(() => {})
}


/* VGA (SPICE) graphical console.
   Incus returns one data fd + one control fd for a vga op; every browser
   websocket presenting the fd-0 secret gets its own QEMU SPICE connection
   (spice-html5 opens one WS per SPICE channel to the same URI). Backend
   pipes binary frames verbatim — no SPICE parsing here. */
interface VgaSession {
  instanceName: string
  opId: string
  secret: string
  control: IncusWs
  refs: number
  teardownTimer: ReturnType<typeof setTimeout> | null
}

const vgaSessions = new Map<string, VgaSession>()

async function getVgaSession(instanceName: string, takeover: boolean): Promise<VgaSession> {
  const existing = vgaSessions.get(instanceName)
  if (existing) {
    if (existing.teardownTimer) {
      clearTimeout(existing.teardownTimer)
      existing.teardownTimer = null
    }
    existing.refs++
    return existing
  }
  const path = `/1.0/instances/${encodeURIComponent(instanceName)}/console`
  const body = { type: 'vga', width: 1024, height: 768 }
  let res: any
  try {
    res = await incusRequest<any>('POST', path, body, 30000)
  } catch (err: any) {
    if (/already connected/i.test(err?.message || '')) {
      if (!takeover) throw new Error('CONSOLE_TAKEN')
      await releaseStaleConsoles(instanceName).catch(() => {})
      for (let attempt = 0; attempt < 5; attempt++) {
        await new Promise((r) => setTimeout(r, 1500))
        try {
          res = await incusRequest<any>('POST', path, body, 30000)
          break
        } catch (retryErr: any) {
          if (!/already connected/i.test(retryErr?.message || '')) throw retryErr
          if (attempt === 4) throw retryErr
        }
      }
    } else {
      throw err
    }
  }
  const opId = String(res.operation || '').split('/').pop()
  const fds = res.metadata?.metadata?.fds as Record<string, string> | undefined
  if (!opId || !fds?.['0'] || !fds?.control) {
    throw new Error('Incus did not return VGA console channels.')
  }
  // Hold the control channel for the op lifetime; closing it ends the op.
  const control = new IncusWs(net.connect(SOCKET_PATH))
  await control.handshake(`/1.0/operations/${opId}/websocket?secret=${fds.control}`)
  const session: VgaSession = { instanceName, opId, secret: fds['0'], control, refs: 1, teardownTimer: null }
  vgaSessions.set(instanceName, session)
  return session
}

function releaseVgaSession(session: VgaSession) {
  session.refs--
  if (session.refs > 0) return
  session.teardownTimer = setTimeout(() => {
    if (session.refs > 0) return
    vgaSessions.delete(session.instanceName)
    try {
      session.control.close()
    } catch {}
    void incusRequest('DELETE', `/1.0/operations/${session.opId}`).catch(() => {})
  }, 5000)
}

async function serveVgaChannel(ws: WebSocket, session: VgaSession) {
  const stdio = new IncusWs(net.connect(SOCKET_PATH))
  let closed = false
  const cleanup = () => {
    if (closed) return
    closed = true
    try { stdio.close() } catch {}
    try { ws.close(1000, 'Channel closed.') } catch {}
    releaseVgaSession(session)
  }
  stdio.onMessage = (op, payload) => {
    if ((op === 0x2 || op === 0x1) && payload.length > 0 && ws.readyState === ws.OPEN) {
      ws.send(payload, { binary: true })
    }
  }
  stdio.onClose = cleanup
  ws.on('message', (data: WebSocket.RawData) => {
    const buf = Buffer.isBuffer(data) ? data : data instanceof ArrayBuffer ? Buffer.from(data) : Buffer.concat(data as Buffer[])
    if (buf.length > 0) stdio.sendBinary(buf)
  })
  ws.on('close', cleanup)
  ws.on('error', cleanup)
  await stdio.handshake(`/1.0/operations/${session.opId}/websocket?secret=${session.secret}`)
}

export function attachConsoleServer(server: Server) {
  const wss = new WebSocketServer({ noServer: true })
  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const path = (req.url || '').split('?')[0]
    const match = /^\/api\/instances\/([^/]+)\/console$/.exec(path)
    if (!match) {
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket as any, head, async (ws) => {
      // VGA (SPICE) channels: auth, resolve the instance, then pipe one
      // Incus channel websocket per browser websocket.
      const q = new URL(req.url || '', 'http://localhost')
      if (q.searchParams.get('mode') === 'vga') {
        try {
          const sessionAuth = await readSession(parseCookies(req.headers.cookie)[SESSION_COOKIE]).catch(() => null)
          if (!sessionAuth) { ws.close(4401, 'Not signed in.'); return }
          const me = await queryOne<{ is_admin: boolean }>(
            'SELECT is_admin FROM users WHERE id = $1',
            [sessionAuth.user_id],
          ).catch(() => null)
          const vgaInstance = await queryOne<InstanceRow>(
            me?.is_admin ? 'SELECT * FROM instances WHERE id = $1' : 'SELECT * FROM instances WHERE id = $1 AND user_id = $2',
            me?.is_admin ? [decodeURIComponent(match[1])] : [decodeURIComponent(match[1]), sessionAuth.user_id],
          ).catch(() => null)
          if (!vgaInstance) { ws.close(4404, 'Instance not found.'); return }
          const liveState = await incusRequest<any>('GET', `/1.0/instances/${encodeURIComponent(vgaInstance.name)}`).then((r) => r.metadata).catch(() => null)
          if (!liveState || (liveState.status || '').toLowerCase() !== 'running') {
            ws.close(4410, 'Start the server first.')
            return
          }
          const vga = await getVgaSession(vgaInstance.name, q.searchParams.get('takeover') === '1')
          await serveVgaChannel(ws, vga)
        } catch (err: any) {
          if (err?.message === 'CONSOLE_TAKEN') ws.close(4409, 'Someone is already using this console.')
          else ws.close(4500, err?.message || 'VGA console failed.')
        }
        return
      }
      // Buffer anything the browser sends during auth + exec setup so the
      // first keystrokes are never lost to the async gap.
      const early: Array<{ data: WebSocket.RawData; isBinary: boolean }> = []
      const earlyListener = (data: WebSocket.RawData, isBinary: boolean) => {
        early.push({ data, isBinary })
      }
      ws.on('message', earlyListener)
      const drainEarlyBuffer = () => {
        ws.off('message', earlyListener)
        for (const m of early) ws.emit('message', m.data, m.isBinary)
        early.length = 0
      }
      void serveConsole(ws, req, decodeURIComponent(match[1]), drainEarlyBuffer).catch(() => {
        try {
          ws.close(4500, 'Console failed.')
        } catch {
          // ignore
        }
      })
    })
  })
}
