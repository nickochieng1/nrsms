import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { RequireAuth } from '@/components/auth/RequireAuth'
import LoginPage from '@/pages/Login'
import ChangePasswordPage from '@/pages/ChangePassword'
import DashboardPage from '@/pages/Dashboard'
import SubmissionsPage from '@/pages/Submissions'
import NewSubmissionPage from '@/pages/NewSubmission'
import ReportsPage from '@/pages/Reports'
import AuditLogPage from '@/pages/AuditLog'
import StationsPage from '@/pages/Stations'
import UsersPage from '@/pages/Users'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<RequireAuth />}>
          {/* Standalone page — no sidebar, shown when password change is required */}
          <Route path="/change-password" element={<ChangePasswordPage />} />

          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/submissions" element={<SubmissionsPage />} />
            <Route path="/submissions/new" element={<NewSubmissionPage />} />

            <Route element={<RequireAuth allowedRoles={['registrar', 'director', 'admin']} />}>
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/audit" element={<AuditLogPage />} />
            </Route>

            <Route element={<RequireAuth allowedRoles={['director', 'admin']} />}>
              <Route path="/stations" element={<StationsPage />} />
              <Route path="/users" element={<UsersPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
