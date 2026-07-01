import { apiClient } from './client'
import type { SummaryReport, MobileSummaryReport, TopCountiesReport } from '@/types'

export async function getSummaryReport(
  year: number,
  station_id?: number,
  county?: string,
  region?: string,
  quarter?: number,
  month?: number,
  subcounty?: string,
): Promise<SummaryReport> {
  const { data } = await apiClient.get<SummaryReport>('/reports/summary', {
    params: { year, station_id, county, region, quarter, month, subcounty },
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
  return `${apiClient.defaults.baseURL}/reports/${path}?${params}`
}

export const getExcelReportUrl = (year: number, month?: number, station_id?: number, county?: string, region?: string, quarter?: number) =>
  _buildUrl('excel', year, month, station_id, county, region, quarter)

export const getPdfReportUrl = (year: number, month?: number, station_id?: number, county?: string, region?: string, quarter?: number) =>
  _buildUrl('pdf', year, month, station_id, county, region, quarter)

export const getWordReportUrl = (year: number, month?: number, station_id?: number, county?: string, region?: string, quarter?: number) =>
  _buildUrl('word', year, month, station_id, county, region, quarter)

export const getCsvReportUrl = (year: number, month?: number, station_id?: number, county?: string, region?: string, quarter?: number) =>
  _buildUrl('csv', year, month, station_id, county, region, quarter)

export interface BreakdownRow {
  region: string; county: string; subcounty: string
  applications: number; ids_received: number; rejections: number; collected: number; submissions: number
}

export async function getBreakdownReport(
  year: number, month?: number, quarter?: number,
  region?: string, county?: string, subcounty?: string,
): Promise<{ rows: BreakdownRow[]; year: number; month?: number }> {
  const params: Record<string, string | number> = { year }
  if (month)     params.month    = month
  if (quarter)   params.quarter  = quarter
  if (region)    params.region   = region
  if (county)    params.county   = county
  if (subcounty) params.subcounty = subcounty
  const { data } = await apiClient.get('/reports/breakdown', { params })
  return data
}

export async function getMobileSummary(
  year: number,
  month?: number,
  quarter?: number,
  county?: string,
  subcounty?: string,
): Promise<MobileSummaryReport> {
  const { data } = await apiClient.get<MobileSummaryReport>('/reports/mobile-summary', {
    params: { year, month, quarter, county, subcounty },
  })
  return data
}

function _buildMobileUrl(
  path: string,
  year: number,
  month?: number,
  quarter?: number,
  county?: string,
  subcounty?: string,
): string {
  const params = new URLSearchParams({ year: String(year) })
  if (month)     params.set('month',     String(month))
  if (quarter)   params.set('quarter',   String(quarter))
  if (county)    params.set('county',    county)
  if (subcounty) params.set('subcounty', subcounty)
  return `${apiClient.defaults.baseURL}/reports/${path}?${params}`
}

export const getMobileExcelReportUrl = (year: number, month?: number, quarter?: number, county?: string, subcounty?: string) =>
  _buildMobileUrl('mobile-excel', year, month, quarter, county, subcounty)

export const getMobilePdfReportUrl = (year: number, month?: number, quarter?: number, county?: string, subcounty?: string) =>
  _buildMobileUrl('mobile-pdf', year, month, quarter, county, subcounty)

export const getMobileWordReportUrl = (year: number, month?: number, quarter?: number, county?: string, subcounty?: string) =>
  _buildMobileUrl('mobile-word', year, month, quarter, county, subcounty)

export async function getTopCounties(
  year: number,
  month?: number,
  quarter?: number,
  limit?: number,
): Promise<TopCountiesReport> {
  const { data } = await apiClient.get<TopCountiesReport>('/reports/top-counties', {
    params: { year, month, quarter, limit },
  })
  return data
}
