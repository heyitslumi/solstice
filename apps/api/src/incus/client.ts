import crypto from 'node:crypto'
import http from 'node:http'
import net from 'node:net'

const SOCKET_PATH = process.env.INCUS_SOCKET_PATH || '/var/lib/incus/unix.socket'

export interface IncusResponse<T = unknown> {
  type: 'sync' | 'async' | 'error'
  status: string
  status_code: number
  operation: string
  error_code: number
  error: string
  metadata: T
}

export interface IncusOperationMetadata {
  id: string
  class: string
  description: string
  created_at: string
  updated_at: string
  status: string
  status_code: number
  err?: string
}

export interface IncusNetworkAddress {
  family: 'inet' | 'inet6'
  address: string
  netmask: string
  scope: string
}

export interface IncusNetworkInterface {
  addresses: IncusNetworkAddress[]
  counters: {
    bytes_received: number
    bytes_sent: number
    packets_received: number
    packets_sent: number
  }
  hwaddr: string
  state: 'up' | 'down'
  type: string
}

export interface IncusInstanceState {
  status: 'Running' | 'Stopped' | 'Frozen' | 'Starting' | 'Stopping' | 'Aborting'
  status_code: number
  cpu: {
    usage: number
  }
  memory: {
    usage: number
    usage_peak: number
    total?: number
  }
  network?: Record<string, IncusNetworkInterface>
  disk?: Record<string, { usage: number }>
}

export interface IncusInstance {
  name: string
  description: string
  type: 'container' | 'virtual-machine'
  status: string
  status_code: number
  state?: IncusInstanceState
  config: Record<string, string>
  devices: Record<string, Record<string, string>>
  created_at: string
  last_used_at: string
}

export function incusRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  timeoutMs = 15000,
): Promise<IncusResponse<T>> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : null

    const req = http.request(
      {
        socketPath: SOCKET_PATH,
        path,
        method,
        headers: {
          Host: 'localhost',
          ...(payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
              }
            : {}),
        },
        timeout: timeoutMs,
      },
      (res) => {
        let raw = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          raw += chunk
        })
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw) as IncusResponse<T>
            if (res.statusCode && res.statusCode >= 400 && parsed.error) {
              reject(new Error(parsed.error))
            } else {
              resolve(parsed)
            }
          } catch (err) {
            reject(new Error(`Failed to parse Incus response: ${raw.slice(0, 200)}`))
          }
        })
      },
    )

    req.on('timeout', () => {
      req.destroy(new Error(`Incus request timeout on ${method} ${path}`))
    })

    req.on('error', (err) => {
      reject(err)
    })

    if (payload) {
      req.write(payload)
    }
    req.end()
  })
}

export async function waitOperation(operationPath: string, timeoutSec = 120): Promise<void> {
  const waitPath = `${operationPath}/wait?timeout=${timeoutSec}`
  const res = await incusRequest<IncusOperationMetadata>('GET', waitPath, undefined, (timeoutSec + 5) * 1000)
  if (res.metadata?.status === 'Failure' || res.metadata?.err) {
    throw new Error(res.metadata.err || 'Incus operation failed')
  }
}

