import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser'

export interface ApiUser {
  id: string
  email: string
  name: string
  avatarUrl: string | null
  emailVerifiedAt: string | null
  isAdmin?: boolean
  createdAt: string
}

export interface AdminUser extends ApiUser {
  instanceCount: number
  sshKeyCount: number
}

export interface AdminInstance extends ApiInstance {
  ownerId: string
  ownerEmail: string
  ownerName: string
}

export interface AdminStats {
  totals: {
    users: number
    admins: number
    instances: number
    cores: number
    memory: string
    diskGb: number
  }
  node: {
    daemon: string
    version: string
    os: string
    kernel: string
    driver: string
    cpuModel?: string
    hostMemory?: {
      usedMb: number
      totalMb: number
      percent: number
    }
    databaseVersion?: string
    status: string
    uptimeSeconds?: number
    loadAvg?: [number, number, number]
  }
}

export type LoginResponse = { ok: true; needsName?: boolean }

export interface ApiActivity {
  id: string
  action: string
  details: string
  ipAddress: string | null
  createdAt: string
}

export interface ApiEmailLog {
  id: string
  recipient: string
  subject: string
  bodyText: string
  status: string
  createdAt: string
}

export interface ApiInstance {
  id: string
  name: string
  type: 'kvm' | 'lxc'
  os: string
  status: 'running' | 'stopped'
  ip4: string
  ip6: string
  cores: number
  memory: string
  disk: string
  uptime: string
  region: string
  cpuUsage: number
  ramUsage: number
  bandwidth: string
  createdAt: string
}

export interface ApiNetworkInterface {
  interface: string
  hwaddr: string
  state: string
  ip4: string
  ip6: string
  rxFormatted: string
  txFormatted: string
}

export interface ApiInstanceDetail extends ApiInstance {
  memoryMb: number
  diskGb: number
  imageAlias: string
  networkInterfaces: ApiNetworkInterface[]
}

export interface ApiSshKey {
  id: string
  name: string
  publicKey: string
  fingerprint: string
  createdAt: string
}

export interface ApiNodeStats {
  resources: {
    totalInstances: number
    totalCores: number
    totalMemory: string
    totalDiskGb: number
  }
  node: {
    daemon: string
    version: string
    os: string
    kernel: string
    driver: string
    status: string
  }
}

export interface ApiSession {
  createdAt: string
  expiresAt: string
}

/** A move to a new address that is waiting on a code sent to that address. */
export interface PendingEmailChange {
  email: string
  expiresAt: string
}

/** A registered passkey. The public key and credential id stay on the server. */
export interface ApiPasskey {
  id: string
  name: string
  backedUp: boolean
  createdAt: string
  lastUsedAt: string | null
}

export interface ApiError {
  message?: string
  fieldErrors?: Record<string, string>
  /** Machine-readable discriminator, e.g. `email_unverified` on a blocked login. */
  code?: string
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: ApiError }

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

async function request<T>(path: string, init: RequestInit = {}): Promise<Result<T>> {
  let response: Response

  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      ...init,
      headers: {
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
    })
  } catch (err) {
    console.error('[api network error]', path, err)
    return { ok: false, error: { message: 'Could not reach the server. Check your connection.' } }
  }

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>

  if (!response.ok) {
    return { ok: false, error: payload as ApiError }
  }

  return { ok: true, data: payload as T }
}

