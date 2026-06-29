import { apiClient } from './client'
import type { AuditActor, AuditLogPage, AuditStats } from '@/types'

export interface AuditFilters {
  user_id?: number
  username?: string
  resource?: string
  action?: string
  date_from?: string
  date_to?: string
  q?: string
  skip?: number
  limit?: number
}

export async function getAuditLogs(filters?: AuditFilters): Promise<AuditLogPage> {
  const { data } = await apiClient.get<AuditLogPage>('/audit', { params: filters })
  return data
}

export async function getAuditActors(): Promise<AuditActor[]> {
  const { data } = await apiClient.get<AuditActor[]>('/audit/actors')
  return data
}

export async function getAuditStats(filters?: Omit<AuditFilters, 'skip' | 'limit'>): Promise<AuditStats> {
  const { data } = await apiClient.get<AuditStats>('/audit/stats', { params: filters })
  return data
}

export function getAuditExportUrl(filters?: Omit<AuditFilters, 'skip' | 'limit'>): string {
  const params = new URLSearchParams()
  if (filters) {
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== '') params.set(k, String(v))
    })
  }
  const qs = params.toString()
  return `${apiClient.defaults.baseURL}/audit/export${qs ? `?${qs}` : ''}`
}
