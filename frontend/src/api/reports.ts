import { apiClient } from './client'
import type { SummaryReport } from '@/types'

export async function getSummaryReport(year: number, station_id?: number): Promise<SummaryReport> {
  const { data } = await apiClient.get<SummaryReport>('/reports/summary', {
    params: { year, station_id },
  })
  return data
}

function _buildUrl(path: string, year: number, month?: number, station_id?: number): string {
  const params = new URLSearchParams({ year: String(year) })
  if (month)      params.set('month',      String(month))
  if (station_id) params.set('station_id', String(station_id))
  return `/api/v1/reports/${path}?${params}`
}

export const getExcelReportUrl = (year: number, month?: number, station_id?: number) =>
  _buildUrl('excel', year, month, station_id)

export const getPdfReportUrl = (year: number, month?: number, station_id?: number) =>
  _buildUrl('pdf', year, month, station_id)

export const getWordReportUrl = (year: number, month?: number, station_id?: number) =>
  _buildUrl('word', year, month, station_id)

export const getCsvReportUrl = (year: number, month?: number, station_id?: number) =>
  _buildUrl('csv', year, month, station_id)
