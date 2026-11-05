import { Agentation } from 'agentation'
import { Navigate, Route, Routes } from 'react-router-dom'

import { AuthLayout } from '@/components/auth/auth-layout'
import { RequireAdmin } from '@/components/require-admin'
import { RequireAuth } from '@/components/require-auth'
import { SessionLoading } from '@/components/session-loading'
import { useSession } from '@/lib/session'
import { AccountPage } from '@/pages/account'
import { AdminPage } from '@/pages/admin'
import { AdminAnnouncementsPage } from '@/pages/admin-announcements'
import { AdminAssetsPage } from '@/pages/admin-assets'
import { AdminLocationFormPage } from '@/pages/admin-location-form'
import { AdminLocationsPage } from '@/pages/admin-locations'
import { AdminNodeFormPage } from '@/pages/admin-node-form'
import { AdminNodesPage } from '@/pages/admin-nodes'
import { AdminSettingsPage } from '@/pages/admin-settings'
import { AdminThemePage } from '@/pages/admin-theme'
import { AdminActivityPage } from '@/pages/admin-activity'
import { AdminOAuthProviderFormPage } from '@/pages/admin-oauth-provider-form'
import { AdminOAuthProvidersPage } from '@/pages/admin-oauth-providers'
import { AdminServerDetailPage } from '@/pages/admin-server-detail'
import { AdminServerFormPage } from '@/pages/admin-server-form'
import { AdminServersPage } from '@/pages/admin-servers'
import { AdminTemplateGroupsPage } from '@/pages/admin-template-groups'
import { AdminTemplatesPage } from '@/pages/admin-templates'
import { AdminPortForwardsPage } from '@/pages/admin-port-forwards'
import { AdminUserDetailPage } from '@/pages/admin-user-detail'
import { AdminUserCreatePage } from '@/pages/admin-user-create'
import { AdminUsersPage } from '@/pages/admin-users'
import { CancelEmailChangePage } from '@/pages/cancel-email-change'
import { DashboardPage } from '@/pages/dashboard'
import { LoginPage } from '@/pages/login'
import { NotFoundPage } from '@/pages/not-found'
import { ServerDetailPage } from '@/pages/server-detail'
import { ServersPage } from '@/pages/servers'
import { ServerConsolePage } from '@/pages/server-console'
import { NetworkPage } from '@/pages/network'
import { SnapshotsPage } from '@/pages/snapshots'
import { UsagePage } from '@/pages/usage'
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
          path="/servers/:id/console"
          element={
            <RequireAuth>
              <ServerConsolePage />
            </RequireAuth>
          }
        />
        <Route
          path="/servers"
          element={
            <RequireAuth>
              <ServersPage />
            </RequireAuth>
          }
        />
        <Route
          path="/network"
          element={
            <RequireAuth>
              <NetworkPage />
            </RequireAuth>
          }
        />
        <Route
          path="/snapshots"
          element={
            <RequireAuth>
              <SnapshotsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/usage"
          element={
            <RequireAuth>
              <UsagePage />
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
        <Route
          path="/admin"
          element={
            <RequireAuth>
              <RequireAdmin>
                <AdminPage />
              </RequireAdmin>
            </RequireAuth>
          }
        />
        <Route
          path="/admin/settings"
          element={
            <RequireAuth>
              <RequireAdmin>
                <AdminSettingsPage />
              </RequireAdmin>
            </RequireAuth>
          }
        />
        <Route
          path="/admin/announcements"
          element={
            <RequireAuth>
              <RequireAdmin>
                <AdminAnnouncementsPage />
              </RequireAdmin>
            </RequireAuth>
          }
        />
        <Route
          path="/admin/assets"
          element={
            <RequireAuth>
              <RequireAdmin>
                <AdminAssetsPage />
              </RequireAdmin>
            </RequireAuth>
          }
        />
        <Route
          path="/admin/theme"
          element={
            <RequireAuth>
              <RequireAdmin>
                <AdminThemePage />
              </RequireAdmin>
            </RequireAuth>
          }
        />
        <Route
          path="/admin/locations"
          element={
            <RequireAuth>
              <RequireAdmin>
                <AdminLocationsPage />
              </RequireAdmin>
            </RequireAuth>
          }
        />
        <Route
          path="/admin/locations/new"
          element={
            <RequireAuth>
              <RequireAdmin>
                <AdminLocationFormPage />
              </RequireAdmin>
            </RequireAuth>
          }
        />
        <Route
          path="/admin/locations/:id/edit"
          element={
            <RequireAuth>
              <RequireAdmin>
                <AdminLocationFormPage />
              </RequireAdmin>
            </RequireAuth>
          }
        />
        <Route
          path="/admin/nodes"
          element={
            <RequireAuth>
              <RequireAdmin>
                <AdminNodesPage />
              </RequireAdmin>
            </RequireAuth>
          }
        />
        <Route
          path="/admin/nodes/new"
          element={
            <RequireAuth>
              <RequireAdmin>
                <AdminNodeFormPage />
              </RequireAdmin>
            </RequireAuth>
          }
        />
        <Route
          path="/admin/nodes/:id/edit"
          element={
            <RequireAuth>
              <RequireAdmin>
                <AdminNodeFormPage />
              </RequireAdmin>
            </RequireAuth>
          }
        />
        <Route
          path="/admin/users"
          element={
            <RequireAuth>
              <RequireAdmin>
                <AdminUsersPage />
              </RequireAdmin>
            </RequireAuth>
          }
        />
        <Route
          path="/admin/users/new"
          element={
            <RequireAuth>
              <RequireAdmin>
                <AdminUserCreatePage />
              </RequireAdmin>
            </RequireAuth>
          }
        />
        <Route
          path="/admin/oauth-providers"
          element={
            <RequireAuth>
              <RequireAdmin>
                <AdminOAuthProvidersPage />
              </RequireAdmin>
            </RequireAuth>
          }
        />
        <Route
          path="/admin/oauth-providers/new"
          element={
            <RequireAuth>
              <RequireAdmin>
                <AdminOAuthProviderFormPage />
              </RequireAdmin>
            </RequireAuth>
          }
        />
        <Route
          path="/admin/oauth-providers/:id/edit"
          element={
            <RequireAuth>
              <RequireAdmin>
                <AdminOAuthProviderFormPage />
              </RequireAdmin>
            </RequireAuth>
          }
        />
        <Route
          path="/admin/activity"
          element={
            <RequireAuth>
              <RequireAdmin>
                <AdminActivityPage />
              </RequireAdmin>
            </RequireAuth>
          }
        />
        <Route
          path="/admin/template-groups"
          element={
            <RequireAuth>
              <RequireAdmin>
                <AdminTemplateGroupsPage />
              </RequireAdmin>
            </RequireAuth>
          }
        />
        <Route
          path="/admin/templates"
          element={
            <RequireAuth>
              <RequireAdmin>
                <AdminTemplatesPage />
              </RequireAdmin>
            </RequireAuth>
          }
        />
        <Route
          path="/admin/servers"
          element={
            <RequireAuth>
              <RequireAdmin>
                <AdminServersPage />
              </RequireAdmin>
            </RequireAuth>
          }
        />
        <Route
          path="/admin/port-forwards"
          element={
            <RequireAuth>
              <RequireAdmin>
                <AdminPortForwardsPage />
              </RequireAdmin>
            </RequireAuth>
          }
        />
        <Route
          path="/admin/servers/new"
          element={
            <RequireAuth>
              <RequireAdmin>
                <AdminServerFormPage />
              </RequireAdmin>
            </RequireAuth>
          }
        />
        <Route
          path="/admin/servers/:id"
          element={
            <RequireAuth>
              <RequireAdmin>
                <AdminServerDetailPage />
              </RequireAdmin>
            </RequireAuth>
          }
        />
        <Route
          path="/admin/users/:id"
          element={
            <RequireAuth>
              <RequireAdmin>
                <AdminUserDetailPage />
              </RequireAdmin>
            </RequireAuth>
          }
        />
        <Route path="/" element={<HomeRedirect />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>

      {import.meta.env.DEV ? <Agentation endpoint="/agentation" /> : null}
    </>
  )
}

export default App
