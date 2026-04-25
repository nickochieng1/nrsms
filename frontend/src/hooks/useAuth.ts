import { useCallback, useEffect, useState } from 'react'
import { authStore } from '@/store/authStore'
import type { User } from '@/types'

export function useAuth() {
  const [user, setUser] = useState<User | null>(authStore.getUser)
  const [token, setToken] = useState<string | null>(authStore.getToken)

  useEffect(() => {
    return authStore.subscribe(() => {
      setUser(authStore.getUser())
      setToken(authStore.getToken())
    })
  }, [])

  const isAuthenticated = !!token
  const isAdmin = user?.role === 'admin'
  const isDirector = user?.role === 'director' || isAdmin
  const isRegistrar = user?.role === 'registrar' || isDirector
  const isOfficer = user?.role === 'station_officer'
  const isStationLocked = user?.role === 'station_officer' || user?.role === 'registrar'

  const logout = useCallback(() => {
    authStore.clearAuth()
  }, [])

  return { user, token, isAuthenticated, isAdmin, isDirector, isRegistrar, isOfficer, isStationLocked, logout }
}
