import { apiClient } from './client'
import type { SummaryReport } from '@/types'

export async function getSummaryReport(
  year: number,
  station_id?: number,
  county?: string,
  region?: string,
): Promise<SummaryReport> {
  const { data } = await apiClient.get<SummaryReport>('/reports/summary', {
    params: { year, station_id, county, region },
  })
  return data
}

function _buildUrl(
  path: string,
  year: number,
  month?: number,
  station_id?: number,
  county?: string,
  region?: string,
): string {
  const params = new URLSearchParams({ year: String(year) })
  if (month)      params.set('month',      String(month))
  if (station_id) params.set('station_id', String(station_id))
  if (county)     params.set('county',     county)
  if (region)     params.set('region',     region)
  return `/api/v1/reports/${path}?${params}`
}

export const getExcelReportUrl = (year: number, month?: number, station_id?: number, county?: string, region?: string) =>
  _buildUrl('excel', year, month, station_id, county, region)

export const getPdfReportUrl = (year: number, month?: number, station_id?: number, county?: string, region?: string) =>
  _buildUrl('pdf', year, month, station_id, county, region)

export const getWordReportUrl = (year: number, month?: number, station_id?: number, county?: string, region?: string) =>
  _buildUrl('word', year, month, station_id, county, region)

export const getCsvReportUrl = (year: number, month?: number, station_id?: number, county?: string, region?: string) =>
  _buildUrl('csv', year, month, station_id, county, region)
