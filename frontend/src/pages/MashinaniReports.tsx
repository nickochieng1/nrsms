import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  getMobileSummary, getMobileExcelReportUrl, getMobilePdfReportUrl, getMobileWordReportUrl,
} from '@/api/reports'
import { getStations } from '@/api/stations'
import { downloadFile } from '@/utils/downloadFile'

const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December']

const QUARTER_LABELS: Record<number, string> = {
  1: 'Q1 (Jan – Mar)',
  2: 'Q2 (Apr – Jun)',
  3: 'Q3 (Jul – Sep)',
  4: 'Q4 (Oct – Dec)',
}

const FORMAT_LABELS: Record<'excel' | 'pdf' | 'word', string> = {
  excel: 'Excel (.xlsx)',
  pdf: 'PDF (.pdf)',
  word: 'Word (.docx)',
}

export default function MashinaniReportsPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [quarter, setQuarter] = useState<number | undefined>(undefined)
  const [month, setMonth] = useState<number | undefined>(undefined)
  const [mashinaniCounty, setMashinaniCounty] = useState('')
  const [mashinaniSubcounty, setMashinaniSubcounty] = useState('')
  const [exportFormat, setExportFormat] = useState<'excel' | 'pdf' | 'word' | null>(null)
  const YEARS = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i)

  const { data: stations } = useQuery({ queryKey: ['stations'], queryFn: getStations })
  const mashinaniCounties = [...new Set((stations ?? []).map((s) => s.county))].sort()

  const { data: mobileSummary, isLoading } = useQuery({
    queryKey: ['report', 'mobile-summary', year, quarter, month, mashinaniCounty, mashinaniSubcounty],
    queryFn: () => getMobileSummary(year, month, quarter, mashinaniCounty || undefined, mashinaniSubcounty || undefined),
  })

  // Subcounty options — always unfiltered by subcounty itself, so picking a
  // county shows every subcounty available within it.
  const { data: mashinaniSubcountyData } = useQuery({
    queryKey: ['report', 'mobile-summary', 'subcounty-options', year, quarter, month, mashinaniCounty],
    queryFn: () => getMobileSummary(year, month, quarter, mashinaniCounty || undefined),
    enabled: !!mashinaniCounty,
  })
  const mashinaniSubcounties = [...new Set((mashinaniSubcountyData?.breakdown ?? []).map((r) => r.subcounty))].sort()

  function handleQuarterChange(q: string) {
    setQuarter(q ? Number(q) : undefined)
    setMonth(undefined)
  }

  function handleMonthChange(m: string) {
    setMonth(m ? Number(m) : undefined)
    setQuarter(undefined)
  }

  const periodLabel = month ? `${MONTH_NAMES[month - 1]} ${year}` : quarter ? QUARTER_LABELS[quarter] : `Full Year ${year}`

  function confirmExportDownload() {
    if (!exportFormat) return
    const urlFn = exportFormat === 'excel' ? getMobileExcelReportUrl : exportFormat === 'pdf' ? getMobilePdfReportUrl : getMobileWordReportUrl
    const ext = exportFormat === 'excel' ? 'xlsx' : exportFormat === 'pdf' ? 'pdf' : 'docx'
    const suffix = month ? `_${String(month).padStart(2, '0')}` : quarter ? `_Q${quarter}` : '_annual'
    const url = urlFn(year, month, quarter, mashinaniCounty || undefined, mashinaniSubcounty || undefined)
    downloadFile(url, `usajili_mashinani_${year}${suffix}.${ext}`)
    setExportFormat(null)
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Export confirmation popup — shows the chosen file type before downloading */}
      {exportFormat && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) setExportFormat(null) }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-96 mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="font-bold text-gray-900">Export Report — {FORMAT_LABELS[exportFormat]}</h2>
              <p className="text-xs text-gray-500 mt-0.5">{periodLabel}</p>
            </div>
            <div className="px-6 py-5">
              <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-blue-700">
                Usajili Mashinani data for <strong>{mashinaniCounty || 'All Counties'}{mashinaniSubcounty ? `, ${mashinaniSubcounty}` : ''}</strong> — {periodLabel}.
              </div>
            </div>
            <div className="px-6 pb-5 flex justify-end gap-3">
              <button className="btn-secondary" onClick={() => setExportFormat(null)}>Cancel</button>
              <button className="btn-primary" onClick={confirmExportDownload}>Download</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usajili Mashinani Report</h1>
          <p className="text-gray-500 mt-1">Mobile registration outreach — {periodLabel} · <span className="font-medium text-primary-700">{mashinaniCounty || 'All Counties'}</span></p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-600">Export to:</span>
          <select
            className="input w-44 py-1.5"
            defaultValue=""
            onChange={(e) => {
              const fmt = e.target.value as 'excel' | 'pdf' | 'word' | ''
              if (fmt) setExportFormat(fmt)
              e.target.value = ''
            }}
          >
            <option value="" disabled>— Choose format —</option>
            <option value="excel">Excel (.xlsx)</option>
            <option value="pdf">PDF (.pdf)</option>
            <option value="word">Word (.docx)</option>
          </select>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex gap-4 flex-wrap items-end">
          <div>
            <label className="label">Year</label>
            <select className="input w-28" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Quarter</label>
            <select className="input w-44" value={quarter ?? ''} onChange={(e) => handleQuarterChange(e.target.value)}>
              <option value="">Full Year (Annual)</option>
              <option value="1">Q1 — Jan, Feb, Mar</option>
              <option value="2">Q2 — Apr, May, Jun</option>
              <option value="3">Q3 — Jul, Aug, Sep</option>
              <option value="4">Q4 — Oct, Nov, Dec</option>
            </select>
          </div>
          <div>
            <label className="label">Month</label>
            <select className="input w-40" value={month ?? ''} onChange={(e) => handleMonthChange(e.target.value)}>
              <option value="">All months</option>
              {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="label">County</label>
            <select
              className="input w-44"
              value={mashinaniCounty}
              onChange={(e) => { setMashinaniCounty(e.target.value); setMashinaniSubcounty('') }}
            >
              <option value="">All counties</option>
              {mashinaniCounties.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={`label ${!mashinaniCounty ? 'text-gray-400' : ''}`}>Subcounty</label>
            <select
              className="input w-44 disabled:bg-gray-100 disabled:text-gray-400"
              value={mashinaniSubcounty}
              onChange={(e) => setMashinaniSubcounty(e.target.value)}
              disabled={!mashinaniCounty}
            >
              <option value="">{mashinaniCounty ? 'All subcounties' : '— Select a county first —'}</option>
              {mashinaniSubcounties.map((sc) => <option key={sc} value={sc}>{sc}</option>)}
            </select>
          </div>
          {(quarter || month || mashinaniCounty || mashinaniSubcounty) && (
            <button
              type="button"
              className="text-xs text-red-500 hover:underline pb-2"
              onClick={() => { setQuarter(undefined); setMonth(undefined); setMashinaniCounty(''); setMashinaniSubcounty('') }}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {isLoading && <p className="text-gray-400">Loading report…</p>}

      {mobileSummary && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="card text-center">
              <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Male</p>
              <p className="text-2xl font-bold text-blue-600">{mobileSummary.totals.male_total.toLocaleString()}</p>
            </div>
            <div className="card text-center">
              <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Female</p>
              <p className="text-2xl font-bold text-pink-600">{mobileSummary.totals.female_total.toLocaleString()}</p>
            </div>
            <div className="card text-center">
              <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Total Registered</p>
              <p className="text-2xl font-bold text-emerald-600">{mobileSummary.totals.total_registered.toLocaleString()}</p>
            </div>
            <div className="card text-center">
              <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Achievement</p>
              <p className="text-2xl font-bold text-blue-600">{mobileSummary.totals.target_achievement_pct.toFixed(1)}%</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="card text-center">
              <p className="text-xs font-semibold uppercase text-gray-400 mb-1">NPR — Live</p>
              <p className="text-xl font-bold text-red-600">{mobileSummary.totals.live_npr_total.toLocaleString()}</p>
            </div>
            <div className="card text-center">
              <p className="text-xs font-semibold uppercase text-gray-400 mb-1">NPR — Manual</p>
              <p className="text-xl font-bold text-amber-600">{mobileSummary.totals.manual_npr_total.toLocaleString()}</p>
            </div>
            <div className="card text-center">
              <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Duplicate/Replacement — Live</p>
              <p className="text-xl font-bold text-red-600">{mobileSummary.totals.live_replacement_total.toLocaleString()}</p>
            </div>
            <div className="card text-center">
              <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Duplicate/Replacement — Manual</p>
              <p className="text-xl font-bold text-amber-600">{mobileSummary.totals.manual_replacement_total.toLocaleString()}</p>
            </div>
          </div>

          {/* Target vs Achievement by County */}
          <div className="card p-0 overflow-hidden mb-6">
            <div className="px-5 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Target vs. Achievement — by County</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">County</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Target</th>
                    <th className="text-right px-4 py-3 font-medium text-emerald-600">Registered</th>
                    <th className="text-right px-4 py-3 font-medium text-blue-600">Achievement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {mobileSummary.county_totals.length === 0 && (
                    <tr><td colSpan={4} className="text-center py-8 text-gray-400">No Usajili Mashinani data for this period.</td></tr>
                  )}
                  {mobileSummary.county_totals.map((row) => (
                    <tr key={row.county} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium">{row.county}</td>
                      <td className="px-4 py-2.5 text-right">{row.target_set.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right text-emerald-700">{row.total_registered.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-blue-700">{row.target_achievement_pct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Registration Volume by County & Subcounty — NPR vs Replacement, Live vs Manual */}
          <div className="card p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Registration Volume — by County, Subcounty &amp; Ward</h2>
              <p className="text-xs text-gray-500 mt-0.5">NPR (Initial) vs. Duplicate/Replacement applications, captured Live or Manually</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th rowSpan={3} className="px-3 py-2 font-medium text-gray-600 text-left align-middle border-r border-gray-200">County</th>
                    <th rowSpan={3} className="px-3 py-2 font-medium text-gray-600 text-left align-middle border-r border-gray-200">Subcounty</th>
                    <th rowSpan={3} className="px-3 py-2 font-medium text-gray-600 text-left align-middle border-r border-gray-200">Ward</th>
                    <th colSpan={7} className="px-2 py-1.5 font-semibold text-center text-white bg-red-600">LIVE CAPTURE APPLICATIONS</th>
                    <th colSpan={7} className="px-2 py-1.5 font-semibold text-center text-white bg-amber-500 border-l border-gray-300">MANUAL APPLICATIONS</th>
                    <th rowSpan={3} className="px-3 py-2 font-semibold text-gray-700 text-right align-middle border-l border-gray-300 bg-gray-100">Total<br/>Registered</th>
                  </tr>
                  <tr>
                    <th colSpan={3} className="px-2 py-1 text-xs font-medium text-center text-red-700 bg-red-50">Initial (NPR)</th>
                    <th colSpan={3} className="px-2 py-1 text-xs font-medium text-center text-red-700 bg-red-50 border-l border-red-100">Others (Replacement)</th>
                    <th rowSpan={2} className="px-2 py-1 text-xs font-semibold text-center text-red-800 bg-red-100 align-middle border-l border-gray-300">Sub<br/>Total</th>
                    <th colSpan={3} className="px-2 py-1 text-xs font-medium text-center text-amber-700 bg-amber-50 border-l border-gray-300">Initial (NPR)</th>
                    <th colSpan={3} className="px-2 py-1 text-xs font-medium text-center text-amber-700 bg-amber-50 border-l border-amber-100">Others (Replacement)</th>
                    <th rowSpan={2} className="px-2 py-1 text-xs font-semibold text-center text-amber-800 bg-amber-100 align-middle border-l border-gray-300">Sub<br/>Total</th>
                  </tr>
                  <tr className="text-xs text-gray-400">
                    <th className="px-2 py-1 text-center font-normal">M</th>
                    <th className="px-2 py-1 text-center font-normal">F</th>
                    <th className="px-2 py-1 text-center font-semibold text-gray-600">T</th>
                    <th className="px-2 py-1 text-center font-normal border-l border-gray-100">M</th>
                    <th className="px-2 py-1 text-center font-normal">F</th>
                    <th className="px-2 py-1 text-center font-semibold text-gray-600">T</th>
                    <th className="px-2 py-1 text-center font-normal border-l border-gray-300">M</th>
                    <th className="px-2 py-1 text-center font-normal">F</th>
                    <th className="px-2 py-1 text-center font-semibold text-gray-600">T</th>
                    <th className="px-2 py-1 text-center font-normal border-l border-gray-100">M</th>
                    <th className="px-2 py-1 text-center font-normal">F</th>
                    <th className="px-2 py-1 text-center font-semibold text-gray-600">T</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {mobileSummary.breakdown.length === 0 && (
                    <tr><td colSpan={18} className="text-center py-8 text-gray-400">No Usajili Mashinani data for this period.</td></tr>
                  )}
                  {mobileSummary.breakdown.map((row) => (
                    <tr key={`${row.county}-${row.subcounty}-${row.ward}`} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium border-r border-gray-100">{row.county}</td>
                      <td className="px-3 py-2 text-gray-500 border-r border-gray-100">{row.subcounty}</td>
                      <td className="px-3 py-2 text-gray-500 border-r border-gray-100">{row.ward || '—'}</td>
                      <td className="px-2 py-2 text-center text-gray-600">{row.live_npr_male.toLocaleString()}</td>
                      <td className="px-2 py-2 text-center text-gray-600">{row.live_npr_female.toLocaleString()}</td>
                      <td className="px-2 py-2 text-center font-medium text-red-700">{row.live_npr_total.toLocaleString()}</td>
                      <td className="px-2 py-2 text-center text-gray-600 border-l border-gray-100">{row.live_replacement_male.toLocaleString()}</td>
                      <td className="px-2 py-2 text-center text-gray-600">{row.live_replacement_female.toLocaleString()}</td>
                      <td className="px-2 py-2 text-center font-medium text-red-700">{row.live_replacement_total.toLocaleString()}</td>
                      <td className="px-2 py-2 text-center font-bold text-red-800 bg-red-50 border-l border-gray-300">{row.live_total.toLocaleString()}</td>
                      <td className="px-2 py-2 text-center text-gray-600 border-l border-gray-300">{row.manual_npr_male.toLocaleString()}</td>
                      <td className="px-2 py-2 text-center text-gray-600">{row.manual_npr_female.toLocaleString()}</td>
                      <td className="px-2 py-2 text-center font-medium text-amber-700">{row.manual_npr_total.toLocaleString()}</td>
                      <td className="px-2 py-2 text-center text-gray-600 border-l border-gray-100">{row.manual_replacement_male.toLocaleString()}</td>
                      <td className="px-2 py-2 text-center text-gray-600">{row.manual_replacement_female.toLocaleString()}</td>
                      <td className="px-2 py-2 text-center font-medium text-amber-700">{row.manual_replacement_total.toLocaleString()}</td>
                      <td className="px-2 py-2 text-center font-bold text-amber-800 bg-amber-50 border-l border-gray-300">{row.manual_total.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-bold text-emerald-700 bg-gray-50 border-l border-gray-300">{row.total_registered.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                {mobileSummary.breakdown.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-700 font-bold text-white text-xs">
                      <td colSpan={3} className="px-3 py-3">GRAND TOTAL</td>
                      <td className="text-center">{mobileSummary.totals.live_npr_male.toLocaleString()}</td>
                      <td className="text-center">{mobileSummary.totals.live_npr_female.toLocaleString()}</td>
                      <td className="text-center text-yellow-300">{mobileSummary.totals.live_npr_total.toLocaleString()}</td>
                      <td className="text-center border-l border-slate-600">{mobileSummary.totals.live_replacement_male.toLocaleString()}</td>
                      <td className="text-center">{mobileSummary.totals.live_replacement_female.toLocaleString()}</td>
                      <td className="text-center text-yellow-300">{mobileSummary.totals.live_replacement_total.toLocaleString()}</td>
                      <td className="text-center bg-slate-800">{mobileSummary.totals.live_total.toLocaleString()}</td>
                      <td className="text-center border-l border-slate-600">{mobileSummary.totals.manual_npr_male.toLocaleString()}</td>
                      <td className="text-center">{mobileSummary.totals.manual_npr_female.toLocaleString()}</td>
                      <td className="text-center text-yellow-300">{mobileSummary.totals.manual_npr_total.toLocaleString()}</td>
                      <td className="text-center border-l border-slate-600">{mobileSummary.totals.manual_replacement_male.toLocaleString()}</td>
                      <td className="text-center">{mobileSummary.totals.manual_replacement_female.toLocaleString()}</td>
                      <td className="text-center text-yellow-300">{mobileSummary.totals.manual_replacement_total.toLocaleString()}</td>
                      <td className="text-center bg-slate-800">{mobileSummary.totals.manual_total.toLocaleString()}</td>
                      <td className="text-right px-3 bg-slate-900 text-yellow-300">{mobileSummary.totals.total_registered.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
