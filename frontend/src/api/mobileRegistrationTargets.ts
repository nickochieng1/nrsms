import { apiClient } from './client'
import type { MobileRegistrationTarget } from '@/types'

export async function getMobileRegistrationTargets(year: number, month?: number): Promise<MobileRegistrationTarget[]> {
  const { data } = await apiClient.get<MobileRegistrationTarget[]>('/mobile-registration-targets', {
    params: { year, month },
  })
  return data
}

export async function setMobileRegistrationTarget(payload: {
  county: string
  period_month: number
  period_year: number
  target_set: number
}): Promise<MobileRegistrationTarget> {
  const { data } = await apiClient.put<MobileRegistrationTarget>('/mobile-registration-targets', payload)
  return data
}
