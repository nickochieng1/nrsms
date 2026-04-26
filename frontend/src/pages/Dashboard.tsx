import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { getSubmissions } from '@/api/submissions'
import { getSummaryReport } from '@/api/reports'
import { getStations } from '@/api/stations'
import { STATUS_COLORS, STATUS_LABELS } from '@/utils/format'
import { NRB_CATS, CAT_LABELS, MODULE_LABELS, MODULE_COLORS } from '@/types'
import type { ModulePrefix } from '@/types'
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

const CUR_YEAR = new Date().getFullYear()
const YEAR_OPTIONS = Array.from({ length: 8 }, (_, i) => CUR_YEAR - i)

export default function DashboardPage() {
  const { user, isRegistrar, isDirector } = useAuth()
  const [year, setYear] = useState(CUR_YEAR)

  const isStationScoped = user?.role === 'registrar'
  const scopedStationId = isStationScoped ? (user?.station_id ?? undefined) : undefined

  const { data: stations } = useQuery({
    queryKey: ['stations'],
    queryFn: getStations,
    enabled: isStationScoped,
  })

  const stationName = isStationScoped
    ? (stations?.find((s) => s.id === user?.station_id)?.name ?? `Station #${user?.station_id}`)
    : null

  const { data: recentSubmissions } = useQuery({
    queryKey: ['submissions', 'recent', scopedStationId],
    queryFn: () => getSubmissions({ limit: 8 }),
  })

  const { data: report } = useQuery({
    queryKey: ['report', 'summary', year, scopedStationId],
    queryFn: () => getSummaryReport(year, scopedStationId),
    enabled: isDirector || isRegistrar,
  })

  const pendingCount = recentSubmissions?.filter((s) =>
    isDirector ? s.status === 'registrar_approved' : s.status === 'submitted'
  ).length ?? 0

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
            {stationName && <span className="ml-1 text-primary-600 font-medium">— {stationName}</span>}
            {!stationName && <span> — {new Date().toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>}
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

      {(isRegistrar || isDirector) && pendingCount > 0 && (
        <Link
          to={`/submissions?status=${isDirector ? 'registrar_approved' : 'submitted'}`}
          className={`mb-6 p-4 rounded-xl flex items-center gap-3 hover:opacity-90 transition-opacity group border ${
            isDirector
              ? 'bg-purple-50 border-purple-300'
              : 'bg-yellow-50 border-yellow-300'
          }`}
        >
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isDirector ? 'bg-purple-400' : 'bg-yellow-400'}`} />
          <p className={`text-sm font-medium ${isDirector ? 'text-purple-800' : 'text-yellow-800'}`}>
            {pendingCount} submission{pendingCount !== 1 ? 's' : ''} awaiting your review
          </p>
          <span className={`ml-auto text-xs font-medium group-hover:underline ${isDirector ? 'text-purple-600' : 'text-yellow-600'}`}>
            Review now →
          </span>
        </Link>
      )}

      {report && (
        <>
          {/* 3 module summary cards */}
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

          {/* Secondary stat cards */}
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
