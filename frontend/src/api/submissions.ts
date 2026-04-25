import { apiClient } from './client'
import type { Submission } from '@/types'

export interface SubmissionFilters {
  station_id?: number
  status?: string
  year?: number
  skip?: number
  limit?: number
}

export async function getSubmissions(filters?: SubmissionFilters): Promise<Submission[]> {
  const { data } = await apiClient.get<Submission[]>('/submissions', { params: filters })
  return data
}

export async function getSubmission(id: number): Promise<Submission> {
  const { data } = await apiClient.get<Submission>(`/submissions/${id}`)
  return data
}

export async function createSubmission(payload: Partial<Submission>): Promise<Submission> {
  const { data } = await apiClient.post<Submission>('/submissions', payload)
  return data
}

export async function updateSubmission(id: number, payload: Partial<Submission>): Promise<Submission> {
  const { data } = await apiClient.patch<Submission>(`/submissions/${id}`, payload)
  return data
}

export async function submitSubmission(id: number): Promise<Submission> {
  const { data } = await apiClient.post<Submission>(`/submissions/${id}/submit`)
  return data
}

export async function reviewSubmission(
  id: number,
  action: 'approve' | 'reject',
  rejection_reason?: string,
): Promise<Submission> {
  const { data } = await apiClient.post<Submission>(`/submissions/${id}/review`, {
    action,
    rejection_reason,
  })
  return data
}
