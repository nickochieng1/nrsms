import { apiClient } from './client'
import type { MobileRegistration } from '@/types'

export interface MobileRegistrationFilters {
  is_closed?: boolean
  year?: number
  month?: number
  county?: string
  subcounty?: string
  skip?: number
  limit?: number
}

export async function getMobileRegistrations(filters?: MobileRegistrationFilters): Promise<MobileRegistration[]> {
  const { data } = await apiClient.get<MobileRegistration[]>('/mobile-registrations', { params: filters })
  return data
}

export async function getMobileRegistration(id: number): Promise<MobileRegistration> {
  const { data } = await apiClient.get<MobileRegistration>(`/mobile-registrations/${id}`)
  return data
}

export async function createMobileRegistration(payload: Partial<MobileRegistration>): Promise<MobileRegistration> {
  const { data } = await apiClient.post<MobileRegistration>('/mobile-registrations', payload)
  return data
}

export async function updateMobileRegistration(id: number, payload: Partial<MobileRegistration>): Promise<MobileRegistration> {
  const { data } = await apiClient.patch<MobileRegistration>(`/mobile-registrations/${id}`, payload)
  return data
}

export async function closeMobileRegistration(id: number): Promise<MobileRegistration> {
  const { data } = await apiClient.post<MobileRegistration>(`/mobile-registrations/${id}/close`)
  return data
}

export async function reopenMobileRegistration(id: number): Promise<MobileRegistration> {
  const { data } = await apiClient.post<MobileRegistration>(`/mobile-registrations/${id}/reopen`)
  return data
}
