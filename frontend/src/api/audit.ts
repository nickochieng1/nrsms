import { apiClient } from './client'
import type { AuditLog } from '@/types'

export interface AuditFilters {
  user_id?: number
  resource?: string
  action?: string
  skip?: number
  limit?: number
}

export async function getAuditLogs(filters?: AuditFilters): Promise<AuditLog[]> {
  const { data } = await apiClient.get<AuditLog[]>('/audit', { params: filters })
  return data
}
