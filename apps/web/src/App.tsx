import { Agentation } from 'agentation'
import { Navigate, Route, Routes } from 'react-router-dom'

import { AuthLayout } from '@/components/auth/auth-layout'
import { RequireAuth } from '@/components/require-auth'
import { SessionLoading } from '@/components/session-loading'
import { useSession } from '@/lib/session'
import { AccountPage } from '@/pages/account'
import { CancelEmailChangePage } from '@/pages/cancel-email-change'
import { DashboardPage } from '@/pages/dashboard'
import { AupPage } from '@/pages/legal/aup'
import { PrivacyPage } from '@/pages/legal/privacy'
import { TermsPage } from '@/pages/legal/terms'
import { LoginPage } from '@/pages/login'
import { NotFoundPage } from '@/pages/not-found'
import { ServerDetailPage } from '@/pages/server-detail'
import { VerifyEmailPage } from '@/pages/verify-email'

function HomeRedirect() {
  const { user, loading } = useSession()

  if (loading) return <SessionLoading />

  return <Navigate to={user ? '/dashboard' : '/login'} replace />
}

function App() {
  return (
    <>
      <Routes>
        <Route
          path="/login"
          element={
            <AuthLayout>
              <LoginPage />
            </AuthLayout>
          }
        />
        <Route path="/register" element={<Navigate to="/login" replace />} />
        <Route
          path="/verify-email"
          element={
            <AuthLayout>
              <VerifyEmailPage />
            </AuthLayout>
          }
        />
        <Route
          path="/cancel-email-change"
          element={
            <AuthLayout>
              <CancelEmailChangePage />
            </AuthLayout>
          }
        />
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <DashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/servers/:id"
          element={
            <RequireAuth>
              <ServerDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/account"
          element={
            <RequireAuth>
              <AccountPage />
            </RequireAuth>
          }
        />
        <Route path="/legal/terms" element={<TermsPage />} />
        <Route path="/legal/aup" element={<AupPage />} />
        <Route path="/legal/privacy" element={<PrivacyPage />} />
        <Route path="/" element={<HomeRedirect />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>

      {import.meta.env.DEV ? <Agentation endpoint="/agentation" /> : null}
    </>
  )
}

export default App
