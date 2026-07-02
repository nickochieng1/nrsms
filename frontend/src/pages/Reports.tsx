import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  getSummaryReport, getExcelReportUrl, getPdfReportUrl, getWordReportUrl, getCsvReportUrl,
  getBreakdownReport, getLeagueTable, getTimelinessReport,
} from '@/api/reports'
import { KenyaMap } from '@/components/reports/KenyaMap'
import { getStations } from '@/api/stations'
import { useAuth } from '@/hooks/useAuth'
import { downloadFile } from '@/utils/downloadFile'
import { NRB_CATS, CAT_LABELS, CAT_COLORS, MODULE_LABELS, MODULE_COLORS } from '@/types'
import type { ModulePrefix } from '@/types'

const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December']
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, LineChart, Line,
} from 'recharts'

type DetailTab = ModulePrefix | 'collected' | 'registers'

const PREFIXES: ModulePrefix[] = ['app', 'ids', 'rej']

const QUARTER_LABELS: Record<number, string> = {
  1: 'Q1 (Jan – Mar)',
  2: 'Q2 (Apr – Jun)',
  3: 'Q3 (Jul – Sep)',
  4: 'Q4 (Oct – Dec)',
}

// ── Helper components ──────────────────────────────────────────────────────────
function ChangeChip({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return <span className="text-gray-300 text-xs">—</span>
  const up = pct >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? 'text-emerald-600' : 'text-red-600'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
  )
}

