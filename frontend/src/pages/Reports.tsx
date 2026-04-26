import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getSummaryReport, getExcelReportUrl, getPdfReportUrl, getWordReportUrl, getCsvReportUrl } from '@/api/reports'
import { getStations } from '@/api/stations'
import { StationPicker } from '@/components/forms/StationPicker'
import { useAuth } from '@/hooks/useAuth'
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

export default function ReportsPage() {
  const { isDirector } = useAuth()
  const [year, setYear] = useState(new Date().getFullYear())
  const [region, setRegion] = useState<string>('')
  const [county, setCounty] = useState<string>('')
  const [stationId, setStationId] = useState<number | undefined>(undefined)
  const [activeTab, setActiveTab] = useState<DetailTab>('app')
  const [exportFormat, setExportFormat] = useState<'excel' | 'pdf' | 'word' | 'csv' | null>(null)
  const [pickedMonth, setPickedMonth] = useState<number | ''>('')
  const YEARS = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i)

  const { data: stations } = useQuery({ queryKey: ['stations'], queryFn: getStations })

  // Derived filter options
  const regions = [...new Set((stations ?? []).map((s) => s.region))].sort()
  const counties = [...new Set((stations ?? []).filter((s) => s.region === region).map((s) => s.county))].sort()
  const stationList = (stations ?? []).filter((s) => s.region === region && s.county === county).sort((a, b) => a.name.localeCompare(b.name))

  // Only pass region to API when no specific station is selected
  const activeRegion = stationId ? undefined : (region || undefined)

  const { data: report, isLoading } = useQuery({
    queryKey: ['report', 'summary', year, stationId, activeRegion],
    queryFn: () => getSummaryReport(year, stationId, activeRegion),
  })

  function handleRegionChange(r: string) {
    setRegion(r)
    setCounty('')
    setStationId(undefined)
  }

  function handleCountyChange(c: string) {
    setCounty(c)
    setStationId(undefined)
  }

  // Label showing current scope
  const scopeLabel = stationId
    ? (stations?.find((s) => s.id === stationId)?.name ?? `Station #${stationId}`)
    : region
      ? (county ? `${county} County, ${region} Region` : `${region} Region`)
      : 'All Regions'

  const monthlyBarData = report?.monthly.map((m) => ({
    name: m.month_name as string,
    Applications:   (m['app_grand_total'] as number) ?? 0,
    'IDs Received': (m['ids_grand_total'] as number) ?? 0,
    Rejections:     (m['rej_grand_total'] as number) ?? 0,
  })) ?? []

  const collectedLineData = report?.monthly.map((m) => ({
    name: m.month_name as string,
    Collected:   (m['collected_total']   as number) ?? 0,
    Uncollected: (m['uncollected_total'] as number) ?? 0,
  })) ?? []

  const token = localStorage.getItem('token')
  const isModuleTab = activeTab === 'app' || activeTab === 'ids' || activeTab === 'rej'

  const TABS: [DetailTab, string][] = [
    ['app',       'Applications'],
    ['ids',       'IDs Received'],
    ['rej',       'Rejections'],
    ['collected', 'Collected / Uncollected'],
    ['registers', 'Registers'],
  ]

  function downloadFile(url: string, filename: string) {
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const a = Object.assign(document.createElement('a'), {
          href: URL.createObjectURL(blob),
          download: filename,
        })
        a.click()
        URL.revokeObjectURL(a.href)
      })
  }

  const FORMAT_OPTS = [
    { value: 'excel', label: 'Excel (.xlsx)', ext: 'xlsx', directorOnly: false },
    { value: 'csv',   label: 'CSV (.csv)',    ext: 'csv',  directorOnly: false },
    { value: 'pdf',   label: 'PDF (.pdf)',    ext: 'pdf',  directorOnly: true  },
    { value: 'word',  label: 'Word (.docx)',  ext: 'docx', directorOnly: true  },
  ] as const

  const needsMonth = exportFormat === 'pdf' || exportFormat === 'word'

  function handleExportSelect(fmt: typeof FORMAT_OPTS[number]['value']) {
    if (fmt === 'pdf' || fmt === 'word') {
      setExportFormat(fmt)
      setPickedMonth(new Date().getMonth() + 1)
    } else {
      // Excel and CSV: download immediately (full year or with month filter)
      const urlFn = fmt === 'csv' ? getCsvReportUrl : getExcelReportUrl
      const url   = urlFn(year, undefined, stationId, activeRegion)
      const ext   = fmt === 'csv' ? 'csv' : 'xlsx'
      downloadFile(url, `nrb_report_${year}.${ext}`)
    }
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
                Export Report — {exportFormat.toUpperCase()}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {needsMonth
                  ? 'Select the month to include in this report'
                  : `Annual report for ${year}`}
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
                {needsMonth && pickedMonth
                  ? ` for ${MONTH_NAMES[Number(pickedMonth) - 1]} ${year}`
                  : ` — full year ${year}`}.
              </div>
            </div>
            <div className="px-6 pb-5 flex justify-end gap-3">
              <button className="btn-secondary" onClick={() => setExportFormat(null)}>Cancel</button>
              <button
                className="btn-primary"
                onClick={() => {
                  const m   = pickedMonth ? Number(pickedMonth) : undefined
                  const ext = exportFormat === 'pdf' ? 'pdf' : 'docx'
                  const url = exportFormat === 'pdf'
                    ? getPdfReportUrl(year, m, stationId, activeRegion)
                    : getWordReportUrl(year, m, stationId, activeRegion)
                  const suffix = m ? `_${String(m).padStart(2, '0')}` : ''
                  downloadFile(url, `nrb_report_${year}${suffix}.${ext}`)
                  setExportFormat(null)
                }}
              >
                Download
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-500 mt-1">NRB ID Statistics — {year} · <span className="font-medium text-primary-700">{scopeLabel}</span></p>
        </div>
        {/* Export dropdown */}
        <div className="flex items-center gap-2">
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

          {/* Region */}
          <div>
            <label className="label">Region</label>
            <select className="input w-52" value={region} onChange={(e) => handleRegionChange(e.target.value)}>
              <option value="">All Regions</option>
              {regions.map((r) => <option key={r} value={r}>{r} Region</option>)}
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

          {/* Station — shown when county selected */}
          {county && (
            <div>
              <label className="label">Station</label>
              <select className="input w-52" value={stationId ?? ''} onChange={(e) => setStationId(e.target.value ? Number(e.target.value) : undefined)}>
                <option value="">All Stations in {county}</option>
                {stationList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          {/* Clear button */}
          {(region || stationId) && (
            <div className="pb-0.5">
              <button
                type="button"
                className="text-xs text-red-500 hover:underline mt-5"
                onClick={() => { setRegion(''); setCounty(''); setStationId(undefined) }}
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
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={monthlyBarData}>
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
        </>
      )}
    </div>
  )
}
