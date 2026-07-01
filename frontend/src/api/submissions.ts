import { apiClient } from './client'
import type { Notification, RegionalStatusRow, Submission } from '@/types'

export interface SubmissionFilters {
  station_id?: number
  subcounty?: string
  county?: string
  region?: string
  status?: string
  year?: number
  month?: number
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

export async function cropReviewSubmission(
  id: number, action: 'approve' | 'reject', rejection_reason?: string,
): Promise<Submission> {
  const { data } = await apiClient.post<Submission>(`/submissions/${id}/crop-review`, { action, rejection_reason })
  return data
}

export async function rropReviewSubmission(
  id: number, action: 'approve' | 'reject', rejection_reason?: string,
): Promise<Submission> {
  const { data } = await apiClient.post<Submission>(`/submissions/${id}/rrop-review`, { action, rejection_reason })
  return data
}

export async function hqCompileSubmission(id: number): Promise<Submission> {
  const { data } = await apiClient.post<Submission>(`/submissions/${id}/hq-compile`)
  return data
}

export async function reviewSubmission(
  id: number, action: 'approve' | 'reject', rejection_reason?: string,
): Promise<Submission> {
  const { data } = await apiClient.post<Submission>(`/submissions/${id}/review`, { action, rejection_reason })
  return data
}

export async function getRegionalStatus(year: number, month: number): Promise<RegionalStatusRow[]> {
  const { data } = await apiClient.get<RegionalStatusRow[]>('/submissions/regional-status', {
    params: { year, month },
  })
  return data
}

export async function getNotifications(): Promise<Notification[]> {
  const { data } = await apiClient.get<Notification[]>('/notifications')
  return data
}

export async function markNotificationRead(id: number): Promise<void> {
  await apiClient.post(`/notifications/${id}/read`)
}
