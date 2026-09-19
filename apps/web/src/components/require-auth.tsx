import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { SessionLoading } from '@/components/session-loading'
import { useSession } from '@/lib/session'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useSession()

  if (loading) {
    return <SessionLoading />
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
