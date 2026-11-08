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
  username?: string | null
  firstName?: string | null
  lastName?: string | null
  language?: string | null
  externalId?: string | null
  isFrozen?: boolean
  isSuspended?: boolean
  themeMode?: string | null
  themePreset?: string | null
  avatarUrl: string | null
  emailVerifiedAt: string | null
  isAdmin?: boolean
  portForwardLimit?: number | null
  createdAt: string
}

export interface AdminUser extends ApiUser {
  instanceCount: number
  sshKeyCount: number
  passkeyCount?: number
  forwardCount?: number
}

export interface OAuthProvider {
  id: string
  name: string
  description: string
  clientId: string
  clientSecret: string
  authUrl: string
  tokenUrl: string
  infoUrl: string
  basicAuth: boolean
  scopes: string
  identifierPath: string
  emailPath: string
  usernamePath: string
  firstNamePath: string
  lastNamePath: string
  avatarUrlTemplate: string
  overwriteAvatars: boolean
  loginOnly: boolean
  linkViewable: boolean
  userManageable: boolean
  enabled: boolean
  createdAt: string
  updatedAt: string
  linkCount?: number
}

export interface PublicOAuthProvider {
  id: string
  name: string
  description: string
}

export interface GlobalSnapshot {
  instanceId: string
  instanceName: string
  name: string
  createdAt: string
  stateful: boolean
}

export interface PortForward {
  id: string
  kind: 'ssh' | 'custom' | string
  instanceId: string
  instanceName: string
  hostPort: number
  containerPort: number
  protocol: string
  description: string
  createdAt: string
}

export interface OAuthLink {
  id: string
  providerId: string
  providerName: string
  identifier: string | null
  userManageable: boolean
  createdAt: string
  lastUsedAt: string | null
}

export interface ActivityEntry {
  id: string
  action: string
  details: string
  ipAddress: string | null
  createdAt: string
  user: {
    id: string
    name: string
    email: string
    avatarUrl: string | null
  } | null
}