function post<T>(path: string, body?: unknown) {
  return request<T>(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export const api = {
  register(input: { name: string; email: string }) {
    return post<{ email: string }>('/api/auth/register', input)
  },

  verifyEmail(input: { email: string; code: string }) {
    return post<{ user: ApiUser }>('/api/auth/verify-email', input)
  },

  verifyEmailLink(input: { token: string }) {
    return post<{ user: ApiUser }>('/api/auth/verify-email/link', input)
  },

  resendVerification(input: { email: string }) {
    return post<{ ok: true }>('/api/auth/resend-verification', input)
  },

  login(input: { email: string; name?: string; remember?: boolean }) {
    return post<LoginResponse>('/api/auth/login', input)
  },

  loginVerify(input: { email: string; code: string }) {
    return post<{ user: ApiUser }>('/api/auth/login/verify', input)
  },

  loginLink(input: { token: string }) {
    return post<{ user: ApiUser }>('/api/auth/login/link', input)
  },

  loginResend(input: { email: string; remember?: boolean }) {
    return post<{ ok: true }>('/api/auth/login/resend', input)
  },

  logout() {
    return post<{ ok: true }>('/api/auth/logout')
  },

  me() {
    return request<{ user: ApiUser; session: ApiSession }>('/api/auth/me')
  },

  accountUpdate(input: { name?: string; avatarUrl?: string | null }) {
    return request<{ user: ApiUser }>('/api/auth/account', {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },

  pendingEmailChange() {
    return request<{ pending: PendingEmailChange | null }>('/api/auth/change-email')
  },

  changeEmail(input: { email: string }) {
    return post<{ pending: PendingEmailChange }>('/api/auth/change-email', input)
  },

  changeEmailVerify(input: { code: string }) {
    return post<{ user: ApiUser }>('/api/auth/change-email/verify', input)
  },

  cancelEmailChange() {
    return post<{ ok: true }>('/api/auth/change-email/cancel')
  },

  cancelEmailChangeByToken(input: { token: string }) {
    return post<{ ok: true }>('/api/auth/change-email/cancel-link', input)
  },

  listPasskeys() {
    return request<{ passkeys: ApiPasskey[] }>('/api/auth/passkeys')
  },

  passkeyRegisterOptions() {
    return post<{ options: PublicKeyCredentialCreationOptionsJSON }>(
      '/api/auth/passkeys/register/options',
    )
  },

  passkeyRegisterVerify(input: { response: RegistrationResponseJSON; name: string }) {
    return post<{ passkey: ApiPasskey | null }>('/api/auth/passkeys/register/verify', input)
  },

  passkeyLoginOptions() {
    return post<{ options: PublicKeyCredentialRequestOptionsJSON }>(
      '/api/auth/passkeys/login/options',
    )
  },

  passkeyLoginVerify(input: { response: AuthenticationResponseJSON; remember?: boolean }) {
    return post<{ user: ApiUser }>('/api/auth/passkeys/login/verify', input)
  },

  removePasskey(input: { id: string }) {
    return post<{ ok: true }>(`/api/auth/passkeys/${encodeURIComponent(input.id)}/remove`)
  },

  listSessions() {
    return request<{ sessions: { id: string; isCurrent: boolean; userAgent: string | null; createdAt: string; expiresAt: string }[] }>('/api/auth/sessions')
  },

  listActivities(params?: { limit?: number; offset?: number }) {
    const q = new URLSearchParams()
    if (params?.limit) q.set('limit', String(params.limit))
    if (params?.offset) q.set('offset', String(params.offset))
    const query = q.toString() ? `?${q.toString()}` : ''
    return request<{ total: number; activities: ApiActivity[] }>(`/api/auth/activity${query}`)
  },

  listEmails(params?: { limit?: number; offset?: number }) {
    const q = new URLSearchParams()
    if (params?.limit) q.set('limit', String(params.limit))
    if (params?.offset) q.set('offset', String(params.offset))
    const query = q.toString() ? `?${q.toString()}` : ''
    return request<{ total: number; emails: ApiEmailLog[] }>(`/api/auth/emails${query}`)
  },

  clearEmails() {
    return request<{ ok: true }>('/api/auth/emails', { method: 'DELETE' })
  },

  deleteEmail(id: string) {
    return request<{ ok: true }>(`/api/auth/emails/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },

  revokeSession(id: string) {
    return request<{ ok: true }>(`/api/auth/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },

  requestAccountDeletion() {
    return post<{ ok: true; email: string }>('/api/auth/delete-account/request')
  },

  deleteAccount(input: { code: string; confirmation: string }) {
    return request<{ ok: true }>('/api/auth/account', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  },

  exportData() {
    return request<Record<string, unknown>>('/api/auth/export-data')
  },

  listInstances() {
    return request<{ instances: ApiInstance[] }>('/api/instances')
  },

  createInstance(input: {
    name: string
    type: 'kvm' | 'lxc'
    os: string
    cores?: number
    memoryMb?: number
    diskGb?: number
  }) {
    return post<ApiInstance>('/api/instances', input)
  },

  instanceAction(id: string, action: 'start' | 'stop' | 'restart') {
    return post<{ ok: true; action: string }>(`/api/instances/${encodeURIComponent(id)}/action`, { action })
  },

  deleteInstance(id: string) {
    return request<{ ok: true }>(`/api/instances/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },

  getInstance(id: string) {
    return request<{ instance: ApiInstanceDetail }>(`/api/instances/${encodeURIComponent(id)}`)
  },

  getInstanceStats() {
    return request<ApiNodeStats>('/api/instances/stats')
  },

  listSshKeys() {
    return request<{ keys: ApiSshKey[] }>('/api/auth/ssh-keys')
  },

  addSshKey(input: { name: string; publicKey: string }) {
    return post<ApiSshKey>('/api/auth/ssh-keys', input)
  },

  deleteSshKey(id: string) {
    return request<{ ok: true }>(`/api/auth/ssh-keys/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },

  /* ── Admin endpoints ─────────────────────────────────────────────────── */

  adminListUsers() {
    return request<AdminUser[]>('/api/admin/users')
  },

  adminUpdateUserRole(id: string, isAdmin: boolean) {
    return request<ApiUser>(`/api/admin/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ isAdmin }),
    })
  },

  adminDeleteUser(id: string) {
    return request<{ ok: true }>(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },

  adminListInstances() {
    return request<AdminInstance[]>('/api/admin/instances')
  },

  adminCreateInstance(input: {
    userId: string
    name: string
    type: 'kvm' | 'lxc'
    os: string
    cores?: number
    memoryMb?: number
    diskGb?: number
  }) {
    return post<ApiInstance>('/api/admin/instances', input)
  },

  adminInstanceAction(id: string, action: 'start' | 'stop' | 'restart') {
    return post<{ ok: true; action: string }>(`/api/admin/instances/${encodeURIComponent(id)}/action`, { action })
  },

  adminDeleteInstance(id: string) {
    return request<{ ok: true }>(`/api/admin/instances/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },

  adminStats() {
    return request<AdminStats>('/api/admin/stats')
  },
}
