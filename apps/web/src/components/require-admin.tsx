import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { SessionLoading } from '@/components/session-loading'
import { useSession } from '@/lib/session'

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useSession()

  if (loading) {
    return <SessionLoading />
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!user.isAdmin) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}