export interface OsTemplate {
  id: string
  groupId?: string | null
  groupName?: string | null
  groupLogo?: string | null
  name: string
  version?: string
  os: string
  release: string
  arch: string
  variant: string
  imageAlias: string
  cloudInit?: boolean
  uefi?: boolean
  description?: string
  eolDate?: string | null
  eolAction?: string
  eolActionDays?: number
  eolWarning?: string
  eolWarningDays?: number
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface OsCatalogEntry {
  os: string
  release: string
  arch: string
  variant: string
  alias: string
}

export interface AdminInstance extends ApiInstance {
  ownerId: string
  ownerEmail: string
  ownerName: string
  nodeName?: string | null
}

export interface InstanceSnapshot {
  name: string
  createdAt: string
  stateful: boolean
}

export interface AdminInstanceDetail {
  id: string
  name: string
  type: 'kvm' | 'lxc'
  os: string
  imageAlias: string
  status: 'running' | 'stopped'
  ip4: string
  ip6: string
  cores: number
  memoryMb: number
  diskGb: number
  networkMode: string
  cpuUsage: number | null
  ramUsage: number | null
  diskUsage: number | null
  uptime: string
  bandwidth: string
  portForwards: Array<{
    hostPort: number
    containerPort: number
    protocol: string
    description: string
    kind: string
  }>
  owner: { id: string; email: string; name: string }
  node: { id: string | null; name: string; fqdn: string | null } | null
  locationShortCode: string | null
  suspendReason?: string | null
  networkInterfaces: Array<{
    interface: string
    hwaddr: string
    state: string
    ip4: string
    ip6: string
  }>
  snapshots: InstanceSnapshot[]
  createdAt: string
}

export interface PublicConfig {
  name: string
  tagline?: string
  language: string
  icon: string
  banner: string
  url: string
  enableRegistration: boolean
  requireEmailVerification: boolean
  enableSecurityKeys?: boolean
  allowUsernamelessLogin?: boolean
  metaDescription?: string
  metaPreviewImage?: string
  metaTwitterCard?: string
  metaThemeColor?: string
  metaAllowIndexing?: boolean
  captchaProvider?: 'none' | 'turnstile' | 'recaptcha' | 'recaptcha_v2' | 'recaptcha_v3' | 'hcaptcha' | 'friendly_captcha' | 'trycap'
  captchaSiteKey?: string
  captchaApiUrl?: string
  legalTermsUrl?: string
  legalPrivacyUrl?: string
  legalAupUrl?: string
  themePreset?: string
  themeAccentColor?: string
  themeSurfaceStyle?: string
  themeRadius?: string
  themeFont?: string
  themeCustomCss?: string
  themeDefaultMode?: string
}

export interface AdminThemeSettings {
  preset: string
  accentColor: string
  surfaceStyle: string
  radius: string
  font: string
  customCss: string
  defaultMode: string
}

export interface AdminSettings {
  application: {
    name: string
    tagline: string
    language: string
    icon: string
    banner: string
    url: string
    requireEmailVerification: boolean
    enableRegistration: boolean
    environment: string
    trustProxy: boolean
    adminEmails: string[]
  }
  metadata: {
    description: string
    previewImage: string
    twitterCard: string
    themeColor: string
    allowIndexing: boolean
  }
  legal: {
    termsUrl: string
    privacyUrl: string
    aupUrl: string
  }
  mail: {
    provider: string
    mailFrom: string
    mailFromName: string
    smtpHost: string
    smtpPort: number
    smtpUser: string
    smtpPass: string
    tlsMode: string
    skipCertValidation: boolean
    heloDomain: string
    sendmailPath: string
  }
  storage: {
    driver: string
    s3AccessKey: string
    s3SecretKey: string
    s3Bucket: string
    s3Region: string
    s3Endpoint: string
    s3PublicUrl: string
    s3ForcePathStyle: boolean
  }
  webauthn: {
    enableSecurityKeys: boolean
    allowUsernamelessLogin: boolean
    rpName: string
    rpId: string
    origin: string
    authenticationTimeout: number
    registrationTimeout: number
  }
  captcha: {
    provider: 'none' | 'turnstile' | 'recaptcha' | 'recaptcha_v2' | 'recaptcha_v3' | 'hcaptcha' | 'friendly_captcha' | 'trycap'
    siteKey: string
    secretKey: string
    apiUrl: string
  }
  ratelimits: {
    store: string
    windowMs: number
    maxRequestsPerMin: number
  }
  network: {
    portRangeStart: number
    portRangeEnd: number
    defaultForwardLimit: number
  }
  theme: AdminThemeSettings
}

export interface ApiAnnouncement {
  id: string
  type: 'info' | 'warning' | 'danger' | 'success' | string
  title: string
  content: string
  enabled: boolean
  dismissible: boolean
  enabledStart?: string | null
  enabledEnd?: string | null
  dismissibleEnd?: string | null
  createdAt: string
  updatedAt?: string
}

export interface ApiAssetItem {
  name: string
  path: string
  isDir: boolean
  size: number
  createdAt: string
  url: string
}

export interface ApiNode {
  id: string
  name: string
  displayName?: string
  cpuModel?: string
  cpuDisplay?: string
  fqdn: string
  ipAddress: string
  publicIp?: string
  port?: number
  locationId?: string | null
  isPublic?: boolean
  maintenance?: boolean
  memoryLimitMb?: number
  memoryMb?: number
  diskLimitGb?: number
  diskGb?: number
  serverLimit?: number
  cpuCores?: number
  locationShortCode?: string
  locationName?: string
  locationCountryCode?: string
  locationCity?: string
  createdAt?: string
}

export interface ApiLocation {
  id: string
  shortCode: string
  name: string
  description: string
  countryCode: string
  city: string
  nodeCount: number
  nodes: ApiNode[]
  createdAt: string
  updatedAt: string
}

export interface AdminStats {
  totals: {
    users: number
    admins: number
    instances: number
    cores: number
    memory: string
    diskGb: number
    nodes?: number
  }
  node: {
    daemon: string
    version: string
    os: string
    kernel: string
    driver: string
    socketPath?: string
    incusOnline?: boolean
    cpuModel?: string
    hostMemory?: {
      usedMb: number
      totalMb: number
      percent: number
    }
    databaseVersion?: string
    databaseTarget?: string
    mailTransport?: string
    mailTarget?: string
    status: string
    uptimeSeconds?: number
    loadAvg?: [number, number, number]
  }
}

export type LoginResponse = { ok: true; needsName?: boolean; directLogin?: boolean; user?: ApiUser }

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
  suspended?: boolean
  owner: { id: string; email: string; name: string }
  type: 'kvm' | 'lxc'
  os: string
  status: 'running' | 'stopped' | 'frozen'
  ip4: string
  ip6: string
  cores: number
  memory: string
  disk: string
  diskGb: number
  /** Null while stopped, unavailable from the daemon, or before a second CPU sample. */
  diskUsage: number | null
  nodeName?: string | null
  uptime: string
  region: string
  /** Null under the same conditions as diskUsage. */
  cpuUsage: number | null
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
  owner: { id: string; email: string; name: string }
  memoryMb: number
  diskGb: number
  imageAlias: string
  nodeName?: string | null
  cpuModel?: string | null
  suspendReason?: string | null
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
        ...(init.body && !(init.body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
    })
  } catch (err) {
    console.error('[api network error]', path, err)
    return { ok: false, error: { message: 'Could not reach the server. Check your connection.' } }
  }

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>

  if (!response.ok) {
    const error = payload as ApiError
    if (!error.message) {
      error.message = `Request failed (${response.status})`
    }
    return { ok: false, error }
  }

  return { ok: true, data: payload as T }
}

