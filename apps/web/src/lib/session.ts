import { createContext, useContext } from 'react'

import type { ApiSession, ApiUser } from '@/lib/api'

export interface SessionState {
  user: ApiUser | null
  session: ApiSession | null
  /** True until the first /api/auth/me call resolves. */
  loading: boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

export const SessionContext = createContext<SessionState | null>(null)

export function useSession() {
  const context = useContext(SessionContext)
  if (!context) throw new Error('useSession must be used inside a SessionProvider')
  return context
}
