import { useCallback, useEffect, useState } from 'react'
import { authStore } from '@/store/authStore'
import type { User, UserRole } from '@/types'

export const PENDING_STATUS: Partial<Record<UserRole, string>> = {
  registrar: 'submitted',
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
  const isDirector        = role === 'director'
  const isRegistrar       = role === 'registrar'
  const isClerk           = role === 'clerk'
  const canApprove        = isRegistrar
  const canViewReports    = isRegistrar || isDirector
  const canManageUsers    = isAdmin
  const canViewUsers      = isAdmin || isDirector
  const myPendingStatus   = role ? PENDING_STATUS[role] : undefined

  const logout = useCallback(() => { authStore.clearAuth() }, [])

  return {
    user, token, isAuthenticated,
    isAdmin, isDirector, isRegistrar, isClerk, canApprove, canViewReports, canManageUsers, canViewUsers,
    myPendingStatus,
    logout,
  }
}
