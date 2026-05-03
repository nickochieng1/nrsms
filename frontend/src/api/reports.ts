import { apiClient } from './client'
import type { SummaryReport } from '@/types'

export async function getSummaryReport(
  year: number,
  station_id?: number,
  county?: string,
  region?: string,
  quarter?: number,
): Promise<SummaryReport> {
  const { data } = await apiClient.get<SummaryReport>('/reports/summary', {
    params: { year, station_id, county, region, quarter },
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
  quarter?: number,
): string {
  const params = new URLSearchParams({ year: String(year) })
  if (month)      params.set('month',      String(month))
  if (quarter)    params.set('quarter',    String(quarter))
  if (station_id) params.set('station_id', String(station_id))
  if (county)     params.set('county',     county)
  if (region)     params.set('region',     region)
  return `/api/v1/reports/${path}?${params}`
}

export const getExcelReportUrl = (year: number, month?: number, station_id?: number, county?: string, region?: string, quarter?: number) =>
  _buildUrl('excel', year, month, station_id, county, region, quarter)

export const getPdfReportUrl = (year: number, month?: number, station_id?: number, county?: string, region?: string, quarter?: number) =>
  _buildUrl('pdf', year, month, station_id, county, region, quarter)

export const getWordReportUrl = (year: number, month?: number, station_id?: number, county?: string, region?: string, quarter?: number) =>
  _buildUrl('word', year, month, station_id, county, region, quarter)

export const getCsvReportUrl = (year: number, month?: number, station_id?: number, county?: string, region?: string, quarter?: number) =>
  _buildUrl('csv', year, month, station_id, county, region, quarter)
