import http from 'node:http'

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
  }) {
    let cloudInitConfig: Record<string, string> = {}
    if (params.sshKeys && params.sshKeys.length > 0) {
      const keysFormatted = params.sshKeys.map((k) => `  - ${k.trim()}`).join('\n')
      const rootKeysFormatted = params.sshKeys.map((k) => `      - ${k.trim()}`).join('\n')
      const userData = `#cloud-config
ssh_pwauth: true
ssh_authorized_keys:
${keysFormatted}
users:
  - default
  - name: root
    ssh_authorized_keys:
${rootKeysFormatted}
`
      cloudInitConfig = {
        'cloud-init.user-data': userData,
        'user.user-data': userData,
      }
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
      },
    }

    const res = await incusRequest<IncusOperationMetadata>('POST', '/1.0/instances', body, 30000)
    if (res.type === 'async' && res.operation) {
      await waitOperation(res.operation, 180)
    }
    return res.metadata
  },

  async setInstanceState(name: string, action: 'start' | 'stop' | 'restart', force = false) {
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
