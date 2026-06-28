import { apiClient } from './client'
import type { SummaryReport, MobileSummaryReport, TopCountiesReport } from '@/types'

export async function getSummaryReport(
  year: number,
  station_id?: number,
  county?: string,
  region?: string,
  quarter?: number,
  month?: number,
): Promise<SummaryReport> {
  const { data } = await apiClient.get<SummaryReport>('/reports/summary', {
    params: { year, station_id, county, region, quarter, month },
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
  return `/api/v1/reports/${path}?${params}`
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
