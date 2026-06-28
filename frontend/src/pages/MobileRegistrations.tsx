import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getMobileRegistrations, createMobileRegistration, updateMobileRegistration,
  closeMobileRegistration, reopenMobileRegistration,
} from '@/api/mobileRegistrations'
import { getMobileRegistrationTargets, setMobileRegistrationTarget } from '@/api/mobileRegistrationTargets'
import { getMobileSummary } from '@/api/reports'
import { getStations } from '@/api/stations'
import { useAuth } from '@/hooks/useAuth'
import { MONTH_NAMES } from '@/utils/format'
import type { MobileRegistration, MobileRegistrationEntry } from '@/types'

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const YEARS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)

// ── Row computation — mirrors backend services/mobile_computation.py ───────────
type EntryRow = {
  id?: number
  entry_date: string
  ward: string
  venue: string
  live_npr_male: number
  live_npr_female: number
  live_replacement_male: number
  live_replacement_female: number
  manual_npr_male: number
  manual_npr_female: number
  manual_replacement_male: number
  manual_replacement_female: number
}

function emptyRow(): EntryRow {
  return {
    entry_date: new Date().toISOString().slice(0, 10),
    ward: '', venue: '',
    live_npr_male: 0, live_npr_female: 0, live_replacement_male: 0, live_replacement_female: 0,
    manual_npr_male: 0, manual_npr_female: 0, manual_replacement_male: 0, manual_replacement_female: 0,
  }
}

function toEntryRow(e: MobileRegistrationEntry): EntryRow {
  return {
    id: e.id,
    entry_date: e.entry_date.slice(0, 10),
    ward: e.ward ?? '', venue: e.venue ?? '',
    live_npr_male: e.live_npr_male, live_npr_female: e.live_npr_female,
    live_replacement_male: e.live_replacement_male, live_replacement_female: e.live_replacement_female,
    manual_npr_male: e.manual_npr_male, manual_npr_female: e.manual_npr_female,
    manual_replacement_male: e.manual_replacement_male, manual_replacement_female: e.manual_replacement_female,
  }
}

function computeRow(r: EntryRow) {
  const live_npr_total = r.live_npr_male + r.live_npr_female
  const live_replacement_total = r.live_replacement_male + r.live_replacement_female
  const live_subtotal = live_npr_total + live_replacement_total
  const manual_npr_total = r.manual_npr_male + r.manual_npr_female
  const manual_replacement_total = r.manual_replacement_male + r.manual_replacement_female
  const manual_subtotal = manual_npr_total + manual_replacement_total
  const daily_total = live_subtotal + manual_subtotal
  return { live_npr_total, live_replacement_total, live_subtotal, manual_npr_total, manual_replacement_total, manual_subtotal, daily_total }
}

const NUM_FIELDS: (keyof EntryRow)[] = [
  'live_npr_male', 'live_npr_female', 'live_replacement_male', 'live_replacement_female',
  'manual_npr_male', 'manual_npr_female', 'manual_replacement_male', 'manual_replacement_female',
]

