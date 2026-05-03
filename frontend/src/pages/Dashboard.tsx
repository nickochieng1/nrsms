import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { getSubmissions } from '@/api/submissions'
import { getSummaryReport } from '@/api/reports'
import { getStations } from '@/api/stations'
import { STATUS_COLORS, STATUS_LABELS } from '@/utils/format'
import { NRB_CATS, CAT_LABELS, MODULE_LABELS, MODULE_COLORS } from '@/types'
import type { ModulePrefix, MonthlyData } from '@/types'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'

type BgStyle = { bg: string; border: string; text: string }

const MODULE_BG: Record<ModulePrefix, BgStyle> = {
  app: { bg: 'bg-blue-50',  border: 'border-blue-200',  text: 'text-blue-700'  },
  ids: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700' },
  rej: { bg: 'bg-red-50',   border: 'border-red-200',   text: 'text-red-700'   },
}

const PREFIXES: ModulePrefix[] = ['app', 'ids', 'rej']
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const QUARTERS = [
  { q: 1, label: 'Q1', sub: 'Jan – Mar', months: [1, 2, 3],   color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200'   },
  { q: 2, label: 'Q2', sub: 'Apr – Jun', months: [4, 5, 6],   color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200'  },
  { q: 3, label: 'Q3', sub: 'Jul – Sep', months: [7, 8, 9],   color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200' },
  { q: 4, label: 'Q4', sub: 'Oct – Dec', months: [10, 11, 12], color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
]

function quarterTotals(monthly: MonthlyData[], months: number[]) {
  const rows = monthly.filter(m => months.includes(m.month as number))
  const sum = (k: string) => rows.reduce((s, m) => s + ((m[k] as number) ?? 0), 0)
  return {
    app:       sum('app_grand_total'),
    ids:       sum('ids_grand_total'),
    rej:       sum('rej_grand_total'),
    collected: sum('collected_total'),
  }
}

const CUR_YEAR = new Date().getFullYear()
const YEAR_OPTIONS = Array.from({ length: 8 }, (_, i) => CUR_YEAR - i)

export default function DashboardPage() {
  const { user, canApprove, canViewReports, myPendingStatus } = useAuth()
  const [year, setYear] = useState(CUR_YEAR)

  // Geographic scope derived from user's role assignment
  const scopeStationId = user?.station_id ?? undefined
  const scopeCounty    = user?.county    ?? undefined
  const scopeRegion    = user?.region    ?? undefined

  const { data: stations } = useQuery({
    queryKey: ['stations'],
    queryFn: getStations,
    enabled: !!scopeStationId,
  })

  const stationName = scopeStationId
    ? (stations?.find((s) => s.id === scopeStationId)?.name ?? `Station #${scopeStationId}`)
    : null

  const scopeLabel = stationName ?? scopeCounty ?? scopeRegion ?? null

  const { data: recentSubmissions } = useQuery({
    queryKey: ['submissions', 'recent'],
    queryFn: () => getSubmissions({ limit: 8 }),
  })

  const { data: report } = useQuery({
    queryKey: ['report', 'summary', year, scopeStationId, scopeCounty, scopeRegion],
    queryFn: () => getSummaryReport(year, scopeStationId, scopeCounty, scopeRegion),
    enabled: canViewReports,
  })

  const pendingCount = myPendingStatus
    ? (recentSubmissions?.filter((s) => s.status === myPendingStatus).length ?? 0)
    : 0

  const monthlyBarData = report?.monthly.map((m) => ({
    name: m.month_name as string,
    Applications:    (m['app_grand_total']  as number) ?? 0,
    'IDs Received':  (m['ids_grand_total']  as number) ?? 0,
    Rejections:      (m['rej_grand_total']  as number) ?? 0,
  })) ?? []

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">
            Welcome back, <span className="font-medium text-gray-700">{user?.full_name}</span>
            {scopeLabel
              ? <span className="ml-1 text-primary-600 font-medium">— {scopeLabel}</span>
              : <span> — {new Date().toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
            }
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-600">Year</label>
          <select
            className="input w-28 py-1.5"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {canApprove && myPendingStatus && pendingCount > 0 && (
        <Link
          to={`/submissions?status=${myPendingStatus}`}
          className="mb-6 p-4 rounded-xl flex items-center gap-3 hover:opacity-90 transition-opacity group border bg-yellow-50 border-yellow-300"
        >
          <div className="w-2 h-2 rounded-full flex-shrink-0 bg-yellow-400" />
          <p className="text-sm font-medium text-yellow-800">
            {pendingCount} submission{pendingCount !== 1 ? 's' : ''} awaiting your review
          </p>
          <span className="ml-auto text-xs font-medium text-yellow-600 group-hover:underline">
            Review now →
          </span>
        </Link>
      )}

      {report && (
        <>
          {/* Annual module summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {PREFIXES.map((px) => {
              const total  = ((report.totals[`${px}_grand_total`]  ?? 0) as number)
              const male   = ((report.totals[`${px}_grand_male`]   ?? 0) as number)
              const female = ((report.totals[`${px}_grand_female`] ?? 0) as number)
              const c = MODULE_BG[px]
              return (
                <div key={px} className={`rounded-xl border p-5 ${c.bg} ${c.border}`}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                    {MODULE_LABELS[px]} — {year}
                  </p>
                  <p className={`text-4xl font-bold ${c.text}`}>{total.toLocaleString()}</p>
                  <div className="mt-3 flex gap-5 text-sm text-gray-600">
                    <span><span className="font-semibold text-blue-600">M</span> {male.toLocaleString()}</span>
                    <span><span className="font-semibold text-pink-500">F</span> {female.toLocaleString()}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-x-2 gap-y-1 pt-3 border-t border-black/5">
                    {NRB_CATS.map((cat) => (
                      <div key={cat} className="text-xs text-gray-500">
                        {CAT_LABELS[cat]}{' '}
                        <span className="font-semibold text-gray-700">
                          {((report.totals[`${px}_${cat}_total`] ?? 0) as number).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Collected / Uncollected + registers */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { key: 'collected',   label: 'Collected IDs',     color: 'text-emerald-600' },
              { key: 'uncollected', label: 'Uncollected IDs',   color: 'text-orange-500'  },
            ].map(({ key, label, color }) => (
              <div key={key} className="card text-center">
                <p className="text-xs font-semibold uppercase text-gray-400 mb-1">{label}</p>
                <p className={`text-3xl font-bold ${color}`}>
                  {((report.totals[`${key}_total`] ?? 0) as number).toLocaleString()}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  M {((report.totals[`${key}_male`] ?? 0) as number).toLocaleString()} /{' '}
                  F {((report.totals[`${key}_female`] ?? 0) as number).toLocaleString()}
                </p>
              </div>
            ))}
            {[
              { prefix: 'reg136c', label: 'Reg. 136C Used',      color: 'text-purple-600' },
              { prefix: 'photo3a', label: 'Photo Papers 3A Used', color: 'text-cyan-600'   },
            ].map(({ prefix, label, color }) => (
              <div key={prefix} className="card text-center">
                <p className="text-xs font-semibold uppercase text-gray-400 mb-1">{label}</p>
                <p className={`text-3xl font-bold ${color}`}>
                  {((report.totals[`${prefix}_used`] ?? 0) as number).toLocaleString()}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Spoilt: {((report.totals[`${prefix}_spoilt`] ?? 0) as number).toLocaleString()}
                </p>
              </div>
            ))}
          </div>

          {/* Quarterly summary */}
          <div className="card mb-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Quarterly Summary — {year}</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {QUARTERS.map(({ q, label, sub, months, color, bg, border }) => {
                const qt = quarterTotals(report.monthly, months)
                return (
                  <div key={q} className={`rounded-xl border p-4 ${bg} ${border}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-sm font-bold ${color}`}>{label}</span>
                      <span className="text-xs text-gray-400">{sub}</span>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Applications</span>
                        <span className="font-semibold text-blue-700">{qt.app.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">IDs Received</span>
                        <span className="font-semibold text-green-700">{qt.ids.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Rejections</span>
                        <span className="font-semibold text-red-600">{qt.rej.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between pt-1.5 border-t border-black/5">
                        <span className="text-gray-500">Collected</span>
                        <span className="font-semibold text-emerald-700">{qt.collected.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Monthly bar chart */}
          <div className="card mb-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Monthly Overview — {year}</h2>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthlyBarData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
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
        </>
      )}

      {/* Recent submissions */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Recent Submissions</h2>
        </div>
        {!recentSubmissions?.length ? (
          <p className="p-6 text-sm text-gray-400">No submissions yet.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Period</th>
                <th className="text-right px-5 py-3 font-medium text-blue-600">Applications</th>
                <th className="text-right px-5 py-3 font-medium text-green-600">IDs Received</th>
                <th className="text-right px-5 py-3 font-medium text-red-600">Rejections</th>
                <th className="text-right px-5 py-3 font-medium text-gray-600">Collected</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recentSubmissions.map((sub) => (
                <tr key={sub.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium">
                    {MONTH_SHORT[sub.period_month - 1]} {sub.period_year}
                  </td>
                  <td className="px-5 py-3 text-right text-blue-700">{sub.app_grand_total.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right text-green-700">{sub.ids_grand_total.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right text-red-700">{sub.rej_grand_total.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right">{sub.collected_total.toLocaleString()}</td>
                  <td className="px-5 py-3">
                    <span className={`badge ${STATUS_COLORS[sub.status]}`}>
                      {STATUS_LABELS[sub.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  )
}