function CompletenessBar({ pct, submitted, expected }: { pct: number | null; submitted: number; expected: number }) {
  if (expected === 0) return <span className="text-gray-300 text-xs">No DCROPs</span>
  const p = pct ?? 0
  const color = p >= 80 ? 'bg-emerald-500' : p >= 50 ? 'bg-amber-400' : 'bg-red-400'
  const text = p >= 80 ? 'text-emerald-700' : p >= 50 ? 'text-amber-700' : 'text-red-700'
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.min(p, 100)}%` }} />
      </div>
      <span className={`text-xs font-medium ${text} whitespace-nowrap`}>{submitted}/{expected}</span>
    </div>
  )
}

export default function ReportsPage() {
  const { user, isDirector, isRegistrar, isRROP, isHQClerk } = useAuth()
  const [year, setYear] = useState(new Date().getFullYear())
  const [quarter, setQuarter] = useState<number | undefined>(undefined)
  const [month, setMonth] = useState<number | undefined>(undefined)
  const [leagueMetric, setLeagueMetric] = useState<'applications' | 'ids_received' | 'completeness'>('applications')
  const canViewLeague = isDirector || isRegistrar || isRROP || isHQClerk

  // Multi-period comparison
  const [compareMonth, setCompareMonth] = useState<number | undefined>(undefined)
  const [compareYear, setCompareYear] = useState<number>(new Date().getFullYear() - 1)
  // Pre-populate scope filters from user profile so each role starts
  // seeing only their area; they can narrow further but backend enforces scope.
  const [region, setRegion] = useState<string>(user?.region ?? '')
  const [county, setCounty] = useState<string>(user?.county ?? '')
  const [subcounty, setSubcounty] = useState<string>(user?.subcounty ?? '')
  const [stationId, setStationId] = useState<number | undefined>(undefined)
  const [activeTab, setActiveTab] = useState<DetailTab>('app')
  const [exportFormat, setExportFormat] = useState<'excel' | 'pdf' | 'word' | 'csv' | null>(null)
  const [pickedMonth, setPickedMonth] = useState<number | ''>('')
  const YEARS = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i)

  const { data: stations } = useQuery({ queryKey: ['stations'], queryFn: getStations })

  // Derived filter options
  const regions = [...new Set((stations ?? []).map((s) => s.region))].sort()
  const counties = [...new Set((stations ?? []).filter((s) => s.region === region).map((s) => s.county))].sort()
  // Subcounties come from station names within the selected county
  const subcounties = [...new Set((stations ?? []).filter((s) => s.county === county).map((s) => s.name))].sort()

  // All three geographic filters are independent and additive —
  // region + county + subcounty can all be active at the same time.
  const activeRegion    = stationId ? undefined : (region    || undefined)
  const activeCounty    = stationId ? undefined : (county    || undefined)
  const activeSubcounty = subcounty || undefined

  const qKey = ['report', year, quarter, month, stationId, activeRegion, activeCounty, activeSubcounty]

  const { data: report, isLoading } = useQuery({
    queryKey: ['report', 'summary', ...qKey],
    queryFn: () => getSummaryReport(year, stationId, activeCounty, activeRegion, quarter, month, activeSubcounty),
  })

  const { data: breakdown } = useQuery({
    queryKey: ['report', 'breakdown', ...qKey],
    queryFn: () => getBreakdownReport(year, month, quarter, activeRegion, activeCounty, activeSubcounty),
  })

  const { data: league } = useQuery({
    queryKey: ['report', 'league', year, month, quarter, activeRegion, leagueMetric],
    queryFn: () => getLeagueTable(year, month, quarter, activeRegion, leagueMetric),
    enabled: canViewLeague,
  })

  const { data: timeliness } = useQuery({
    queryKey: ['report', 'timeliness', year, activeRegion, activeCounty],
    queryFn: () => getTimelinessReport(year, activeRegion, activeCounty),
    enabled: canViewLeague,
  })

  // Comparison report — same scope, different period
  const { data: compareReport } = useQuery({
    queryKey: ['report', 'summary', 'compare', compareYear, compareMonth, activeRegion, activeCounty, activeSubcounty],
    queryFn: () => getSummaryReport(compareYear, stationId, activeCounty, activeRegion, undefined, compareMonth, activeSubcounty),
    enabled: compareMonth != null,
  })

  function handleRegionChange(r: string) {
    setRegion(r)
    setCounty('')
    setSubcounty('')
    setStationId(undefined)
  }

  function handleCountyChange(c: string) {
    setCounty(c)
    setSubcounty('')
    setStationId(undefined)
  }

  // Label showing current scope and period
  const periodLabel = month ? `${MONTH_NAMES[month - 1]} ${year}` : quarter ? QUARTER_LABELS[quarter] : `Full Year ${year}`
  const scopeLabel = stationId
    ? (stations?.find((s) => s.id === stationId)?.name ?? `Station #${stationId}`)
    : region
      ? (county ? `${county} County, ${region}` : region)
      : 'All Regions'

  const MONTH_SHORT_TO_NUM: Record<string, number> = {
    Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12
  }

  const monthlyBarData = report?.monthly.map((m) => ({
    name: m.month_name as string,
    Applications:   (m['app_grand_total'] as number) ?? 0,
    'IDs Received': (m['ids_grand_total'] as number) ?? 0,
    Rejections:     (m['rej_grand_total'] as number) ?? 0,
  })) ?? []

  function handleBarClick(data: any) {
    const name: string = data?.activeLabel ?? ''
    const num = MONTH_SHORT_TO_NUM[name]
    if (!num) return
    // Toggle — click the same month again to clear
    setMonth(month === num ? undefined : num)
    setQuarter(undefined)
  }

  const collectedLineData = report?.monthly.map((m) => ({
    name: m.month_name as string,
    Collected:   (m['collected_total']   as number) ?? 0,
    Uncollected: (m['uncollected_total'] as number) ?? 0,
  })) ?? []

  const isModuleTab = activeTab === 'app' || activeTab === 'ids' || activeTab === 'rej'

  const TABS: [DetailTab, string][] = [
    ['app',       'Applications'],
    ['ids',       'IDs Received'],
    ['rej',       'Rejections'],
    ['collected', 'Collected / Uncollected'],
    ['registers', 'Registers'],
  ]

  const FORMAT_OPTS = [
    { value: 'excel', label: 'Excel (.xlsx)', ext: 'xlsx', directorOnly: false },
    { value: 'csv',   label: 'CSV (.csv)',    ext: 'csv',  directorOnly: false },
    { value: 'pdf',   label: 'PDF (.pdf)',    ext: 'pdf',  directorOnly: true  },
    { value: 'word',  label: 'Word (.docx)',  ext: 'docx', directorOnly: true  },
  ] as const

  const needsMonth = exportFormat === 'pdf' || exportFormat === 'word'

  function handleExportSelect(fmt: typeof FORMAT_OPTS[number]['value']) {
    setExportFormat(fmt)
    setPickedMonth(fmt === 'pdf' || fmt === 'word' ? new Date().getMonth() + 1 : '')
  }

  function confirmExportDownload() {
    if (!exportFormat) return
    const m = needsMonth ? (pickedMonth ? Number(pickedMonth) : undefined) : month
    const ext = exportFormat === 'csv' ? 'csv' : exportFormat === 'excel' ? 'xlsx' : exportFormat === 'pdf' ? 'pdf' : 'docx'
    const urlFn = exportFormat === 'csv' ? getCsvReportUrl
      : exportFormat === 'excel' ? getExcelReportUrl
      : exportFormat === 'pdf' ? getPdfReportUrl
      : getWordReportUrl
    const url = urlFn(year, m, stationId, activeCounty, activeRegion, quarter, activeSubcounty)
    const suffix = m ? `_${String(m).padStart(2, '0')}` : quarter ? `_Q${quarter}` : '_annual'
    const scope = activeRegion ? `_${activeRegion.replace(/ /g, '_')}` : ''
    downloadFile(url, `nrb_report_${year}${suffix}${scope}.${ext}`)
    setExportFormat(null)
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Export modal — for PDF/Word lets user pick a month */}
      {exportFormat && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) setExportFormat(null) }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-96 mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="font-bold text-gray-900">
                Export Report — {FORMAT_OPTS.find((o) => o.value === exportFormat)?.label}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {needsMonth
                  ? 'Select the month to include in this report'
                  : month ? `${MONTH_NAMES[month - 1]} ${year}` : quarter ? `${QUARTER_LABELS[quarter]} ${year}` : `Annual report for ${year}`}
              </p>
            </div>
            <div className="px-6 py-5 space-y-4">
              {needsMonth && (
                <div>
                  <label className="label">Month</label>
                  <select
                    className="input"
                    value={pickedMonth}
                    onChange={(e) => setPickedMonth(Number(e.target.value))}
                  >
                    <option value="">— Full year —</option>
                    {MONTH_NAMES.map((m, i) => (
                      <option key={i + 1} value={i + 1}>{m} {year}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">
                    Leave blank to export all months for {year}
                  </p>
                </div>
              )}
              <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-blue-700">
                Report covers approved submissions for <strong>{scopeLabel}</strong>
                {needsMonth
                  ? (pickedMonth ? ` for ${MONTH_NAMES[Number(pickedMonth) - 1]} ${year}` : ` — full year ${year}`)
                  : (month ? ` for ${MONTH_NAMES[month - 1]} ${year}` : quarter ? ` for ${QUARTER_LABELS[quarter]} ${year}` : ` — full year ${year}`)}.
              </div>
            </div>
            <div className="px-6 pb-5 flex justify-end gap-3">
              <button className="btn-secondary" onClick={() => setExportFormat(null)}>Cancel</button>
              <button className="btn-primary" onClick={confirmExportDownload}>
                Download
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-500 mt-1">NRB ID Statistics — {periodLabel} · <span className="font-medium text-primary-700">{scopeLabel}</span></p>
        </div>
        {/* Export + Print */}
        <div className="flex items-center gap-2" data-noprint>
          <button
            onClick={() => window.print()}
            className="btn-secondary text-sm flex items-center gap-1.5"
            title="Print / Save as PDF"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print
          </button>
          <span className="text-sm font-medium text-gray-600">Export to:</span>
          <select
            className="input w-44 py-1.5"
            defaultValue=""
            onChange={(e) => {
              const val = e.target.value as typeof FORMAT_OPTS[number]['value']
              if (val) handleExportSelect(val)
              e.target.value = ''
            }}
          >
            <option value="" disabled>— Choose format —</option>
            {FORMAT_OPTS.filter((o) => !o.directorOnly || isDirector).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex gap-4 flex-wrap items-end">
          {/* Year */}
          <div>
            <label className="label">Year</label>
            <select className="input w-28" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {/* Quarter */}
          <div>
            <label className="label">Period</label>
            <select
              className="input w-44"
              value={quarter ?? ''}
              onChange={(e) => {
                setQuarter(e.target.value ? Number(e.target.value) : undefined)
                setMonth(undefined)
              }}
            >
              <option value="">Full Year (Annual)</option>
              <option value="1">Q1 — Jan, Feb, Mar</option>
              <option value="2">Q2 — Apr, May, Jun</option>
              <option value="3">Q3 — Jul, Aug, Sep</option>
              <option value="4">Q4 — Oct, Nov, Dec</option>
            </select>
          </div>

          {/* Month — overrides quarter/full-year when set */}
          <div>
            <label className="label">Month</label>
            <select
              className="input w-40"
              value={month ?? ''}
              onChange={(e) => {
                setMonth(e.target.value ? Number(e.target.value) : undefined)
                setQuarter(undefined)
              }}
            >
              <option value="">All months</option>
              {MONTH_NAMES.map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>

          {/* Region */}
          <div>
            <label className="label">Region</label>
            <select className="input w-52" value={region} onChange={(e) => handleRegionChange(e.target.value)}>
              <option value="">All Regions</option>
              {regions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* County — shown when region selected */}
          {region && (
            <div>
              <label className="label">County</label>
              <select className="input w-48" value={county} onChange={(e) => handleCountyChange(e.target.value)}>
                <option value="">All Counties</option>
                {counties.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          {/* Subcounty — shown when county selected */}
          {county && (
            <div>
              <label className="label">Subcounty</label>
              <select className="input w-48" value={subcounty} onChange={(e) => setSubcounty(e.target.value)}>
                <option value="">All Subcounties</option>
                {subcounties.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}

          {/* Clear button */}
          {(region || stationId || subcounty) && (
            <div className="pb-0.5">
              <button
                type="button"
                className="text-xs text-red-500 hover:underline mt-5"
                onClick={() => { setRegion(''); setCounty(''); setSubcounty(''); setStationId(undefined) }}
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </div>

      {isLoading && <p className="text-gray-400">Loading report…</p>}

      {report && (
        <>
          {/* 3 module annual summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {PREFIXES.map((px) => {
              const total  = ((report.totals[`${px}_grand_total`]  ?? 0) as number)
              const male   = ((report.totals[`${px}_grand_male`]   ?? 0) as number)
              const female = ((report.totals[`${px}_grand_female`] ?? 0) as number)
              return (
                <div key={px} className="card">
                  <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: MODULE_COLORS[px] }}>
                    {MODULE_LABELS[px]} — {year}
                  </p>
                  <p className="text-4xl font-bold text-gray-900 mb-2">{total.toLocaleString()}</p>
                  <div className="flex gap-5 text-sm mb-4">
                    <span className="text-blue-600 font-medium">M {male.toLocaleString()}</span>
                    <span className="text-pink-500 font-medium">F {female.toLocaleString()}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 pt-3 border-t border-gray-100">
                    {NRB_CATS.map((cat) => (
                      <div key={cat} className="text-center">
                        <p className="text-xs text-gray-400">{CAT_LABELS[cat]}</p>
                        <p className="text-sm font-semibold" style={{ color: CAT_COLORS[cat] }}>
                          {((report.totals[`${px}_${cat}_total`] ?? 0) as number).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Secondary stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="card text-center">
              <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Collected IDs</p>
              <p className="text-3xl font-bold text-emerald-600">{((report.totals['collected_total'] ?? 0) as number).toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-1">
                M {((report.totals['collected_male'] ?? 0) as number).toLocaleString()} /{' '}
                F {((report.totals['collected_female'] ?? 0) as number).toLocaleString()}
              </p>
            </div>
            <div className="card text-center">
              <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Uncollected IDs</p>
              <p className="text-3xl font-bold text-orange-500">{((report.totals['uncollected_total'] ?? 0) as number).toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-1">
                M {((report.totals['uncollected_male'] ?? 0) as number).toLocaleString()} /{' '}
                F {((report.totals['uncollected_female'] ?? 0) as number).toLocaleString()}
              </p>
            </div>
            <div className="card text-center">
              <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Reg. 136C Used</p>
              <p className="text-3xl font-bold text-purple-600">{((report.totals['reg136c_used'] ?? 0) as number).toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-1">Spoilt: {((report.totals['reg136c_spoilt'] ?? 0) as number).toLocaleString()}</p>
            </div>
            <div className="card text-center">
              <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Photo Papers 3A Used</p>
              <p className="text-3xl font-bold text-cyan-600">{((report.totals['photo3a_used'] ?? 0) as number).toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-1">Spoilt: {((report.totals['photo3a_spoilt'] ?? 0) as number).toLocaleString()}</p>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="card">
              <h2 className="font-semibold text-gray-900 mb-4">Monthly Applications vs IDs vs Rejections</h2>
              <p className="text-xs text-gray-400 mb-1">Click a bar to drill into that month · click again to clear</p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={monthlyBarData} onClick={handleBarClick} style={{ cursor: 'pointer' }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Applications"   fill={MODULE_COLORS.app} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="IDs Received"   fill={MODULE_COLORS.ids} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="Rejections"     fill={MODULE_COLORS.rej} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <h2 className="font-semibold text-gray-900 mb-4">Monthly Collected vs Uncollected</h2>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={collectedLineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="Collected"   stroke="#10b981" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Uncollected" stroke="#f97316" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Multi-period comparison ── */}
          <div className="card mt-6">
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Compare with another period</h2>
                <p className="text-xs text-gray-500 mt-0.5">Select a second period to compare side by side.</p>
              </div>
              <div className="flex items-center gap-2 ml-auto flex-wrap" data-noprint>
                <select className="input py-1 text-sm" value={compareYear}
                  onChange={e => setCompareYear(Number(e.target.value))}>
                  {Array.from({length:8},(_,i) => new Date().getFullYear()-i).map(y=>(
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <select className="input py-1 text-sm" value={compareMonth ?? ''}
                  onChange={e => setCompareMonth(e.target.value ? Number(e.target.value) : undefined)}>
                  <option value="">— Pick month —</option>
                  {MONTH_NAMES.map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
                </select>
                {compareMonth && (
                  <button className="text-xs text-gray-400 hover:text-gray-600" onClick={() => setCompareMonth(undefined)}>✕ Clear</button>
                )}
              </div>
            </div>

            {compareReport && compareMonth && (() => {
              const current = report?.totals
              const compare = compareReport.totals
              if (!current || !compare) return null
              const diffPct = (a: number, b: number) => b === 0 ? null : Math.round((a-b)/b*100)
              const pairs = [
                { label: 'Applications',   cur: current.app_grand_total as number, cmp: compare.app_grand_total as number, color: 'blue' },
                { label: 'IDs Received',   cur: current.ids_grand_total as number, cmp: compare.ids_grand_total as number, color: 'green' },
                { label: 'Rejections',     cur: current.rej_grand_total as number, cmp: compare.rej_grand_total as number, color: 'red' },
                { label: 'Collected IDs',  cur: current.collected_total as number, cmp: compare.collected_total as number, color: 'emerald' },
              ]
              const colorMap: Record<string,string> = {
                blue:'text-blue-700', green:'text-green-700', red:'text-red-700', emerald:'text-emerald-700'
              }
              const barData = report!.monthly.map((m, i) => ({
                name: m.month_name as string,
                Current:  (m['app_grand_total'] as number) ?? 0,
                Compare: (compareReport.monthly[i]?.['app_grand_total'] as number) ?? 0,
              }))
              return (
                <div className="mt-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    {pairs.map(p => {
                      const d = diffPct(p.cur, p.cmp)
                      return (
                        <div key={p.label} className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-500 mb-1">{p.label}</p>
                          <div className="flex gap-4 items-end">
                            <div>
                              <p className={`text-xl font-bold ${colorMap[p.color]}`}>{p.cur.toLocaleString()}</p>
                              <p className="text-[10px] text-gray-400">{periodLabel}</p>
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-gray-500">{p.cmp.toLocaleString()}</p>
                              <p className="text-[10px] text-gray-400">{MONTH_NAMES[(compareMonth??1)-1]} {compareYear}</p>
                            </div>
                          </div>
                          {d != null && (
                            <p className={`text-xs mt-1 font-medium ${d >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {d >= 0 ? '▲' : '▼'} {Math.abs(d)}% vs selected period
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={barData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Current" fill="#2563eb" radius={[2,2,0,0]} />
                      <Bar dataKey="Compare" fill="#93c5fd" radius={[2,2,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )
            })()}
          </div>

          {/* Tabbed monthly detail table */}
          <div className="card p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 flex flex-wrap gap-3 items-center justify-between">
              <h2 className="font-semibold text-gray-900">Monthly Breakdown — {year}</h2>
              <div className="flex flex-wrap gap-1">
                {TABS.map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      activeTab === key
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              {/* Applications / IDs Received / Rejections — same M/F/Total structure */}
              {isModuleTab && (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 sticky left-0 bg-gray-50 min-w-[72px]">Month</th>
                      {NRB_CATS.map((cat) => (
                        <th
                          key={cat}
                          colSpan={3}
                          className="text-center px-2 py-3 font-medium border-l border-gray-200 text-xs"
                          style={{ color: CAT_COLORS[cat] }}
                        >
                          {CAT_LABELS[cat]}
                        </th>
                      ))}
                      <th colSpan={3} className="text-center px-2 py-3 font-semibold text-gray-700 border-l border-gray-200 text-xs">
                        Grand
                      </th>
                    </tr>
                    <tr className="bg-gray-50 border-b border-gray-100 text-xs">
                      <th className="px-4 py-1 sticky left-0 bg-gray-50" />
                      {[...NRB_CATS, 'grand' as const].map((cat) => (
                        <>
                          <th key={`${cat}-m`} className="px-2 py-1 text-center border-l border-gray-200 text-blue-400 font-normal">M</th>
                          <th key={`${cat}-f`} className="px-2 py-1 text-center text-pink-400 font-normal">F</th>
                          <th key={`${cat}-t`} className="px-2 py-1 text-center text-gray-700 font-bold bg-gray-100">T</th>
                        </>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {report.monthly.map((row) => (
                      <tr key={row.month} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium sticky left-0 bg-white">{row.month_name as string}</td>
                        {NRB_CATS.map((cat) => (
                          <>
                            <td key={`${cat}-m`} className="px-2 py-2.5 text-center text-blue-600 border-l border-gray-100 text-xs">
                              {(row[`${activeTab}_${cat}_male`] as number).toLocaleString()}
                            </td>
                            <td key={`${cat}-f`} className="px-2 py-2.5 text-center text-pink-600 text-xs">
                              {(row[`${activeTab}_${cat}_female`] as number).toLocaleString()}
                            </td>
                            <td key={`${cat}-t`} className="px-2 py-2.5 text-center font-bold text-xs" style={{ color: CAT_COLORS[cat] }}>
                              {(row[`${activeTab}_${cat}_total`] as number).toLocaleString()}
                            </td>
                          </>
                        ))}
                        <td className="px-2 py-2.5 text-center text-blue-600 font-medium border-l border-gray-100 text-xs">
                          {(row[`${activeTab}_grand_male`] as number).toLocaleString()}
                        </td>
                        <td className="px-2 py-2.5 text-center text-pink-600 font-medium text-xs">
                          {(row[`${activeTab}_grand_female`] as number).toLocaleString()}
                        </td>
                        <td className="px-2 py-2.5 text-center font-bold text-gray-900 text-xs">
                          {(row[`${activeTab}_grand_total`] as number).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-700 font-bold border-t-2 border-slate-800 text-xs text-white">
                      <td className="px-4 py-3 sticky left-0 bg-slate-700">Total</td>
                      {NRB_CATS.map((cat) => (
                        <>
                          <td key={`${cat}-m`} className="px-2 py-3 text-center border-l border-slate-600">
                            {((report.totals[`${activeTab}_${cat}_male`] ?? 0) as number).toLocaleString()}
                          </td>
                          <td key={`${cat}-f`} className="px-2 py-3 text-center">
                            {((report.totals[`${activeTab}_${cat}_female`] ?? 0) as number).toLocaleString()}
                          </td>
                          <td key={`${cat}-t`} className="px-2 py-3 text-center text-yellow-300">
                            {((report.totals[`${activeTab}_${cat}_total`] ?? 0) as number).toLocaleString()}
                          </td>
                        </>
                      ))}
                      <td className="px-2 py-3 text-center border-l border-slate-600">
                        {((report.totals[`${activeTab}_grand_male`] ?? 0) as number).toLocaleString()}
                      </td>
                      <td className="px-2 py-3 text-center">
                        {((report.totals[`${activeTab}_grand_female`] ?? 0) as number).toLocaleString()}
                      </td>
                      <td className="px-2 py-3 text-center text-yellow-300">
                        {((report.totals[`${activeTab}_grand_total`] ?? 0) as number).toLocaleString()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}

              {/* Collected / Uncollected tab */}
              {activeTab === 'collected' && (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 min-w-[72px]">Month</th>
                      {/* Collected sub-columns */}
                      <th colSpan={3} className="text-center px-2 py-3 font-medium text-emerald-600 border-l border-gray-200 text-xs">NPR</th>
                      <th colSpan={3} className="text-center px-2 py-3 font-medium text-emerald-600 border-l border-gray-200 text-xs">Others</th>
                      <th colSpan={3} className="text-center px-2 py-3 font-medium text-emerald-600 border-l border-gray-200 text-xs">ID Rejected by Holders</th>
                      <th colSpan={3} className="text-center px-2 py-3 font-semibold text-emerald-700 border-l border-gray-300 text-xs bg-emerald-50">Collected Total</th>
                      {/* Uncollected sub-columns */}
                      <th colSpan={3} className="text-center px-2 py-3 font-medium text-orange-600 border-l border-gray-300 text-xs">NPR</th>
                      <th colSpan={3} className="text-center px-2 py-3 font-medium text-orange-600 border-l border-gray-200 text-xs">Others</th>
                      <th colSpan={3} className="text-center px-2 py-3 font-medium text-orange-600 border-l border-gray-200 text-xs">Lost & Found</th>
                      <th colSpan={3} className="text-center px-2 py-3 font-semibold text-orange-700 border-l border-gray-300 text-xs bg-orange-50">Uncollected Total</th>
                    </tr>
                    <tr className="bg-gray-50 border-b text-xs">
                      <th className="px-4 py-1" />
                      {[
                        'collected_npr','collected_others','collected_rejected','collected',
                        'uncollected_npr','uncollected_others','uncollected_lost','uncollected',
                      ].map((k) => (
                        <>
                          <th key={`${k}-m`} className="px-2 py-1 text-center border-l border-gray-200 text-blue-400 font-normal">M</th>
                          <th key={`${k}-f`} className="px-2 py-1 text-center text-pink-400 font-normal">F</th>
                          <th key={`${k}-t`} className="px-2 py-1 text-center text-gray-600 font-semibold">T</th>
                        </>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {report.monthly.map((row) => (
                      <tr key={row.month} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium">{row.month_name as string}</td>
                        {[
                          'collected_npr','collected_others','collected_rejected','collected',
                          'uncollected_npr','uncollected_others','uncollected_lost','uncollected',
                        ].map((k, i) => {
                          const isTotal = k === 'collected' || k === 'uncollected'
                          return (
                            <>
                              <td key={`${k}-m`} className={`px-2 py-2.5 text-center text-blue-600 text-xs ${i === 0 || i === 4 ? 'border-l border-gray-200' : 'border-l border-gray-100'} ${isTotal ? 'font-bold bg-gray-50' : ''}`}>
                                {(row[`${k}_male`] as number ?? 0).toLocaleString()}
                              </td>
                              <td key={`${k}-f`} className={`px-2 py-2.5 text-center text-pink-600 text-xs ${isTotal ? 'font-bold bg-gray-50' : ''}`}>
                                {(row[`${k}_female`] as number ?? 0).toLocaleString()}
                              </td>
                              <td key={`${k}-t`} className={`px-2 py-2.5 text-center text-xs font-bold ${isTotal ? (k === 'collected' ? 'text-emerald-700 bg-emerald-50' : 'text-orange-600 bg-orange-50') : 'text-gray-700'}`}>
                                {(row[`${k}_total`] as number ?? 0).toLocaleString()}
                              </td>
                            </>
                          )
                        })}
                      </tr>
                    ))}
                    <tr className="bg-slate-700 font-bold border-t-2 border-slate-800 text-xs text-white">
                      <td className="px-4 py-3">Total</td>
                      {[
                        'collected_npr','collected_others','collected_rejected','collected',
                        'uncollected_npr','uncollected_others','uncollected_lost','uncollected',
                      ].map((k, i) => {
                        const isTotal = k === 'collected' || k === 'uncollected'
                        return (
                          <>
                            <td key={`${k}-m`} className={`px-2 py-3 text-center ${i === 0 || i === 4 ? 'border-l border-slate-600' : ''}`}>
                              {((report.totals[`${k}_male`] ?? 0) as number).toLocaleString()}
                            </td>
                            <td key={`${k}-f`} className="px-2 py-3 text-center">
                              {((report.totals[`${k}_female`] ?? 0) as number).toLocaleString()}
                            </td>
                            <td key={`${k}-t`} className={`px-2 py-3 text-center ${isTotal ? 'text-yellow-300' : ''}`}>
                              {((report.totals[`${k}_total`] ?? 0) as number).toLocaleString()}
                            </td>
                          </>
                        )
                      })}
                    </tr>
                  </tbody>
                </table>
              )}

              {/* Registers tab */}
              {activeTab === 'registers' && (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Month</th>
                      <th colSpan={5} className="text-center px-2 py-3 font-medium text-purple-600 border-l border-gray-200">Reg. 136C</th>
                      <th colSpan={5} className="text-center px-2 py-3 font-medium text-cyan-600 border-l border-gray-200">Photo Papers 3A</th>
                    </tr>
                    <tr className="bg-gray-50 border-b text-xs text-gray-500">
                      <th className="px-4 py-1" />
                      {['reg136c', 'photo3a'].map((reg) => (
                        <>
                          <th key={`${reg}-bd`}  className="px-3 py-1 text-center border-l border-gray-200 font-normal">B/D</th>
                          <th key={`${reg}-u`}   className="px-3 py-1 text-center font-normal">Used</th>
                          <th key={`${reg}-sp`}  className="px-3 py-1 text-center text-red-400 font-normal">Spoilt</th>
                          <th key={`${reg}-ret`} className="px-3 py-1 text-center text-green-500 font-normal">Returned</th>
                          <th key={`${reg}-cf`}  className="px-3 py-1 text-center font-semibold text-gray-700">C/F</th>
                        </>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {report.monthly.map((row) => (
                      <tr key={row.month} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium">{row.month_name as string}</td>
                        {['reg136c', 'photo3a'].map((reg) => (
                          <>
                            <td key={`${reg}-bd`}  className="px-3 py-2.5 text-center text-gray-600 border-l border-gray-100">{(row[`${reg}_balance_bd`] as number).toLocaleString()}</td>
                            <td key={`${reg}-u`}   className="px-3 py-2.5 text-center text-gray-700">{(row[`${reg}_used`] as number).toLocaleString()}</td>
                            <td key={`${reg}-sp`}  className="px-3 py-2.5 text-center text-red-600">{(row[`${reg}_spoilt`] as number).toLocaleString()}</td>
                            <td key={`${reg}-ret`} className="px-3 py-2.5 text-center text-green-600">{(row[`${reg}_returned`] as number).toLocaleString()}</td>
                            <td key={`${reg}-cf`}  className="px-3 py-2.5 text-center font-bold text-gray-900">{(row[`${reg}_balance_cf`] as number).toLocaleString()}</td>
                          </>
                        ))}
                      </tr>
                    ))}
                    <tr className="bg-slate-700 font-bold border-t-2 border-slate-800 text-xs text-white">
                      <td className="px-4 py-3">Total</td>
                      {['reg136c', 'photo3a'].map((reg) => (
                        <>
                          <td key={`${reg}-bd`}  className="px-3 py-3 text-center border-l border-slate-600">{((report.totals[`${reg}_balance_bd`] ?? 0) as number).toLocaleString()}</td>
                          <td key={`${reg}-u`}   className="px-3 py-3 text-center">{((report.totals[`${reg}_used`] ?? 0) as number).toLocaleString()}</td>
                          <td key={`${reg}-sp`}  className="px-3 py-3 text-center">{((report.totals[`${reg}_spoilt`] ?? 0) as number).toLocaleString()}</td>
                          <td key={`${reg}-ret`} className="px-3 py-3 text-center">{((report.totals[`${reg}_returned`] ?? 0) as number).toLocaleString()}</td>
                          <td key={`${reg}-cf`}  className="px-3 py-3 text-center text-slate-400">—</td>
                        </>
                      ))}
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* ── Kenya County Choropleth Map ── */}
          {/* ── Timeliness Calendar Heatmap ── */}
          {canViewLeague && timeliness && timeliness.areas.length > 0 && (() => {
            const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
            const COLOR: Record<string, string> = {
              on_time: 'bg-emerald-500', late: 'bg-amber-400', missing: 'bg-gray-200'
            }
            const LABEL: Record<string, string> = {
              on_time: 'On time (≤ 3rd)', late: 'Late (after 3rd)', missing: 'No data'
            }
            return (
              <div className="card mt-6 p-0 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                  <h2 className="text-sm font-semibold text-gray-900">Data Timeliness — {year}</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Each cell = one month. Green = approved before the 3rd-of-month deadline, Amber = late, Grey = no data yet.
                  </p>
                </div>
                <div className="overflow-x-auto px-4 py-3">
                  <table className="text-xs w-full">
                    <thead>
                      <tr>
                        <th className="text-left py-1 pr-4 font-medium text-gray-600 w-48">Area</th>
                        {MO.map(m => (
                          <th key={m} className="text-center py-1 w-10 font-medium text-gray-500">{m}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {timeliness.areas.map(row => (
                        <tr key={row.area}>
                          <td className="py-1.5 pr-4 text-gray-700 font-medium whitespace-nowrap truncate max-w-[180px]" title={row.area}>
                            {row.area}
                          </td>
                          {Array.from({length: 12}, (_, i) => {
                            const status = row.months[String(i+1)] ?? 'missing'
                            return (
                              <td key={i} className="py-1.5 text-center">
                                <span
                                  className={`inline-block w-7 h-5 rounded ${COLOR[status]} cursor-default`}
                                  title={`${MO[i]}: ${LABEL[status]}`}
                                />
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex items-center gap-4 mt-3 pt-2 border-t border-gray-100">
                    {Object.entries(LABEL).map(([k, v]) => (
                      <span key={k} className="flex items-center gap-1.5 text-xs text-gray-500">
                        <span className={`inline-block w-5 h-3 rounded ${COLOR[k]}`} />
                        {v}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )
          })()}

          {canViewLeague && league && league.rows.length > 0 && (
            <div className="card mt-6">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Kenya County Map</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Hover over a county to see its figures. Counties with no approved data this period are shown in grey.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Colour by:</span>
                  {(['applications','ids_received','completeness'] as const).map(m => (
                    <button key={m} onClick={() => setLeagueMetric(m)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${leagueMetric === m ? 'bg-primary-700 text-white border-primary-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      {m === 'applications' ? 'Applications' : m === 'ids_received' ? 'IDs Received' : 'Completeness'}
                    </button>
                  ))}
                </div>
              </div>
              <KenyaMap rows={league.rows} metric={leagueMetric} />
            </div>
          )}

          {/* ── Hierarchical Breakdown with YoY + Completeness ── */}
          {breakdown && breakdown.rows.length > 0 && (() => {
            const tree: Record<string, Record<string, typeof breakdown.rows>> = {}
            for (const row of breakdown.rows) {
              if (!tree[row.region]) tree[row.region] = {}
              if (!tree[row.region][row.county]) tree[row.region][row.county] = []
              tree[row.region][row.county].push(row)
            }
            const sumN = (rows: typeof breakdown.rows, key: keyof typeof breakdown.rows[0]) =>
              rows.reduce((a, r) => a + Number(r[key] ?? 0), 0)

            return (
              <div className="card mt-6 p-0 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                  <h2 className="text-sm font-semibold text-gray-900">
                    Regional Breakdown — {year} vs {year - 1}
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Arrows show year-on-year change. Completeness bar = subcounties submitted out of DCROPs expected.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium text-gray-600 w-56">Area</th>
                        <th className="text-right px-4 py-2 font-medium text-blue-600">Applications</th>
                        <th className="text-right px-4 py-2 font-medium text-gray-400 text-xs">vs {year-1}</th>
                        <th className="text-right px-4 py-2 font-medium text-green-600">IDs Received</th>
                        <th className="text-right px-4 py-2 font-medium text-gray-400 text-xs">vs {year-1}</th>
                        <th className="px-4 py-2 font-medium text-gray-600 text-xs">Completeness</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(tree).sort(([a], [b]) => a.localeCompare(b)).map(([rgn, counties]) => {
                        const rgnRows = Object.values(counties).flat()
                        const rApp = sumN(rgnRows, 'applications')
                        const rPApp = sumN(rgnRows, 'prior_applications')
                        const rIds = sumN(rgnRows, 'ids_received')
                        const rPIds = sumN(rgnRows, 'prior_ids_received')
                        const rExp = sumN(rgnRows, 'expected_subcounties')
                        const rSub = sumN(rgnRows, 'submitted_subcounties')
                        return (
                          <>
                            <tr key={`r-${rgn}`} className="bg-primary-50 border-t-2 border-primary-200">
                              <td className="px-4 py-2.5 font-bold text-primary-900">{rgn}</td>
                              <td className="px-4 py-2.5 text-right font-bold text-primary-900">{rApp.toLocaleString()}</td>
                              <td className="px-4 py-2.5 text-right"><ChangeChip pct={rPApp ? Math.round((rApp-rPApp)/rPApp*100*10)/10 : null} /></td>
                              <td className="px-4 py-2.5 text-right font-bold text-primary-900">{rIds.toLocaleString()}</td>
                              <td className="px-4 py-2.5 text-right"><ChangeChip pct={rPIds ? Math.round((rIds-rPIds)/rPIds*100*10)/10 : null} /></td>
                              <td className="px-4 py-2.5"><CompletenessBar pct={rExp ? Math.round(rSub/rExp*100) : null} submitted={rSub} expected={rExp} /></td>
                            </tr>
                            {Object.entries(counties).sort(([a], [b]) => a.localeCompare(b)).map(([cty, subrows]) => {
                              const cApp = sumN(subrows, 'applications'), cPApp = sumN(subrows, 'prior_applications')
                              const cIds = sumN(subrows, 'ids_received'), cPIds = sumN(subrows, 'prior_ids_received')
                              const exp = subrows[0]?.expected_subcounties ?? 0
                              const sub = subrows[0]?.submitted_subcounties ?? 0
                              return (
                                <>
                                  <tr key={`c-${cty}`} className="bg-gray-50 border-t border-gray-200">
                                    <td className="px-4 py-2 font-semibold text-gray-800 pl-8"><span className="text-gray-300 mr-1">└</span>{cty} County</td>
                                    <td className="px-4 py-2 text-right font-semibold text-gray-700">{cApp.toLocaleString()}</td>
                                    <td className="px-4 py-2 text-right"><ChangeChip pct={cPApp ? Math.round((cApp-cPApp)/cPApp*100*10)/10 : null} /></td>
                                    <td className="px-4 py-2 text-right font-semibold text-gray-700">{cIds.toLocaleString()}</td>
                                    <td className="px-4 py-2 text-right"><ChangeChip pct={cPIds ? Math.round((cIds-cPIds)/cPIds*100*10)/10 : null} /></td>
                                    <td className="px-4 py-2"><CompletenessBar pct={exp ? Math.round(sub/exp*100) : null} submitted={sub} expected={exp} /></td>
                                  </tr>
                                  {subrows.sort((a, b) => a.subcounty.localeCompare(b.subcounty)).map((row, i) => (
                                    <tr key={`s-${cty}-${i}`} className="hover:bg-blue-50 border-t border-gray-100">
                                      <td className="px-4 py-2 text-gray-700 pl-16"><span className="text-gray-300 mr-1">└</span>{row.subcounty}</td>
                                      <td className="px-4 py-2 text-right text-blue-700">{row.applications.toLocaleString()}</td>
                                      <td className="px-4 py-2 text-right"><ChangeChip pct={row.app_change_pct} /></td>
                                      <td className="px-4 py-2 text-right text-green-700">{row.ids_received.toLocaleString()}</td>
                                      <td className="px-4 py-2 text-right"><ChangeChip pct={row.ids_change_pct} /></td>
                                      <td className="px-4 py-2 text-gray-400 text-xs">{row.submissions} submission(s)</td>
                                    </tr>
                                  ))}
                                </>
                              )
                            })}
                          </>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })()}

          {/* ── League Table ── */}
          {canViewLeague && league && league.rows.length > 0 && (
            <div className="card mt-6 p-0 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">County League Table</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Counties ranked by selected metric. ▲▼ shows year-on-year change.</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Rank by:</span>
                  {(['applications','ids_received','completeness'] as const).map(m => (
                    <button key={m} onClick={() => setLeagueMetric(m)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${leagueMetric === m ? 'bg-primary-700 text-white border-primary-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      {m === 'applications' ? 'Applications' : m === 'ids_received' ? 'IDs Received' : 'Completeness'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-center px-4 py-2 font-medium text-gray-600 w-12">#</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-600">County</th>
                      <th className="text-right px-4 py-2 font-medium text-blue-600">Applications</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-400 text-xs">vs {year-1}</th>
                      <th className="text-right px-4 py-2 font-medium text-green-600">IDs Received</th>
                      <th className="px-4 py-2 font-medium text-gray-600 text-xs">Completeness</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {league.rows.map((row) => {
                      const medal = row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : null
                      return (
                        <tr key={`${row.county}-${row.rank}`} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 text-center font-bold text-gray-400">
                            {medal ?? row.rank}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="font-medium text-gray-800">{row.county}</span>
                            <span className="text-xs text-gray-400 ml-2">{row.region}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-blue-700 font-medium">{row.applications.toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-right"><ChangeChip pct={row.app_change_pct} /></td>
                          <td className="px-4 py-2.5 text-right text-green-700">{row.ids_received.toLocaleString()}</td>
                          <td className="px-4 py-2.5">
                            <CompletenessBar
                              pct={row.completeness_pct}
                              submitted={row.submitted_subcounties}
                              expected={row.expected_subcounties}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
