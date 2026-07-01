import { useCallback, useEffect, useState } from 'react'
import { authStore } from '@/store/authStore'
import type { User, UserRole } from '@/types'

export const PENDING_STATUS: Partial<Record<UserRole, string>> = {
  registrar:  'hq_compiled',
  hq_clerk:   'rrop_approved',
  rrop:       'crop_approved',
  crop:       'dcrop_submitted',
  dcrop:      'draft',
  clerk:      'draft',       // legacy role
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

  const isAuthenticated = !!token
  const isAdmin         = role === 'admin'
  const isDirector      = role === 'director'
  const isRegistrar     = role === 'registrar'
  const isClerk         = role === 'clerk'
  const isDCROP         = role === 'dcrop'
  const isCROP          = role === 'crop'
  const isRROP          = role === 'rrop'
  const isHQClerk       = role === 'hq_clerk'

  const isFieldStaff    = isDCROP || isClerk
  const canViewReports  = isRegistrar || isDirector || isRROP || isHQClerk
  const canManageUsers  = isAdmin
  const canViewUsers    = isAdmin || isDirector
  const canApprove      = isRegistrar || isCROP || isRROP || isHQClerk
  const myPendingStatus = role ? PENDING_STATUS[role] : undefined

  const logout = useCallback(() => { authStore.clearAuth() }, [])

  return {
    user, token, isAuthenticated,
    isAdmin, isDirector, isRegistrar, isClerk,
    isDCROP, isCROP, isRROP, isHQClerk, isFieldStaff,
    canApprove, canViewReports, canManageUsers, canViewUsers,
    myPendingStatus,
    logout,
  }
}
