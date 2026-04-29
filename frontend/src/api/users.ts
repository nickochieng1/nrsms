import { apiClient } from './client'
import type { User, UserRole } from '@/types'

export async function getUsers(): Promise<User[]> {
  const { data } = await apiClient.get<User[]>('/users')
  return data
}

export async function createUser(payload: {
  full_name: string
  username?: string | null
  email: string
  password: string
  role: UserRole
  station_id?: number | null
  county?: string | null
  region?: string | null
}): Promise<User> {
  const { data } = await apiClient.post<User>('/users', payload)
  return data
}

export async function updateUser(id: number, payload: Partial<User> & { password?: string }): Promise<User> {
  const { data } = await apiClient.patch<User>(`/users/${id}`, payload)
  return data
}

export async function deleteUser(id: number): Promise<void> {
  await apiClient.delete(`/users/${id}`)
}

export async function resetUserPassword(id: number, password: string): Promise<void> {
  await apiClient.post(`/users/${id}/reset-password`, { password })
}
