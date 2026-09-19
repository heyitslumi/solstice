import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { api, type ApiSession, type ApiUser } from '@/lib/api'
import { SessionContext } from '@/lib/session'

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null)
  const [session, setSession] = useState<ApiSession | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const result = await api.me()
    setUser(result.ok ? result.data.user : null)
    setSession(result.ok ? result.data.session : null)
    setLoading(false)
  }, [])

  const signOut = useCallback(async () => {
    await api.logout()
    setUser(null)
    setSession(null)
  }, [])

  useEffect(() => {
    let cancelled = false
    void api.me().then((result) => {
      if (cancelled) return
      setUser(result.ok ? result.data.user : null)
      setSession(result.ok ? result.data.session : null)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo(
    () => ({ user, session, loading, refresh, signOut }),
    [user, session, loading, refresh, signOut],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
