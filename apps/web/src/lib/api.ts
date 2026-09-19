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
  createdAt: string
}

export type LoginResponse = { ok: true; needsName?: boolean }

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
  } catch {
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

  revokeSession(id: string) {
    return request<{ ok: true }>(`/api/auth/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },

  deleteAccount() {
    return request<{ ok: true }>('/api/auth/account', { method: 'DELETE' })
  },
}
