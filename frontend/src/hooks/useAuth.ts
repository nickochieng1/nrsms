import { useCallback, useEffect, useState } from 'react'
import { authStore } from '@/store/authStore'
import type { User, UserRole } from '@/types'

const HQ_ROLES: UserRole[]    = ['hq_clerk', 'hq_officer', 'director', 'admin']
const FIELD_ROLES: UserRole[] = ['clerk', 'sub_county_registrar', 'county_registrar', 'regional_registrar']
const CAN_APPROVE: UserRole[] = ['sub_county_registrar', 'county_registrar', 'regional_registrar', 'hq_officer', 'director', 'admin']

// Pending status each approver role acts on
export const PENDING_STATUS: Partial<Record<UserRole, string>> = {
  sub_county_registrar: 'submitted',
  county_registrar:     'sub_county_approved',
  regional_registrar:   'county_approved',
  hq_officer:           'regional_approved',
  director:             'regional_approved',
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(authStore.getUser)
  const [token, setToken] = useState<string | null>(authStore.getToken)

  useEffect(() => {
    return authStore.subscribe(() => {
      setUser(authStore.getUser())
      setToken(authStore.getToken())
    })
  }, [])

  const role = user?.role ?? null

  const isAuthenticated   = !!token
  const isAdmin           = role === 'admin'
  const isDirector        = role === 'director' || isAdmin
  const isHQ              = role != null && HQ_ROLES.includes(role)
  const isField           = role != null && FIELD_ROLES.includes(role)
  const isClerk           = role === 'clerk'
  const canApprove        = role != null && CAN_APPROVE.includes(role)
  const canViewReports    = role != null && !['clerk', 'sub_county_registrar'].includes(role)
  const canManageUsers    = isAdmin || isDirector || role === 'hq_officer'
  const myPendingStatus   = role ? PENDING_STATUS[role] : undefined

  const logout = useCallback(() => { authStore.clearAuth() }, [])

  return {
    user, token, isAuthenticated,
    isAdmin, isDirector, isHQ, isField, isClerk, canApprove, canViewReports, canManageUsers,
    myPendingStatus,
    logout,
  }
}
