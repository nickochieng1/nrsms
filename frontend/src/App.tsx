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

import type { UserRole } from '@/types'
const REPORT_ROLES: UserRole[] = ['county_registrar', 'regional_registrar', 'hq_clerk', 'hq_officer', 'director', 'admin']
const HQ_MANAGER: UserRole[]   = ['hq_officer', 'director', 'admin']
const ADMIN_ONLY: UserRole[]   = ['admin']

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<RequireAuth />}>
          <Route path="/change-password" element={<ChangePasswordPage />} />

          <Route element={<AppLayout />}>
            <Route path="/dashboard"       element={<DashboardPage />} />
            <Route path="/submissions"     element={<SubmissionsPage />} />
            <Route path="/submissions/new" element={<NewSubmissionPage />} />

            <Route element={<RequireAuth allowedRoles={REPORT_ROLES} />}>
              <Route path="/reports" element={<ReportsPage />} />
            </Route>

            <Route element={<RequireAuth allowedRoles={ADMIN_ONLY} />}>
              <Route path="/audit" element={<AuditLogPage />} />
            </Route>

            <Route element={<RequireAuth allowedRoles={HQ_MANAGER} />}>
              <Route path="/users" element={<UsersPage />} />
            </Route>

            <Route element={<RequireAuth allowedRoles={['director', 'admin']} />}>
              <Route path="/stations" element={<StationsPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