export const incus = {
  async getSystemInfo() {
    const res = await incusRequest<{
      api_version: string
      environment: {
        server_version: string
        os_name: string
        kernel_version: string
        storage: string
      }
    }>('GET', '/1.0')
    return res.metadata
  },

  async listInstances(): Promise<IncusInstance[]> {
    const res = await incusRequest<IncusInstance[]>('GET', '/1.0/instances?recursion=2')
    return res.metadata || []
  },

  async getInstance(name: string): Promise<IncusInstance> {
    const res = await incusRequest<IncusInstance>('GET', `/1.0/instances/${encodeURIComponent(name)}`)
    return res.metadata
  },

  async getInstanceState(name: string): Promise<IncusInstanceState> {
    const res = await incusRequest<IncusInstanceState>(
      'GET',
      `/1.0/instances/${encodeURIComponent(name)}/state`,
    )
    return res.metadata
  },

  async createInstance(params: {
    name: string
    type: 'container' | 'virtual-machine'
    imageAlias?: string
    server?: string
    cpu?: number
    memory?: string
    disk?: string
    sshKeys?: string[]
    // Only meaningful for VMs. true = UEFI boot, false = BIOS (CSM) boot.
    // undefined leaves the Incus default (UEFI w/ secure boot).
    uefi?: boolean
    hostname?: string
    timezone?: string
    swapMb?: number
    dnsServers?: string[]
    network?: string
    rawQemu?: string
  }) {
    // Always ensure an SSH daemon exists so generated credentials and key
    // auth work out of the box; owner keys are appended when present.
    const keysFormatted = (params.sshKeys || []).map((k) => `  - ${k.trim()}`).join('\n')
    const rootKeysFormatted = (params.sshKeys || []).map((k) => `      - ${k.trim()}`).join('\n')
    const hostname = (params.hostname || '').trim()
    const timezone = (params.timezone || '').trim()
    const swapMb = Math.max(0, Math.min(16384, Number(params.swapMb) || 0))
    const dnsServers = (params.dnsServers || []).filter((d) => /^\d{1,3}(\.\d{1,3}){3}$/.test(d.trim()))
    const runcmd: string[] = ['systemctl enable --now qemu-guest-agent || true']
    if (swapMb > 0) {
      runcmd.push(
        `fallocate -l ${swapMb}M /swapfile`,
        'chmod 600 /swapfile',
        'mkswap /swapfile',
        'swapon /swapfile',
        `grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab`,
      )
    }
    if (dnsServers.length > 0) {
      const dnsLines = dnsServers.map((d) => `DNS=${d.trim()}`).join('\\n')
      runcmd.push(
        'mkdir -p /etc/systemd/network',
        `printf '[Match]\\nName=enp5s0\\n\\n[Network]\\n${dnsLines}\\n\\n[DHCPv4]\\nUseDNS=false\\n' > /etc/systemd/network/20-solstice-dns.network`,
        'systemctl restart systemd-networkd || true',
      )
    }
    const userData = `#cloud-config
${hostname ? `hostname: ${hostname}\nmanage_etc_hosts: true\n` : ''}${timezone ? `timezone: ${timezone}\n` : ''}packages:
  - openssh-server
  - qemu-guest-agent
  - curl
ssh_pwauth: true
ssh_authorized_keys:
${keysFormatted || '  []'}
users:
  - default
  - name: root
    ssh_authorized_keys:
${rootKeysFormatted || '      []'}
runcmd:
${runcmd.map((r) => `  - ${r}`).join('\n')}
`
    const cloudInitConfig = {
      'cloud-init.user-data': userData,
      'user.user-data': userData,
    }

    const body = {
      name: params.name,
      type: params.type,
      source: {
        type: 'image',
        mode: 'pull',
        server: params.server || 'https://images.linuxcontainers.org',
        protocol: 'simplestreams',
        alias: params.imageAlias || (params.type === 'virtual-machine' ? 'debian/12' : 'debian/12'),
      },
      config: {
        // Firmware mode (VMs only): Incus boots UEFI by default.
        // uefi=true forces generic UEFI (no secure boot), uefi=false
        // forces legacy BIOS via CSM.
        ...(params.type === 'virtual-machine' && params.uefi === true
          ? { 'security.csm': 'false', 'security.secureboot': 'false' }
          : {}),
        ...(params.type === 'virtual-machine' && params.uefi === false
          ? { 'security.csm': 'true', 'security.secureboot': 'false' }
          : {}),
        ...(params.type === 'virtual-machine' && params.rawQemu
          ? { 'raw.qemu': params.rawQemu }
          : {}),
        ...(params.cpu ? { 'limits.cpu': String(params.cpu) } : {}),
        ...(params.memory ? { 'limits.memory': params.memory } : {}),
        ...cloudInitConfig,
      },
      devices: {
        root: {
          path: '/',
          pool: 'default',
          type: 'disk',
          ...(params.disk ? { size: params.disk } : {}),
        },
        ...(params.network
          ? {
              eth0: {
                name: 'eth0',
                network: params.network,
                type: 'nic',
              },
            }
          : {}),
      },
    }

    const res = await incusRequest<IncusOperationMetadata>('POST', '/1.0/instances', body, 30000)
    if (res.type === 'async' && res.operation) {
      await waitOperation(res.operation, 180)
    }
    return res.metadata
  },

  /* Copy an instance (or instance/snapshot) to a new name. The source
     snapshot keeps the copy crash-consistent while running. */
  async copyInstance(source: string, newName: string) {
    const res = await incusRequest<IncusOperationMetadata>(
      'POST',
      '/1.0/instances',
      { name: newName, source: { type: 'copy', source } },
      30000,
    )
    if (res.type === 'async' && res.operation) {
      await waitOperation(res.operation, 600)
    }
    return res.metadata
  },

  async setInstanceState(name: string, action: 'start' | 'stop' | 'restart' | 'freeze' | 'unfreeze', force = false) {
    const res = await incusRequest<IncusOperationMetadata>(
      'PUT',
      `/1.0/instances/${encodeURIComponent(name)}/state`,
      { action, timeout: 30, force },
      45000,
    )
    if (res.type === 'async' && res.operation) {
      await waitOperation(res.operation, 60)
    }
    return res.metadata
  },

  async listSnapshots(name: string): Promise<Array<{ name: string; created_at: string; stateful: boolean }>> {
    const res = await incusRequest<Array<{ name: string; created_at: string; stateful: boolean }>>(
      'GET',
      `/1.0/instances/${encodeURIComponent(name)}/snapshots?recursion=1`,
    )
    return res.metadata || []
  },

  async createSnapshot(name: string, snapshotName: string, stateful = false) {
    const res = await incusRequest<IncusOperationMetadata>(
      'POST',
      `/1.0/instances/${encodeURIComponent(name)}/snapshots`,
      { name: snapshotName, stateful },
      60000,
    )
    if (res.type === 'async' && res.operation) {
      await waitOperation(res.operation, 120)
    }
    return res.metadata
  },

  async deleteSnapshot(name: string, snapshotName: string) {
    const res = await incusRequest<IncusOperationMetadata>(
      'DELETE',
      `/1.0/instances/${encodeURIComponent(name)}/snapshots/${encodeURIComponent(snapshotName)}`,
      undefined,
      60000,
    )
    if (res.type === 'async' && res.operation) {
      await waitOperation(res.operation, 120)
    }
    return res.metadata
  },

  async restoreSnapshot(name: string, snapshotName: string) {
    const res = await incusRequest<IncusOperationMetadata>(
      // PUT (full update), like the CLI: restore takes the full snapshot path.
      'PUT',
      `/1.0/instances/${encodeURIComponent(name)}`,
      { restore: `${name}/${snapshotName}` },
      30000,
    )
    if (res.type === 'async' && res.operation) {
      await waitOperation(res.operation, 180)
    }
    return res.metadata
  },

  async updateInstanceConfig(name: string, config: Record<string, string>) {
    const res = await incusRequest<IncusOperationMetadata>(
      'PATCH',
      `/1.0/instances/${encodeURIComponent(name)}`,
      { config },
      30000,
    )
    if (res.type === 'async' && res.operation) {
      await waitOperation(res.operation, 120)
    }
    return res.metadata
  },

  async renameInstance(name: string, newName: string) {
    const res = await incusRequest<IncusOperationMetadata>(
      'POST',
      `/1.0/instances/${encodeURIComponent(name)}`,
      { name: newName },
      30000,
    )
    if (res.type === 'async' && res.operation) {
      await waitOperation(res.operation, 120)
    }
    return res.metadata
  },

  async freezeInstance(name: string, frozen: boolean) {
    return this.setInstanceState(name, frozen ? 'freeze' : 'unfreeze')
  },

  /* Run a non-interactive command; resolves true when the operation succeeds.
     Output is not captured (no websocket reader); use for fire-and-set tasks. */
  /* Open one exec websocket channel and complete the HTTP upgrade. */
  async execChannel(opId: string, secret: string): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      const key = crypto.randomBytes(16).toString('base64')
      const sock = net.connect(SOCKET_PATH)
      let head = Buffer.alloc(0)
      const timer = setTimeout(() => {
        sock.destroy()
        reject(new Error('Incus websocket handshake timed out'))
      }, 15000)
      sock.on('connect', () => {
        sock.write(
          `GET /1.0/operations/${opId}/websocket?secret=${secret} HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
        )
      })
      sock.on('data', (chunk: Buffer) => {
        head = Buffer.concat([head, chunk])
        const idx = head.indexOf('\r\n\r\n')
        if (idx === -1) return
        if (!head.slice(0, idx).toString().includes('101')) {
          clearTimeout(timer)
          sock.destroy()
          reject(new Error('Incus websocket handshake failed'))
          return
        }
        clearTimeout(timer)
        resolve(sock)
      })
      sock.once('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
    })
  },

  /* Send a masked client close frame (stdin EOF for the guest). */
  execStdinEof(sock: net.Socket) {
    sock.write(Buffer.from([0x88, 0x00]))
  },

  async execInstance(name: string, command: string[], timeoutSec = 60): Promise<boolean> {
    // Websocket-mode exec: KVM guests only actually run the command once all
    // channels are attached (fire-and-forget mode silently no-ops there).
    const res = await incusRequest<{
      operation: string
    } & IncusOperationMetadata>(
      'POST',
      `/1.0/instances/${encodeURIComponent(name)}/exec`,
      {
        command,
        environment: {},
        'wait-for-websocket': true,
        interactive: false,
      },
      30000,
    )
    const opPath = res.operation || (res.metadata as unknown as string)
    if (typeof opPath !== 'string' || !opPath) return res.type === 'sync'
    const opId = opPath.split('/').pop() as string
    const fds = (res.metadata as any)?.metadata?.fds as Record<string, string> | undefined
    const sockets: net.Socket[] = []
    try {
      // Attach every channel (control + stdio); the guest starts on full attach.
      for (const key of ['control', '0', '1', '2']) {
        const secret = fds?.[key]
        if (!secret) continue
        sockets.push(await this.execChannel(opId, secret))
      }
      const stdin = sockets[1]
      if (stdin) this.execStdinEof(stdin)
      await waitOperation(opPath, timeoutSec)
      return true
    } finally {
      for (const sock of sockets) {
        try {
          sock.destroy()
        } catch {
          // ignore
        }
      }
    }
  },

  /* Read a small text file from the instance (raw bytes, not JSON). */
  async readInstanceFile(name: string, filePath: string, timeoutMs = 15000): Promise<string | null> {
    return new Promise((resolve) => {
      const req = http.request(
        {
          socketPath: SOCKET_PATH,
          path: `/1.0/instances/${encodeURIComponent(name)}/files?path=${encodeURIComponent(filePath)}`,
          method: 'GET',
          headers: { Host: 'localhost' },
          timeout: timeoutMs,
        },
        (res) => {
          let raw = ''
          res.setEncoding('utf8')
          res.on('data', (chunk) => {
            raw += chunk
            // Log files stay small; bail out rather than buffering forever.
            if (raw.length > 64 * 1024) req.destroy()
          })
          res.on('end', () => {
            resolve(res.statusCode && res.statusCode < 400 ? raw : null)
          })
        },
      )
      req.on('timeout', () => req.destroy())
      req.on('error', () => resolve(null))
      req.end()
    })
  },

  /* Devices are managed read-modify-write: fetch the instance, merge the
     devices map, and PUT it back (mirrors what the CLI does). */
  async mergeInstanceDevices(name: string, mutate: (devices: Record<string, Record<string, string>>) => void) {
    const current = await this.getInstance(name)
    const devices: Record<string, Record<string, string>> = { ...(current.devices || {}) }
    mutate(devices)
    const res = await incusRequest<IncusOperationMetadata>(
      'PUT',
      `/1.0/instances/${encodeURIComponent(name)}`,
      {
        architecture: (current as any).architecture,
        config: current.config,
        devices,
        ephemeral: (current as any).ephemeral,
        profiles: (current as any).profiles,
      },
      30000,
    )
    if (res.type === 'async' && res.operation) {
      await waitOperation(res.operation, 60)
    }
    return res.metadata
  },

  /* Network ACLs (firewall). Rules live inside the ACL object: read, modify
     the egress/ingress arrays, and PUT the whole object back. */
  async getNetworkAcl(name: string): Promise<{
    name: string
    description: string
    egress: Array<Record<string, string>>
    ingress: Array<Record<string, string>>
  } | null> {
    try {
      const res = await incusRequest<any>('GET', `/1.0/network-acls/${encodeURIComponent(name)}`)
      const md = res.metadata || {}
      return {
        name: md.name || name,
        description: md.description || '',
        egress: md.egress || [],
        ingress: md.ingress || [],
      }
    } catch (err: any) {
      if (/not found/i.test(err?.message || '')) return null
      throw err
    }
  },

  async createNetworkAcl(
    name: string,
    rules: { egress: Array<Record<string, string>>; ingress: Array<Record<string, string>> },
  ) {
    const res = await incusRequest<IncusOperationMetadata>(
      'POST',
      '/1.0/network-acls',
      { name, description: `Panel firewall (${name})`, egress: rules.egress, ingress: rules.ingress },
      30000,
    )
    if (res.type === 'async' && res.operation) {
      await waitOperation(res.operation, 60)
    }
    return res.metadata
  },

  async updateNetworkAcl(
    name: string,
    rules: { egress: Array<Record<string, string>>; ingress: Array<Record<string, string>> },
  ) {
    const res = await incusRequest<IncusOperationMetadata>(
      'PUT',
      `/1.0/network-acls/${encodeURIComponent(name)}`,
      { egress: rules.egress, ingress: rules.ingress },
      30000,
    )
    if (res.type === 'async' && res.operation) {
      await waitOperation(res.operation, 60)
    }
    return res.metadata
  },

  async deleteNetworkAcl(name: string) {
    const res = await incusRequest<IncusOperationMetadata>(
      'DELETE',
      `/1.0/network-acls/${encodeURIComponent(name)}`,
      undefined,
      30000,
    )
    if (res.type === 'async' && res.operation) {
      await waitOperation(res.operation, 60)
    }
    return res.metadata
  },

  async addInstanceDevice(name: string, deviceName: string, device: Record<string, string>) {
    return this.mergeInstanceDevices(name, (devices) => {
      devices[deviceName] = device
    })
  },

  async deleteInstanceDevice(name: string, deviceName: string) {
    return this.mergeInstanceDevices(name, (devices) => {
      delete devices[deviceName]
    })
  },

  async deleteInstance(name: string) {
    const res = await incusRequest<IncusOperationMetadata>(
      'DELETE',
      `/1.0/instances/${encodeURIComponent(name)}`,
      undefined,
      30000,
    )
    if (res.type === 'async' && res.operation) {
      await waitOperation(res.operation, 60)
    }
    return res.metadata
  },
}
