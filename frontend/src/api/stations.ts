import { apiClient } from './client'
import type { Station } from '@/types'

export async function getStations(): Promise<Station[]> {
  const { data } = await apiClient.get<Station[]>('/stations', { params: { limit: 500 } })
  return data
}

export async function createStation(payload: Omit<Station, 'id'>): Promise<Station> {
  const { data } = await apiClient.post<Station>('/stations', payload)
  return data
}

export async function updateStation(id: number, payload: Partial<Station>): Promise<Station> {
  const { data } = await apiClient.patch<Station>(`/stations/${id}`, payload)
  return data
}

export async function deleteStation(id: number): Promise<void> {
  await apiClient.delete(`/stations/${id}`)
}
