import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { RequireAuth } from '@/components/auth/RequireAuth'
import { UpdateChecker } from '@/components/UpdateChecker'
import LoginPage from '@/pages/Login'
import ChangePasswordPage from '@/pages/ChangePassword'
import DashboardPage from '@/pages/Dashboard'
import SubmissionsPage from '@/pages/Submissions'
import NewSubmissionPage from '@/pages/NewSubmission'
import MobileRegistrationsPage from '@/pages/MobileRegistrations'
import ReportsPage from '@/pages/Reports'
import MashinaniReportsPage from '@/pages/MashinaniReports'
import AuditLogPage from '@/pages/AuditLog'
import StationsPage from '@/pages/Stations'
import UsersPage from '@/pages/Users'

import type { UserRole } from '@/types'

const CLERK_ONLY: UserRole[] = ['clerk']
const CLERK_AND_REGISTRAR: UserRole[] = ['clerk', 'registrar']
const MASHINANI_ROLES: UserRole[] = ['clerk', 'registrar', 'director']
const REPORT_ROLES: UserRole[] = ['registrar', 'director']
const ADMIN_ONLY: UserRole[] = ['admin']
const ADMIN_AND_DIRECTOR: UserRole[] = ['admin', 'director']

export default function App() {
  return (
    <BrowserRouter>
      <UpdateChecker />
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<RequireAuth />}>
          <Route path="/change-password" element={<ChangePasswordPage />} />

          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />

            <Route element={<RequireAuth allowedRoles={CLERK_AND_REGISTRAR} />}>
              <Route path="/submissions" element={<SubmissionsPage />} />
            </Route>

            <Route element={<RequireAuth allowedRoles={MASHINANI_ROLES} />}>
              <Route path="/mobile-registrations" element={<MobileRegistrationsPage />} />
            </Route>

            <Route element={<RequireAuth allowedRoles={CLERK_ONLY} />}>
              <Route path="/submissions/new" element={<NewSubmissionPage />} />
            </Route>

            <Route element={<RequireAuth allowedRoles={REPORT_ROLES} />}>
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/mashinani-reports" element={<MashinaniReportsPage />} />
            </Route>

            <Route element={<RequireAuth allowedRoles={ADMIN_AND_DIRECTOR} />}>
              <Route path="/users" element={<UsersPage />} />
            </Route>

            <Route element={<RequireAuth allowedRoles={ADMIN_ONLY} />}>
              <Route path="/audit" element={<AuditLogPage />} />
              <Route path="/stations" element={<StationsPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
