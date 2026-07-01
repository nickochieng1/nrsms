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

// ── Comments ──────────────────────────────────────────────────────────────────
export interface SubmissionComment {
  id: number
  submission_id: number
  user_id: number | null
  author_name: string | null
  author_role: string | null
  content: string
  created_at: string
}

export async function getComments(submissionId: number): Promise<SubmissionComment[]> {
  const { data } = await apiClient.get<SubmissionComment[]>(`/submissions/${submissionId}/comments`)
  return data
}

export async function addComment(submissionId: number, content: string): Promise<SubmissionComment> {
  const { data } = await apiClient.post<SubmissionComment>(`/submissions/${submissionId}/comments`, { content })
  return data
}

export async function getAnomalyCheck(submissionId: number): Promise<{ warnings: string[] }> {
  const { data } = await apiClient.get<{ warnings: string[] }>(`/submissions/${submissionId}/anomaly-check`)
  return data
}

export function getBulkTemplateUrl(): string {
  return `${apiClient.defaults.baseURL}/submissions/bulk-template`
}

export async function bulkUpload(file: File): Promise<{ results: any[]; created: number }> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await apiClient.post('/submissions/bulk-upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
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
