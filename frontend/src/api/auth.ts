import { apiClient } from './client'
import type { User } from '@/types'

export async function login(username: string, password: string): Promise<string> {
  const { data } = await apiClient.post<{ access_token: string }>('/auth/login', { username, password })
  return data.access_token
}

export async function getMe(): Promise<User> {
  const { data } = await apiClient.get<User>('/auth/me')
  return data
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiClient.post('/auth/change-password', {
    current_password: currentPassword,
    new_password: newPassword,
  })
}