function post<T>(path: string, body?: unknown) {
  return request<T>(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function patch<T>(path: string, body?: unknown) {
  return request<T>(path, {
    method: 'PATCH',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export interface OsGroupItem {
  id: string
  name: string
  description: string
  logo: string
  enabled: boolean
  createdAt: string
  updatedAt: string
  templates?: any[]
}

export const api = {
  register(input: { name: string; email: string; captchaToken?: string }) {
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

  login(input: { email: string; name?: string; remember?: boolean; captchaToken?: string }) {
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

  upload(input: { dataUrl?: string; folder?: 'avatars' | 'assets' | 'publicdata'; filename?: string; file?: File }) {
    if (input.file) {
      const form = new FormData()
      form.append('file', input.file)
      if (input.folder) form.append('folder', input.folder)
      return request<{ ok: true; url: string; key: string }>('/api/upload', {
        method: 'POST',
        body: form,
      })
    }
    return post<{ ok: true; url: string; key: string }>('/api/upload', {
      dataUrl: input.dataUrl,
      folder: input.folder,
      filename: input.filename,
    })
  },

  accountUpdate(input: { name?: string; avatarUrl?: string | null; themeMode?: string; themePreset?: string }) {
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

  passkeyLoginOptions(input?: { email?: string }) {
    return post<{ options: PublicKeyCredentialRequestOptionsJSON }>(
      '/api/auth/passkeys/login/options',
      input ?? {},
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

  listInstances(scope?: 'all') {
    return request<{ instances: ApiInstance[] }>(
      scope === 'all' ? '/api/instances?scope=all' : '/api/instances',
    )
  },

  createInstance(input: {
    name: string
    type: 'kvm' | 'lxc'
    os?: string
    templateId?: string
    imageAlias?: string
    cores?: number
    memoryMb?: number
    diskGb?: number
    hostname?: string
    timezone?: string
    swapMb?: number
    dnsServers?: string[]
    sshKeyIds?: string[]
    directSsh?: boolean
  }) {
    return post<ApiInstance & { sshHostPort?: number | null; passwordEmailed?: boolean }>('/api/instances', input)
  },

  rebuildInstance(id: string, input: {
    name?: string
    templateId: string
    hostname?: string
    timezone?: string
    swapMb?: number
    dnsServers?: string[]
    sshKeyIds?: string[]
    directSsh?: boolean
  }) {
    return post<{ id: string; name: string; os: string; sshHostPort?: number | null; passwordEmailed?: boolean }>(`/api/instances/${encodeURIComponent(id)}/rebuild`, input)
  },

  installOs(id: string, input: {
    templateId: string
    hostname?: string
    timezone?: string
    swapMb?: number
    dnsServers?: string[]
    sshKeyIds?: string[]
    directSsh?: boolean
  }) {
    return post<{ id: string; name: string; os: string; sshHostPort?: number | null; passwordEmailed?: boolean }>(`/api/instances/${encodeURIComponent(id)}/install-os`, input)
  },

  instanceAction(id: string, action: 'start' | 'stop' | 'restart' | 'freeze' | 'unfreeze', force = false) {
    return post<{ ok: true; action: string }>(`/api/instances/${encodeURIComponent(id)}/action`, {
      action,
      force,
    })
  },

  listOsTemplates() {
    return request<{ templates: Array<{ id: string; name: string; imageAlias: string; arch: string }> }>('/api/instances/os-templates')
  },

  deleteInstance(id: string) {
    return request<{ ok: true }>(`/api/instances/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },

  getInstance(id: string) {
    return request<{ instance: ApiInstanceDetail }>(`/api/instances/${encodeURIComponent(id)}`)
  },

  getUsage(hours = 24) {
    return request<{
      hours: number
      servers: Array<{
        id: string
        name: string
        points: Array<{
          t: string
          cpu: number | null
          ram: number
          disk: number | null
          rx: number
          tx: number
        }>
      }>
    }>(`/api/usage?hours=${encodeURIComponent(String(hours))}`)
  },

  listAllSnapshots() {
    return request<{ snapshots: GlobalSnapshot[]; unreachable: string[] }>('/api/snapshots')
  },

  getFirewall(id: string) {
    return request<{
      enabled: boolean
      rules: Array<{
        direction: 'ingress' | 'egress'
        index: number
        action: string
        protocol: string
        ports: string
        remote: string
        state: string
      }>
    }>(`/api/instances/${encodeURIComponent(id)}/firewall`)
  },

  toggleFirewall(id: string, enabled: boolean) {
    return post<{
      enabled: boolean
      rules: Array<{
        direction: 'ingress' | 'egress'
        index: number
        action: string
        protocol: string
        ports: string
        remote: string
        state: string
      }>
    }>(`/api/instances/${encodeURIComponent(id)}/firewall/toggle`, { enabled })
  },

  addFirewallRule(
    id: string,
    input: { direction: string; action: string; protocol?: string; ports?: string; remote?: string },
  ) {
    return post<{
      enabled: boolean
      rules: Array<{
        direction: 'ingress' | 'egress'
        index: number
        action: string
        protocol: string
        ports: string
        remote: string
        state: string
      }>
    }>(`/api/instances/${encodeURIComponent(id)}/firewall/rules`, input)
  },

  deleteFirewallRule(id: string, input: { direction: string; index: number }) {
    return request<{
      enabled: boolean
      rules: Array<{
        direction: 'ingress' | 'egress'
        index: number
        action: string
        protocol: string
        ports: string
        remote: string
        state: string
      }>
    }>(`/api/instances/${encodeURIComponent(id)}/firewall/rules`, {
      method: 'DELETE',
      body: JSON.stringify(input),
    })
  },

  getSnapshotSchedule(id: string) {
    return request<{ enabled: boolean; schedule: string; expiryDays: number }>(
      `/api/instances/${encodeURIComponent(id)}/snapshot-schedule`,
    )
  },

  setSnapshotSchedule(id: string, input: { schedule: string; expiryDays: number }) {
    return request<{ enabled: boolean; schedule: string; expiryDays: number }>(
      `/api/instances/${encodeURIComponent(id)}/snapshot-schedule`,
      { method: 'PUT', body: JSON.stringify(input) },
    )
  },

  listSnapshots(id: string) {
    return request<{ snapshots: InstanceSnapshot[] }>(`/api/instances/${encodeURIComponent(id)}/snapshots`)
  },

  createSnapshot(id: string, name: string) {
    return post<{ ok: true; name: string }>(`/api/instances/${encodeURIComponent(id)}/snapshots`, { name })
  },

  restoreSnapshot(id: string, snap: string) {
    return post<{ ok: true }>(`/api/instances/${encodeURIComponent(id)}/snapshots/${encodeURIComponent(snap)}/restore`)
  },

  deleteSnapshot(id: string, snap: string) {
    return request<{ ok: true }>(`/api/instances/${encodeURIComponent(id)}/snapshots/${encodeURIComponent(snap)}`, { method: 'DELETE' })
  },

  renameInstance(id: string, name: string) {
    return patch<{ ok: true; name: string }>(`/api/instances/${encodeURIComponent(id)}`, { name })
  },

  reinstallInstance(id: string, templateId?: string) {
    return post<{ ok: true; os: string }>(`/api/instances/${encodeURIComponent(id)}/reinstall`, { templateId })
  },

  cloneInstance(id: string, name: string) {
    return post<{ ok: true; id: string; name: string }>(`/api/instances/${encodeURIComponent(id)}/clone`, { name })
  },

  generateSshPassword(id: string) {
    return post<{ ok: true; username: string; emailed: boolean }>(`/api/instances/${encodeURIComponent(id)}/ssh-password`)
  },

  getInstanceActivity(id: string) {
    return request<{ tasks: Array<{ id: string; action: string; details: string; ip_address: string | null; created_at: string; status?: string }> }>(`/api/instances/${encodeURIComponent(id)}/activity`)
  },

  getSshForward(id: string) {
    return request<{ forward: { host: string; hostPort: number; containerPort: number; username: string } | null }>(`/api/instances/${encodeURIComponent(id)}/ssh-forward`)
  },

  enableSshForward(id: string) {
    return post<{ ok: true; host: string; hostPort: number; username: string; emailed: boolean }>(`/api/instances/${encodeURIComponent(id)}/ssh-forward`)
  },

  disableSshForward(id: string) {
    return request<{ ok: true }>(`/api/instances/${encodeURIComponent(id)}/ssh-forward`, { method: 'DELETE' })
  },

  startSshSession(id: string) {
    return post<{ ok: true; url: string }>(`/api/instances/${encodeURIComponent(id)}/ssh-session`)
  },

  stopSshSession(id: string) {
    return request<{ ok: true }>(`/api/instances/${encodeURIComponent(id)}/ssh-session`, { method: 'DELETE' })
  },

  listPortForwards() {
    return request<{
      host: string
      range: { start: number; end: number; allocated: number }
      used: number
      quota: { used: number; limit: number }
      forwards: PortForward[]
    }>('/api/port-forwards')
  },

  createPortForward(id: string, input: { containerPort: number; protocol?: string; description?: string }) {
    return post<{
      ok: true
      host: string
      hostPort: number
      containerPort: number
      protocol: string
      description: string
    }>(`/api/instances/${encodeURIComponent(id)}/port-forwards`, input)
  },

  deletePortForward(id: string, forwardId: string) {
    return request<{ ok: true }>(
      `/api/instances/${encodeURIComponent(id)}/port-forwards/${encodeURIComponent(forwardId)}`,
      { method: 'DELETE' },
    )
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

  adminGetUser(id: string) {
    return request<AdminUser>(`/api/admin/users/${encodeURIComponent(id)}`)
  },

  adminCreateUser(input: {
    email: string
    name: string
    externalId?: string | null
    isAdmin?: boolean
    isFrozen?: boolean
    isSuspended?: boolean
    emailVerified?: boolean
  }) {
    return request<AdminUser>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  adminListPortForwards() {
    return request<{
      forwards: Array<{
        id: string
        kind: string
        host: string
        hostPort: number
        containerPort: number
        protocol: string
        description: string
        createdAt: string
        instance: { id: string; name: string; type: string }
        owner: { id: string; email: string; name: string }
      }>
    }>('/api/admin/port-forwards')
  },

  listApiKeys() {
    return request<{
      keys: Array<{
        id: string
        name: string
        prefix: string
        lastUsedAt: string | null
        expiresAt: string | null
        createdAt: string
      }>
    }>('/api/api-keys')
  },

  createApiKey(input: { name: string; expiresInDays?: number }) {
    return post<{
      id: string
      name: string
      prefix: string
      token: string
      expiresAt: string | null
      createdAt: string
    }>('/api/api-keys', input)
  },

  revokeApiKey(id: string) {
    return request<{ ok: true }>(`/api/api-keys/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },

  adminDeletePortForward(id: string) {
    return request<{ ok: true }>(`/api/admin/port-forwards/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },

  adminUpdateUser(id: string, input: Partial<{
    isAdmin: boolean
    username: string | null
    name: string
    firstName: string | null
    lastName: string | null
    language: string
    externalId: string | null
    isFrozen: boolean
    isSuspended: boolean
    emailVerified: boolean
    portForwardLimit: number | null
  }>) {
    return request<ApiUser>(`/api/admin/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
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

  adminDisableUser2FA(id: string) {
    return request<{ ok: true; removed: number }>(`/api/admin/users/${encodeURIComponent(id)}/disable-2fa`, {
      method: 'POST',
    })
  },

  listOAuthProviders() {
    return request<PublicOAuthProvider[]>('/api/auth/oauth/providers')
  },

  adminListOAuthProviders() {
    return request<OAuthProvider[]>('/api/admin/oauth/providers')
  },

  adminCreateOAuthProvider(input: Partial<OAuthProvider>) {
    return post<OAuthProvider>('/api/admin/oauth/providers', input)
  },

  adminImportOAuthProvider(content: string) {
    return post<OAuthProvider>('/api/admin/oauth/providers/import', { content })
  },

  adminUpdateOAuthProvider(id: string, input: Partial<OAuthProvider>) {
    return patch<OAuthProvider>(`/api/admin/oauth/providers/${encodeURIComponent(id)}`, input)
  },

  adminDeleteOAuthProvider(id: string) {
    return request<{ ok: true }>(`/api/admin/oauth/providers/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },

  startOAuth(id: string, mode: 'login' | 'link' = 'login') {
    return request<{ url: string }>(`/api/auth/oauth/${encodeURIComponent(id)}/start?mode=${mode}`)
  },

  listOAuthLinks() {
    return request<{ links: OAuthLink[] }>('/api/auth/oauth/links')
  },

  deleteOAuthLink(id: string) {
    return request<{ ok: true }>(`/api/auth/oauth/links/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },

  adminGetUserActivity(id: string, limit = 50, offset = 0) {
    return request<{ total: number; activities: Array<{ id: string; action: string; details: string; ipAddress: string | null; createdAt: string }> }>(
      `/api/admin/users/${encodeURIComponent(id)}/activity?limit=${limit}&offset=${offset}`,
    )
  },

  adminGetUserOAuthLinks(id: string) {
    return request<{ links: OAuthLink[] }>(`/api/admin/users/${encodeURIComponent(id)}/oauth-links`)
  },

  adminAddUserOAuthLink(id: string, input: { providerId: string; identifier: string }) {
    return post<{ ok: true }>(`/api/admin/users/${encodeURIComponent(id)}/oauth-links`, input)
  },

  adminDeleteUserOAuthLink(id: string, linkId: string) {
    return request<{ ok: true }>(
      `/api/admin/users/${encodeURIComponent(id)}/oauth-links/${encodeURIComponent(linkId)}`,
      { method: 'DELETE' },
    )
  },

  adminListActivity(input: { q?: string; userId?: string; limit?: number; offset?: number } = {}) {
    const params = new URLSearchParams()
    if (input.q?.trim()) params.set('q', input.q.trim())
    if (input.userId) params.set('userId', input.userId)
    if (input.limit !== undefined) params.set('limit', String(input.limit))
    if (input.offset !== undefined) params.set('offset', String(input.offset))
    const query = params.toString()
    return request<{ total: number; activities: ActivityEntry[] }>(
      `/api/admin/activity${query ? `?${query}` : ''}`,
    )
  },

  adminListOsCatalog(input: { q?: string; arch?: string } = {}) {
    const params = new URLSearchParams()
    if (input.q?.trim()) params.set('q', input.q.trim())
    if (input.arch) params.set('arch', input.arch)
    const query = params.toString()
    return request<OsCatalogEntry[]>(`/api/admin/os-catalog${query ? `?${query}` : ''}`)
  },

  adminListOsGroups() {
    return request<Array<{
      id: string
      name: string
      description: string
      logo: string
      enabled: boolean
      createdAt: string
      updatedAt: string
      templates?: any[]
    }>>('/api/admin/os-groups')
  },

  adminCreateOsGroup(input: Partial<{ name: string; description: string; logo: string; enabled: boolean }>) {
    return post<{
      id: string
      name: string
      description: string
      logo: string
      enabled: boolean
      createdAt: string
      updatedAt: string
    }>('/api/admin/os-groups', input)
  },

  adminUpdateOsGroup(id: string, input: Partial<{ name: string; description: string; logo: string; enabled: boolean }>) {
    return patch<{
      id: string
      name: string
      description: string
      logo: string
      enabled: boolean
      createdAt: string
      updatedAt: string
    }>(`/api/admin/os-groups/${encodeURIComponent(id)}`, input)
  },

  adminDeleteOsGroup(id: string) {
    return request<{ ok: true }>(`/api/admin/os-groups/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },

  adminListOsTemplates() {
    return request<OsTemplate[]>('/api/admin/os-templates')
  },

  adminCreateOsTemplate(input: Partial<OsTemplate>) {
    return post<OsTemplate>('/api/admin/os-templates', input)
  },

  adminUpdateOsTemplate(id: string, input: Partial<OsTemplate>) {
    return patch<OsTemplate>(`/api/admin/os-templates/${encodeURIComponent(id)}`, input)
  },

  adminDeleteOsTemplate(id: string) {
    return request<{ ok: true }>(`/api/admin/os-templates/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },

  adminListInstances() {
    return request<AdminInstance[]>('/api/admin/instances')
  },

  adminCreateInstance(input: {
    userId: string
    name?: string
    type: 'kvm' | 'lxc'
    os?: string
    templateId?: string
    imageAlias?: string
    nodeId?: string
    cores?: number
    memoryMb?: number
    diskGb?: number
  }) {
    return post<ApiInstance>('/api/admin/instances', input)
  },

  adminGetInstance(id: string) {
    return request<{ instance: AdminInstanceDetail }>(`/api/admin/instances/${encodeURIComponent(id)}`)
  },

  adminUpdateInstance(id: string, input: { cores?: number; memoryMb?: number }) {
    return patch<{ ok: true }>(`/api/admin/instances/${encodeURIComponent(id)}`, input)
  },

  adminListSnapshots(id: string) {
    return request<{ snapshots: InstanceSnapshot[] }>(`/api/admin/instances/${encodeURIComponent(id)}/snapshots`)
  },

  adminCreateSnapshot(id: string, name: string) {
    return post<{ ok: true; name: string }>(`/api/admin/instances/${encodeURIComponent(id)}/snapshots`, { name })
  },

  adminRestoreSnapshot(id: string, snap: string) {
    return post<{ ok: true }>(`/api/admin/instances/${encodeURIComponent(id)}/snapshots/${encodeURIComponent(snap)}/restore`)
  },

  adminDeleteSnapshot(id: string, snap: string) {
    return request<{ ok: true }>(`/api/admin/instances/${encodeURIComponent(id)}/snapshots/${encodeURIComponent(snap)}`, { method: 'DELETE' })
  },

  adminInstanceAction(id: string, action: 'start' | 'stop' | 'restart' | 'freeze' | 'unfreeze', reason?: string) {
    return post<{ ok: true; action: string }>(`/api/admin/instances/${encodeURIComponent(id)}/action`, { action, reason })
  },

  adminDeleteInstance(id: string) {
    return request<{ ok: true }>(`/api/admin/instances/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },

  adminStats() {
    return request<AdminStats>('/api/admin/stats')
  },

  config() {
    return request<PublicConfig>('/api/config')
  },

  adminSettings() {
    return request<AdminSettings>('/api/admin/settings')
  },

  adminUpdateApplicationSettings(input: Partial<AdminSettings['application']>) {
    return request<{ ok: true }>('/api/admin/settings/application', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  },

  adminUpdateMetadataSettings(input: Partial<AdminSettings['metadata']>) {
    return request<{ ok: true }>('/api/admin/settings/metadata', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  },

  adminUpdateStorageSettings(input: Partial<AdminSettings['storage']>) {
    return request<{ ok: true }>('/api/admin/settings/storage', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  },

  adminUpdateMailSettings(input: Partial<AdminSettings['mail']>) {
    return request<{ ok: true }>('/api/admin/settings/mail', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  },

  adminTestMail(input?: { to?: string }) {
    return post<{ ok: true; message: string }>('/api/admin/mail/test', input ?? {})
  },

  adminUpdateWebauthnSettings(input: Partial<AdminSettings['webauthn']>) {
    return request<{ ok: true }>('/api/admin/settings/webauthn', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  },

  adminUpdateCaptchaSettings(input: Partial<AdminSettings['captcha']>) {
    return request<{ ok: true }>('/api/admin/settings/captcha', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  },

  adminUpdateLegalSettings(input: Partial<AdminSettings['legal']>) {
    return request<{ ok: true }>('/api/admin/settings/legal', {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },

  adminUpdateNetworkSettings(input: Partial<AdminSettings['network']>) {
    return request<{ ok: true }>('/api/admin/settings/network', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  },

  adminUpdateRatelimitsSettings(input: Partial<AdminSettings['ratelimits']>) {
    return request<{ ok: true }>('/api/admin/settings/ratelimits', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  },

  adminUpdateThemeSettings(input: Partial<AdminThemeSettings>) {
    return request<{ ok: true }>('/api/admin/settings/theme', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  },

  listAnnouncements() {
    return request<{ announcements: ApiAnnouncement[] }>('/api/announcements')
  },

  adminListAnnouncements() {
    return request<{ announcements: ApiAnnouncement[] }>('/api/admin/announcements')
  },

  adminGetAnnouncement(id: string) {
    return request<{ announcement: ApiAnnouncement }>(`/api/admin/announcements/${encodeURIComponent(id)}`)
  },

  adminCreateAnnouncement(input: Partial<ApiAnnouncement>) {
    return post<{ announcement: ApiAnnouncement }>('/api/admin/announcements', input)
  },

  adminUpdateAnnouncement(id: string, input: Partial<ApiAnnouncement>) {
    return patch<{ announcement: ApiAnnouncement }>(`/api/admin/announcements/${encodeURIComponent(id)}`, input)
  },

  adminDeleteAnnouncement(id: string) {
    return request<{ ok: true }>(`/api/admin/announcements/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },

  adminListAssets(path?: string) {
    const q = path ? `?path=${encodeURIComponent(path)}` : ''
    return request<{ items: ApiAssetItem[]; currentPath: string; driver: string }>(`/api/admin/assets${q}`)
  },

  adminCreateAssetDirectory(name: string, path?: string) {
    return post<{ ok: true; path: string }>('/api/admin/assets/directory', { name, path })
  },

  adminUploadAssets(formData: FormData) {
    return request<{ ok: true; files: Array<{ name: string; url: string; key: string }> }>('/api/admin/assets/upload', {
      method: 'POST',
      body: formData,
    })
  },

  adminDeleteAssets(paths: string[]) {
    return request<{ ok: true }>('/api/admin/assets', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths }),
    })
  },

  adminListLocations() {
    return request<{ locations: ApiLocation[]; unassignedNodes: ApiNode[] }>('/api/admin/locations')
  },

  adminCreateLocation(input: {
    shortCode: string
    name: string
    description?: string
    countryCode?: string
    city?: string
    nodeIds?: string[]
  }) {
    return post<{ ok: true; id: string }>('/api/admin/locations', input)
  },

  adminUpdateLocation(id: string, input: Partial<{
    shortCode: string
    name: string
    description: string
    countryCode: string
    city: string
    nodeIds: string[]
  }>) {
    return patch<{ ok: true }>(`/api/admin/locations/${encodeURIComponent(id)}`, input)
  },

  adminDeleteLocation(id: string) {
    return request<{ ok: true }>(`/api/admin/locations/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },

  adminListNodes() {
    return request<{
      nodes: ApiNode[]
      systemDefaults?: { cpuCores: number; memoryLimitMb: number; diskLimitGb: number }
    }>('/api/admin/nodes')
  },

  adminCreateNode(input: Partial<ApiNode>) {
    return post<{ ok: true; id: string }>('/api/admin/nodes', input)
  },

  adminUpdateNode(id: string, input: Partial<ApiNode>) {
    return patch<{ ok: true }>(`/api/admin/nodes/${encodeURIComponent(id)}`, input)
  },

  adminGetNodeNetwork(id: string) {
    return request<{
      node: { id: string; name: string; fqdn: string; ipAddress: string; publicIp: string; primaryNetwork: string }
      stats: {
        servers: { total: number; active: number; suspended: number; awaitingSetup: number }
        ports: { total: number; available: number; inUse: number }
      }
      portForwardRange: { start: number; end: number }
      networks: Array<{
        name: string
        type: string
        managed: boolean
        status: string
        description?: string
        config?: Record<string, string>
        used_by?: string[]
      }>
    }>(`/api/admin/nodes/${encodeURIComponent(id)}/network`)
  },

  adminCreateNodeNetwork(id: string, input: { name: string; mtu?: number; nat?: boolean; ipv4?: string; ipv6?: string }) {
    return post<{ ok: true; name: string }>(`/api/admin/nodes/${encodeURIComponent(id)}/networks`, input)
  },

  adminUpdateNodeNetwork(id: string, netName: string, input: { mtu?: number; nat?: boolean; ipv4?: string }) {
    return patch<{ ok: true }>(`/api/admin/nodes/${encodeURIComponent(id)}/networks/${encodeURIComponent(netName)}`, input)
  },

  adminDeleteNodeNetwork(id: string, netName: string) {
    return request<{ ok: true }>(`/api/admin/nodes/${encodeURIComponent(id)}/networks/${encodeURIComponent(netName)}`, {
      method: 'DELETE',
    })
  },

  adminGetNodeStorage(id: string) {
    return request<{
      storageEnabled: boolean
      diskLimitGb: number
      pools: Array<{
        name: string
        driver: string
        status: string
        description?: string
        config?: Record<string, string>
        used_by?: string[]
      }>
    }>(`/api/admin/nodes/${encodeURIComponent(id)}/storage`)
  },

  adminUpdateNodeStorage(id: string, input: { storageEnabled?: boolean; diskLimitGb?: number }) {
    return patch<{ ok: true }>(`/api/admin/nodes/${encodeURIComponent(id)}/storage`, input)
  },

  adminCreateNodeStoragePool(id: string, input: { name: string; driver: string; source?: string; sizeGb?: number }) {
    return post<{ ok: true; name: string }>(`/api/admin/nodes/${encodeURIComponent(id)}/storage-pools`, input)
  },

  adminDeleteNodeStoragePool(id: string, poolName: string) {
    return request<{ ok: true }>(`/api/admin/nodes/${encodeURIComponent(id)}/storage-pools/${encodeURIComponent(poolName)}`, {
      method: 'DELETE',
    })
  },

  adminGetNodeTasks(id: string) {
    return request<{
      tasks: Array<{
        id: string
        task: string
        action: string
        details: string
        server: string
        serverId: string | null
        started: string
        finished: string | null
        durationSec: number
        progress: number
        status: string
        user: string | null
      }>
    }>(`/api/admin/nodes/${encodeURIComponent(id)}/tasks`)
  },

  adminGetNodeStatistics(id: string, range = '1d') {
    return request<{
      range: string
      points: Array<{
        t: string
        cpu: number
        memory: number
        load1: number
        load5: number
        load15: number
      }>
      live: {
        memoryPct: number
        memoryTotalMb: number
        memoryUsedMb: number
        load1: number
        load5: number
        load15: number
        cpus: number
      }
    }>(`/api/admin/nodes/${encodeURIComponent(id)}/statistics?range=${encodeURIComponent(range)}`)
  },

  adminTestNodeConnection(id: string) {
    return post<{ ok: true; version: string; daemon: string; storagePools: number; networks: number }>(`/api/admin/nodes/${encodeURIComponent(id)}/test`)
  },

  adminDeleteNode(id: string) {
    return request<{ ok: true }>(`/api/admin/nodes/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },
}