// ── Spreadsheet-style entries editor ────────────────────────────────────────────
function EntriesEditor({
  record, canEdit, onClose,
}: { record: MobileRegistration; canEdit: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const readOnly = !canEdit
  const [rows, setRows] = useState<EntryRow[]>(record.entries.map(toEntryRow))
  const [age2540, setAge2540] = useState({ male: record.age_25_40_male, female: record.age_25_40_female })
  const [age4160, setAge4160] = useState({ male: record.age_41_60_male, female: record.age_41_60_female })
  const [age60plus, setAge60plus] = useState({ male: record.age_60_plus_male, female: record.age_60_plus_female })

  const saveMutation = useMutation({
    mutationFn: () =>
      updateMobileRegistration(record.id, {
        entries: rows.map(({ id, ...rest }) => rest) as any,
        age_25_40_male: age2540.male, age_25_40_female: age2540.female,
        age_41_60_male: age4160.male, age_41_60_female: age4160.female,
        age_60_plus_male: age60plus.male, age_60_plus_female: age60plus.female,
      } as Partial<MobileRegistration>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mobile-registrations'] })
      qc.invalidateQueries({ queryKey: ['report'] })
      onClose()
    },
  })

  function updateRow(i: number, field: keyof EntryRow, value: string) {
    setRows((prev) => prev.map((r, idx) => {
      if (idx !== i) return r
      if (NUM_FIELDS.includes(field)) {
        return { ...r, [field]: Math.max(0, Number(value) || 0) }
      }
      return { ...r, [field]: value }
    }))
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()])
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i))
  }

  const computed = rows.map(computeRow)
  const cumulative = computed.reduce((acc, c) => ({
    live_npr_total: acc.live_npr_total + c.live_npr_total,
    live_replacement_total: acc.live_replacement_total + c.live_replacement_total,
    live_subtotal: acc.live_subtotal + c.live_subtotal,
    manual_npr_total: acc.manual_npr_total + c.manual_npr_total,
    manual_replacement_total: acc.manual_replacement_total + c.manual_replacement_total,
    manual_subtotal: acc.manual_subtotal + c.manual_subtotal,
    daily_total: acc.daily_total + c.daily_total,
  }), { live_npr_total: 0, live_replacement_total: 0, live_subtotal: 0, manual_npr_total: 0, manual_replacement_total: 0, manual_subtotal: 0, daily_total: 0 })

  const cellClass = 'w-16 text-center bg-transparent border-0 focus:ring-1 focus:ring-primary-400 rounded px-1 py-1 text-xs'

  return (
    <div className="bg-slate-50 p-4 space-y-4">
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th rowSpan={2} className="px-2 py-2 font-medium text-gray-600 text-left min-w-[110px]">Date</th>
              <th rowSpan={2} className="px-2 py-2 font-medium text-gray-600 text-left min-w-[100px]">Ward</th>
              <th rowSpan={2} className="px-2 py-2 font-medium text-gray-600 text-left min-w-[110px]">Venue/Center</th>
              <th colSpan={3} className="px-2 py-1 font-medium text-blue-600 text-center border-l border-gray-200">Live — NPR</th>
              <th colSpan={3} className="px-2 py-1 font-medium text-blue-600 text-center border-l border-gray-100">Live — Replacement</th>
              <th rowSpan={2} className="px-2 py-2 font-semibold text-blue-700 text-center border-l border-gray-300 bg-blue-50">Live Sub Total</th>
              <th colSpan={3} className="px-2 py-1 font-medium text-purple-600 text-center border-l border-gray-300">Manual — NPR</th>
              <th colSpan={3} className="px-2 py-1 font-medium text-purple-600 text-center border-l border-gray-100">Manual — Replacement</th>
              <th rowSpan={2} className="px-2 py-2 font-semibold text-purple-700 text-center border-l border-gray-300 bg-purple-50">Manual Sub Total</th>
              <th rowSpan={2} className="px-2 py-2 font-bold text-gray-800 text-center border-l border-gray-300 bg-gray-100">Daily Total</th>
              {!readOnly && <th rowSpan={2} className="px-2 py-2" />}
            </tr>
            <tr className="text-[10px] text-gray-400">
              {['live_npr_male','live_npr_female'].map((k) => <th key={k} className="px-1 py-1 border-l border-gray-200 font-normal">{k.includes('female') ? 'F' : 'M'}</th>)}
              <th className="px-1 py-1 font-semibold">T</th>
              {['live_replacement_male','live_replacement_female'].map((k) => <th key={k} className="px-1 py-1 border-l border-gray-100 font-normal">{k.endsWith('female') ? 'F' : 'M'}</th>)}
              <th className="px-1 py-1 font-semibold">T</th>
              {['manual_npr_male','manual_npr_female'].map((k) => <th key={k} className="px-1 py-1 border-l border-gray-300 font-normal">{k.endsWith('female') ? 'F' : 'M'}</th>)}
              <th className="px-1 py-1 font-semibold">T</th>
              {['manual_replacement_male','manual_replacement_female'].map((k) => <th key={k} className="px-1 py-1 border-l border-gray-100 font-normal">{k.endsWith('female') ? 'F' : 'M'}</th>)}
              <th className="px-1 py-1 font-semibold">T</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr><td colSpan={19} className="text-center py-6 text-gray-400">No daily entries yet.</td></tr>
            )}
            {rows.map((row, i) => {
              const c = computed[i]
              return (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-1 py-1">
                    {readOnly ? <span className="px-1">{row.entry_date}</span> :
                      <input type="date" value={row.entry_date} onChange={(e) => updateRow(i, 'entry_date', e.target.value)} className="w-28 text-xs border-0 bg-transparent focus:ring-1 focus:ring-primary-400 rounded px-1" />}
                  </td>
                  <td className="px-1 py-1">
                    {readOnly ? <span className="px-1">{row.ward}</span> :
                      <input value={row.ward} onChange={(e) => updateRow(i, 'ward', e.target.value)} className="w-24 text-xs border-0 bg-transparent focus:ring-1 focus:ring-primary-400 rounded px-1" placeholder="Ward" />}
                  </td>
                  <td className="px-1 py-1">
                    {readOnly ? <span className="px-1">{row.venue}</span> :
                      <input value={row.venue} onChange={(e) => updateRow(i, 'venue', e.target.value)} className="w-28 text-xs border-0 bg-transparent focus:ring-1 focus:ring-primary-400 rounded px-1" placeholder="Venue/Center" />}
                  </td>
                  {(['live_npr_male','live_npr_female'] as (keyof EntryRow)[]).map((f) => (
                    <td key={f} className="border-l border-gray-200">
                      {readOnly ? <span className="px-1">{row[f]}</span> :
                        <input type="number" min="0" value={row[f] as number} onChange={(e) => updateRow(i, f, e.target.value)} className={cellClass} />}
                    </td>
                  ))}
                  <td className="text-center font-semibold text-blue-700 bg-blue-50/40">{c.live_npr_total}</td>
                  {(['live_replacement_male','live_replacement_female'] as (keyof EntryRow)[]).map((f) => (
                    <td key={f} className="border-l border-gray-100">
                      {readOnly ? <span className="px-1">{row[f]}</span> :
                        <input type="number" min="0" value={row[f] as number} onChange={(e) => updateRow(i, f, e.target.value)} className={cellClass} />}
                    </td>
                  ))}
                  <td className="text-center font-semibold text-blue-700 bg-blue-50/40">{c.live_replacement_total}</td>
                  <td className="text-center font-bold text-blue-800 bg-blue-50 border-l border-gray-300">{c.live_subtotal}</td>
                  {(['manual_npr_male','manual_npr_female'] as (keyof EntryRow)[]).map((f) => (
                    <td key={f} className="border-l border-gray-300">
                      {readOnly ? <span className="px-1">{row[f]}</span> :
                        <input type="number" min="0" value={row[f] as number} onChange={(e) => updateRow(i, f, e.target.value)} className={cellClass} />}
                    </td>
                  ))}
                  <td className="text-center font-semibold text-purple-700 bg-purple-50/40">{c.manual_npr_total}</td>
                  {(['manual_replacement_male','manual_replacement_female'] as (keyof EntryRow)[]).map((f) => (
                    <td key={f} className="border-l border-gray-100">
                      {readOnly ? <span className="px-1">{row[f]}</span> :
                        <input type="number" min="0" value={row[f] as number} onChange={(e) => updateRow(i, f, e.target.value)} className={cellClass} />}
                    </td>
                  ))}
                  <td className="text-center font-semibold text-purple-700 bg-purple-50/40">{c.manual_replacement_total}</td>
                  <td className="text-center font-bold text-purple-800 bg-purple-50 border-l border-gray-300">{c.manual_subtotal}</td>
                  <td className="text-center font-bold text-gray-900 bg-gray-100 border-l border-gray-300">{c.daily_total}</td>
                  {!readOnly && (
                    <td className="text-center">
                      <button onClick={() => removeRow(i)} className="text-red-400 hover:text-red-600 text-xs px-1" title="Remove row">&times;</button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-slate-700 font-bold text-white text-xs">
                <td colSpan={3} className="px-2 py-2">Cumulative Total</td>
                <td colSpan={2} className="border-l border-slate-600" />
                <td className="text-center">{cumulative.live_npr_total}</td>
                <td colSpan={2} className="border-l border-slate-600" />
                <td className="text-center">{cumulative.live_replacement_total}</td>
                <td className="text-center bg-slate-800">{cumulative.live_subtotal}</td>
                <td colSpan={2} className="border-l border-slate-600" />
                <td className="text-center">{cumulative.manual_npr_total}</td>
                <td colSpan={2} className="border-l border-slate-600" />
                <td className="text-center">{cumulative.manual_replacement_total}</td>
                <td className="text-center bg-slate-800">{cumulative.manual_subtotal}</td>
                <td className="text-center bg-slate-900 text-yellow-300">{cumulative.daily_total}</td>
                {!readOnly && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {!readOnly && (
        <button onClick={addRow} className="text-xs btn-secondary py-1.5 px-3">+ Add Row</button>
      )}

      {/* Daily Report — NPR by age band */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Daily Report — NPR by Age Band</h3>
        <table className="text-xs w-full max-w-md">
          <thead>
            <tr className="text-gray-400">
              <th className="text-left py-1 font-normal">Age Band</th>
              <th className="text-center py-1 font-normal w-20">Male</th>
              <th className="text-center py-1 font-normal w-20">Female</th>
              <th className="text-center py-1 font-normal w-20">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {[
              { label: '25–40 Years', state: age2540, setState: setAge2540 },
              { label: '41–60 Years', state: age4160, setState: setAge4160 },
              { label: 'Above 60 Years', state: age60plus, setState: setAge60plus },
            ].map(({ label, state, setState }) => (
              <tr key={label}>
                <td className="py-1.5 text-gray-600">{label}</td>
                <td className="text-center">
                  {readOnly ? state.male :
                    <input type="number" min="0" value={state.male} onChange={(e) => setState((s) => ({ ...s, male: Math.max(0, Number(e.target.value) || 0) }))} className="w-16 text-center border border-gray-200 rounded px-1 py-0.5" />}
                </td>
                <td className="text-center">
                  {readOnly ? state.female :
                    <input type="number" min="0" value={state.female} onChange={(e) => setState((s) => ({ ...s, female: Math.max(0, Number(e.target.value) || 0) }))} className="w-16 text-center border border-gray-200 rounded px-1 py-0.5" />}
                </td>
                <td className="text-center font-semibold text-gray-700">{state.male + state.female}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-3">
        {canEdit && (
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="btn-primary"
          >
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        )}
        <button onClick={onClose} className="btn-secondary">Close</button>
      </div>
    </div>
  )
}

// ── County Targets — one target per county/month, shared across its subcounty exercises ──
function CountyTargetsPanel({ year, isRegistrar }: { year: number; isRegistrar: boolean }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<{ county: string; period_month: number; period_year: number } | null>(null)
  const [editValue, setEditValue] = useState(0)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newCounty, setNewCounty] = useState('')
  const [newMonth, setNewMonth] = useState(new Date().getMonth() + 1)
  const [newTarget, setNewTarget] = useState(0)

  const { data: targets, isLoading } = useQuery({
    queryKey: ['mobile-registration-targets', year],
    queryFn: () => getMobileRegistrationTargets(year),
  })

  const { data: stations } = useQuery({ queryKey: ['stations'], queryFn: getStations, enabled: isRegistrar })
  const allCounties = [...new Set((stations ?? []).map((s) => s.county))].sort()

  const setMutation = useMutation({
    mutationFn: (payload: { county: string; period_month: number; period_year: number; target_set: number }) =>
      setMobileRegistrationTarget(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mobile-registration-targets'] })
      qc.invalidateQueries({ queryKey: ['mobile-registrations'] })
      qc.invalidateQueries({ queryKey: ['report'] })
      setEditing(null)
      setShowAddForm(false)
      setNewCounty(''); setNewTarget(0)
    },
  })

  if (!isRegistrar && !isLoading && !targets?.length) return null

  return (
    <div className="card mb-6">
      <div className="flex items-start justify-between mb-1">
        <h2 className="font-semibold text-gray-900">County Targets — {year}</h2>
        {isRegistrar && (
          <button onClick={() => setShowAddForm((s) => !s)} className="text-xs btn-primary py-1.5 px-3">
            + Set Target for a County
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Set once per county per month by the registrar, before any clerk enters data — shared across every
        subcounty exercise running there. A county only becomes available to clerks once it has a target.
      </p>

      {showAddForm && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 mb-4 flex gap-3 flex-wrap items-end">
          <div>
            <label className="label">County</label>
            <select className="input" value={newCounty} onChange={(e) => setNewCounty(e.target.value)}>
              <option value="">— Select county —</option>
              {allCounties.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Month</label>
            <select className="input" value={newMonth} onChange={(e) => setNewMonth(Number(e.target.value))}>
              {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Target</label>
            <input type="number" min="0" className="input w-32" value={newTarget} onChange={(e) => setNewTarget(Math.max(0, Number(e.target.value) || 0))} />
          </div>
          <button
            onClick={() => setMutation.mutate({ county: newCounty, period_month: newMonth, period_year: year, target_set: newTarget })}
            disabled={!newCounty || setMutation.isPending}
            className="btn-primary"
          >
            {setMutation.isPending ? 'Saving…' : 'Save Target'}
          </button>
          <button onClick={() => setShowAddForm(false)} className="btn-secondary">Cancel</button>
        </div>
      )}

      {!isLoading && !targets?.length && (
        <p className="text-sm text-gray-400 py-4">
          {isRegistrar ? 'No targets set yet for this year.' : 'No counties are active yet — ask your registrar to set a target first.'}
        </p>
      )}

      {!!targets?.length && (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-gray-600">County</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Period</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Target</th>
              <th className="text-right px-4 py-2 font-medium text-emerald-600">Registered</th>
              <th className="text-right px-4 py-2 font-medium text-blue-600">Achievement</th>
              {isRegistrar && <th className="text-left px-4 py-2 font-medium text-gray-600">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr><td colSpan={isRegistrar ? 6 : 5} className="text-center py-6 text-gray-400">Loading…</td></tr>
            )}
            {targets?.map((t) => {
              const isEditing = editing?.county === t.county
                && editing.period_month === t.period_month && editing.period_year === t.period_year
              return (
                <tr key={`${t.county}-${t.period_month}-${t.period_year}`}>
                  <td className="px-4 py-2 font-medium">{t.county}</td>
                  <td className="px-4 py-2 text-gray-500">{MONTH_NAMES[t.period_month - 1]} {t.period_year}</td>
                  <td className="px-4 py-2 text-right">
                    {isEditing ? (
                      <input
                        type="number" min="0" autoFocus
                        className="input w-28 text-right inline-block py-1"
                        value={editValue}
                        onChange={(e) => setEditValue(Math.max(0, Number(e.target.value) || 0))}
                      />
                    ) : t.target_set.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right text-emerald-700">{t.total_registered.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right font-medium text-blue-700">{t.target_achievement_pct.toFixed(1)}%</td>
                  {isRegistrar && (
                    <td className="px-4 py-2">
                      {isEditing ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => setMutation.mutate({
                              county: t.county, period_month: t.period_month, period_year: t.period_year,
                              target_set: editValue,
                            })}
                            disabled={setMutation.isPending}
                            className="text-xs btn-primary py-1 px-2"
                          >
                            Save
                          </button>
                          <button onClick={() => setEditing(null)} className="text-xs btn-secondary py-1 px-2">Cancel</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditing({ county: t.county, period_month: t.period_month, period_year: t.period_year }); setEditValue(t.target_set) }}
                          className="text-xs btn-secondary py-1 px-2"
                        >
                          Set Target
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      )}
    </div>
  )
}

// ── Director dashboard — read-only summary, filterable by month ────────────────
function DirectorMashinaniDashboard() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState<number | ''>(new Date().getMonth() + 1)

  const { data: summary, isLoading } = useQuery({
    queryKey: ['report', 'mobile-summary', year, month],
    queryFn: () => getMobileSummary(year, month ? Number(month) : undefined),
  })

  const periodLabel = month ? `${MONTH_NAMES[Number(month) - 1]} ${year}` : `Full Year ${year}`

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Usajili Mashinani</h1>
        <p className="text-gray-500 mt-1">Mobile registration outreach — performance summary, {periodLabel}</p>
      </div>

      <div className="card mb-6 flex gap-4 flex-wrap items-end">
        <div>
          <label className="label">Year</label>
          <select className="input w-28" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Month</label>
          <select className="input w-40" value={month} onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Full year</option>
            {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
        </div>
      </div>

      {isLoading && <p className="text-gray-400">Loading…</p>}

      {summary && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
            <div className="card text-center">
              <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Total Registered</p>
              <p className="text-3xl font-bold text-emerald-600">{summary.totals.total_registered.toLocaleString()}</p>
            </div>
            <div className="card text-center">
              <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Target Set</p>
              <p className="text-3xl font-bold text-gray-700">{summary.totals.target_set.toLocaleString()}</p>
            </div>
            <div className="card text-center">
              <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Achievement</p>
              <p className="text-3xl font-bold text-blue-600">{summary.totals.target_achievement_pct.toFixed(1)}%</p>
            </div>
            <div className="card text-center">
              <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Counties Covered</p>
              <p className="text-3xl font-bold text-indigo-600">{summary.totals.counties_covered}</p>
            </div>
            <div className="card text-center">
              <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Subcounties Covered</p>
              <p className="text-3xl font-bold text-indigo-600">{summary.totals.subcounties_covered}</p>
            </div>
          </div>

          <div className="card p-0 overflow-hidden mb-6">
            <div className="px-5 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Target vs. Achievement — by County</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">County</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Target Set</th>
                    <th className="text-right px-4 py-3 font-medium text-emerald-600">Total Registered</th>
                    <th className="text-right px-4 py-3 font-medium text-blue-600">Achievement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {summary.county_totals.length === 0 && (
                    <tr><td colSpan={4} className="text-center py-10 text-gray-400">No Usajili Mashinani data for this period.</td></tr>
                  )}
                  {summary.county_totals.map((row) => (
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

          <div className="card p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Registration Volume — by County &amp; Subcounty</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">County</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Subcounty</th>
                    <th className="text-right px-4 py-3 font-medium text-blue-600">Live Capture</th>
                    <th className="text-right px-4 py-3 font-medium text-purple-600">Manual</th>
                    <th className="text-right px-4 py-3 font-medium text-emerald-600">Total Registered</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {summary.breakdown.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-10 text-gray-400">No Usajili Mashinani data for this period.</td></tr>
                  )}
                  {summary.breakdown.map((row) => (
                    <tr key={`${row.county}-${row.subcounty}`} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium">{row.county}</td>
                      <td className="px-4 py-2.5 text-gray-500">{row.subcounty}</td>
                      <td className="px-4 py-2.5 text-right text-blue-700">{row.live_total.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right text-purple-700">{row.manual_total.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-emerald-700">{row.total_registered.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Clerk / Registrar view — continuous daily entry, registrar owns target/close ──
function ClerkRegistrarMashinaniView() {
  const { user, isClerk, isRegistrar } = useAuth()
  const qc = useQueryClient()
  const [closedFilter, setClosedFilter] = useState<'open' | 'closed' | ''>('open')
  const [yearFilter, setYearFilter] = useState<number>(new Date().getFullYear())
  const [monthFilter, setMonthFilter] = useState<number | ''>('')
  const [countyFilter, setCountyFilter] = useState('')
  const [subcountyFilter, setSubcountyFilter] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newCounty, setNewCounty] = useState('')
  const [newSubcounty, setNewSubcounty] = useState('')
  const [newMonth, setNewMonth] = useState(new Date().getMonth() + 1)
  const [newYear, setNewYear] = useState(new Date().getFullYear())

  const { data: records, isLoading } = useQuery({
    queryKey: ['mobile-registrations', closedFilter, yearFilter, monthFilter, countyFilter, subcountyFilter],
    queryFn: () => getMobileRegistrations({
      is_closed: closedFilter === '' ? undefined : closedFilter === 'closed',
      year: yearFilter, month: monthFilter || undefined,
      county: countyFilter || undefined, subcounty: subcountyFilter || undefined,
      limit: 200,
    }),
  })

  const { data: filterStations } = useQuery({ queryKey: ['stations'], queryFn: getStations })
  const filterRegionStations = (filterStations ?? []).filter(
    (s) => isRegistrar || !user?.region || s.region.toLowerCase() === user.region.toLowerCase(),
  )
  const filterCounties = [...new Set(filterRegionStations.map((s) => s.county))].sort()

  // County options for the "+ New Month" form come from active targets only —
  // a county must have a registrar-set target before a clerk can log against it.
  const { data: activeTargets } = useQuery({
    queryKey: ['mobile-registration-targets', newYear, newMonth],
    queryFn: () => getMobileRegistrationTargets(newYear, newMonth),
    enabled: isClerk,
  })
  const availableCounties = [...new Set(
    (activeTargets ?? []).filter((t) => t.target_set > 0).map((t) => t.county),
  )].sort()

  const createMutation = useMutation({
    mutationFn: () => createMobileRegistration({
      county: newCounty, subcounty: newSubcounty, period_month: newMonth, period_year: newYear, entries: [],
    } as Partial<MobileRegistration>),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['mobile-registrations'] })
      qc.invalidateQueries({ queryKey: ['report'] })
      setShowNewForm(false)
      setNewCounty(''); setNewSubcounty('')
      setExpandedId(created.id)
    },
  })

  const closeMutation = useMutation({
    mutationFn: (id: number) => closeMobileRegistration(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mobile-registrations'] })
      qc.invalidateQueries({ queryKey: ['report'] })
    },
  })

  const reopenMutation = useMutation({
    mutationFn: (id: number) => reopenMobileRegistration(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mobile-registrations'] })
      qc.invalidateQueries({ queryKey: ['report'] })
    },
  })

  function handleRowClick(rec: MobileRegistration) {
    setExpandedId(expandedId === rec.id ? null : rec.id)
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usajili Mashinani</h1>
          <p className="text-gray-500 mt-1">Mobile registration outreach — daily field log by county, subcounty &amp; venue</p>
        </div>
        {isClerk && (
          <button onClick={() => setShowNewForm((s) => !s)} className="btn-primary">+ New Month</button>
        )}
      </div>

      <CountyTargetsPanel year={yearFilter} isRegistrar={isRegistrar} />

      {showNewForm && (
        <div className="card mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">Start a New Month</h2>
          <p className="text-xs text-gray-500 mb-3">
            Only counties your registrar has already set a target for, for the selected month, are available below.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="label">County</label>
              <select className="input" value={newCounty} onChange={(e) => setNewCounty(e.target.value)}>
                <option value="">— Select county —</option>
                {availableCounties.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {!availableCounties.length && (
                <p className="text-xs text-amber-600 mt-1">No counties available for {MONTH_NAMES[newMonth - 1]} {newYear} yet — ask your registrar to set a target.</p>
              )}
            </div>
            <div>
              <label className="label">Subcounty</label>
              <input className="input" placeholder="e.g. Teso North" value={newSubcounty} onChange={(e) => setNewSubcounty(e.target.value)} />
            </div>
            <div>
              <label className="label">Month</label>
              <select className="input" value={newMonth} onChange={(e) => setNewMonth(Number(e.target.value))}>
                {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Year</label>
              <select className="input" value={newYear} onChange={(e) => setNewYear(Number(e.target.value))}>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => createMutation.mutate()}
              disabled={!newCounty || !newSubcounty || createMutation.isPending}
              className="btn-primary"
            >
              {createMutation.isPending ? 'Creating…' : 'Create & Start Entering Data'}
            </button>
            <button onClick={() => setShowNewForm(false)} className="btn-secondary">Cancel</button>
          </div>
          {createMutation.isError && (
            <p className="text-xs text-red-600 mt-2">
              {(createMutation.error as any)?.response?.data?.detail ?? 'Failed to create record'}
            </p>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="card mb-6 flex gap-4 flex-wrap items-end">
        <div>
          <label className="label">Status</label>
          <select className="input" value={closedFilter} onChange={(e) => setClosedFilter(e.target.value as 'open' | 'closed' | '')}>
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        <div>
          <label className="label">Year</label>
          <select className="input" value={yearFilter} onChange={(e) => setYearFilter(Number(e.target.value))}>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Month</label>
          <select className="input w-40" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value ? Number(e.target.value) : '')}>
            <option value="">All months</option>
            {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="label">County</label>
          <select className="input w-44" value={countyFilter} onChange={(e) => { setCountyFilter(e.target.value); setSubcountyFilter('') }}>
            <option value="">All counties</option>
            {filterCounties.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Subcounty</label>
          <input className="input w-40" placeholder="e.g. Teso North" value={subcountyFilter} onChange={(e) => setSubcountyFilter(e.target.value)} />
        </div>
        {(monthFilter || countyFilter || subcountyFilter) && (
          <button
            type="button"
            className="text-xs text-red-500 hover:underline pb-2"
            onClick={() => { setMonthFilter(''); setCountyFilter(''); setSubcountyFilter('') }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Monthly report — totals for the current filter selection */}
      {!!records?.length && (
        <div className="card mb-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Exercises</p>
            <p className="text-2xl font-bold text-gray-700">{records.length}</p>
          </div>
          <div className="text-center">
            <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Days Logged</p>
            <p className="text-2xl font-bold text-gray-700">{records.reduce((s, r) => s + r.entries.length, 0)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Total Registered</p>
            <p className="text-2xl font-bold text-emerald-600">{records.reduce((s, r) => s + r.total_registered, 0).toLocaleString()}</p>
          </div>
          <div className="text-center">
            <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Period</p>
            <p className="text-sm font-semibold text-gray-700 mt-1.5">
              {monthFilter ? `${MONTH_NAMES[Number(monthFilter) - 1]} ${yearFilter}` : `Full Year ${yearFilter}`}
            </p>
          </div>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Period</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">County</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Subcounty</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Days Logged</th>
                <th className="text-right px-4 py-3 font-medium text-emerald-600">Total Registered</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {records?.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-gray-400">No records found.</td></tr>
              )}
              {records?.map((rec) => {
                const canEdit = isClerk && rec.created_by === user?.id && !rec.is_closed
                const isExpanded = expandedId === rec.id
                return (
                  <>
                    <tr
                      key={rec.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => handleRowClick(rec)}
                    >
                      <td className="px-4 py-3 font-medium">
                        {MONTH_SHORT[rec.period_month - 1]} {rec.period_year}
                        <span className="ml-2 text-xs text-gray-400">#{rec.id}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{rec.county}</td>
                      <td className="px-4 py-3 text-gray-500">{rec.subcounty}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{rec.entries.length}</td>
                      <td className="px-4 py-3 text-right text-emerald-700 font-semibold">{rec.total_registered.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <span className={`badge ${rec.is_closed ? 'bg-gray-100 text-gray-700' : 'bg-green-100 text-green-700'}`}>
                          {rec.is_closed ? 'Closed' : 'Open'}
                        </span>
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-2 flex-wrap">
                          {(canEdit || isRegistrar) && (
                            <button onClick={() => setExpandedId(isExpanded ? null : rec.id)} className="text-xs btn-secondary py-1 px-2">
                              {isExpanded ? 'Close' : (isRegistrar ? 'View' : 'Edit')}
                            </button>
                          )}
                          {isRegistrar && !rec.is_closed && (
                            <button onClick={() => closeMutation.mutate(rec.id)} className="text-xs btn-danger py-1 px-2">
                              Close Exercise
                            </button>
                          )}
                          {isRegistrar && rec.is_closed && (
                            <button onClick={() => reopenMutation.mutate(rec.id)} className="text-xs btn-primary py-1 px-2">
                              Reopen
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} className="p-0">
                          <EntriesEditor
                            record={rec}
                            canEdit={canEdit}
                            onClose={() => setExpandedId(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page — branches by role before any other hooks run ────────────────────
export default function MobileRegistrationsPage() {
  const { isDirector } = useAuth()
  return isDirector ? <DirectorMashinaniDashboard /> : <ClerkRegistrarMashinaniView />
}
