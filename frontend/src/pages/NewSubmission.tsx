import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createSubmission } from '@/api/submissions'
import { getStations } from '@/api/stations'
import { useAuth } from '@/hooks/useAuth'
import { StationPicker } from '@/components/forms/StationPicker'
import { MONTH_NAMES } from '@/utils/format'
import { NRB_CATS, CAT_LABELS, CAT_COLORS, MODULE_COLORS, type ModulePrefix, type NrbCat } from '@/types'
import clsx from 'clsx'

// ── Schema ───────────────────────────────────────────────────────────────────
const nn = z.coerce.number().min(0, 'Cannot be negative').default(0)
const mfFields = (prefix: string) =>
  NRB_CATS.reduce<Record<string, z.ZodDefault<z.ZodNumber>>>((acc, cat) => {
    acc[`${prefix}_${cat}_male`] = nn
    acc[`${prefix}_${cat}_female`] = nn
    return acc
  }, {})

const schema = z.object({
  station_id: z.coerce.number().min(1, 'Select a station'),
  period_month: z.coerce.number().min(1).max(12),
  period_year: z.coerce.number().min(2000).max(2100),
  notes: z.string().optional(),
  ...mfFields('app'),
  ...mfFields('ids'),
  ...mfFields('rej'),
  collected_npr_male: nn, collected_npr_female: nn,
  collected_others_male: nn, collected_others_female: nn,
  collected_rejected_male: nn, collected_rejected_female: nn,
  uncollected_npr_male: nn, uncollected_npr_female: nn,
  uncollected_others_male: nn, uncollected_others_female: nn,
  uncollected_lost_male: nn, uncollected_lost_female: nn,
  reg136c_balance_bd: nn, reg136c_used: nn, reg136c_spoilt: nn, reg136c_returned: nn,
  photo3a_balance_bd: nn, photo3a_used: nn, photo3a_spoilt: nn, photo3a_returned: nn,
})
type FormValues = z.infer<typeof schema>

const YEARS = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i)

// ── NRB Category Table (Modules 1–3) ─────────────────────────────────────────
function NrbTable({
  prefix,
  register,
  watch,
  color,
}: {
  prefix: ModulePrefix
  register: any
  watch: any
  color: string
}) {
  const vals = watch()
  const rowTotal = (cat: NrbCat) =>
    (Number(vals[`${prefix}_${cat}_male`]) || 0) + (Number(vals[`${prefix}_${cat}_female`]) || 0)
  const grandM = NRB_CATS.reduce((s, c) => s + (Number(vals[`${prefix}_${c}_male`]) || 0), 0)
  const grandF = NRB_CATS.reduce((s, c) => s + (Number(vals[`${prefix}_${c}_female`]) || 0), 0)

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-200">
          <th className="text-left py-2.5 px-4 font-medium text-gray-600 w-44">Category</th>
          <th className="text-center py-2.5 px-3 font-semibold text-blue-600 w-32">Male</th>
          <th className="text-center py-2.5 px-3 font-semibold text-pink-600 w-32">Female</th>
          <th className="text-center py-2.5 px-3 font-medium text-gray-500 w-28">Total</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {NRB_CATS.map((cat) => (
          <tr key={cat} className="hover:bg-gray-50">
            <td className="py-2.5 px-4">
              <span className="font-semibold text-sm" style={{ color: CAT_COLORS[cat] }}>
                {CAT_LABELS[cat]}
              </span>
            </td>
            <td className="py-2 px-3">
              <input
                type="number"
                min="0"
                className="input text-center text-sm py-1.5"
                {...register(`${prefix}_${cat}_male`)}
              />
            </td>
            <td className="py-2 px-3">
              <input
                type="number"
                min="0"
                className="input text-center text-sm py-1.5"
                {...register(`${prefix}_${cat}_female`)}
              />
            </td>
            <td className="py-2 px-3 text-center font-semibold text-gray-700">
              {rowTotal(cat).toLocaleString()}
            </td>
          </tr>
        ))}
        <tr className="border-t-2 border-gray-300 font-bold" style={{ backgroundColor: `${color}10` }}>
          <td className="py-3 px-4" style={{ color }}>Grand Total</td>
          <td className="py-3 px-3 text-center text-blue-700">{grandM.toLocaleString()}</td>
          <td className="py-3 px-3 text-center text-pink-700">{grandF.toLocaleString()}</td>
          <td className="py-3 px-3 text-center text-lg" style={{ color }}>
            {(grandM + grandF).toLocaleString()}
          </td>
        </tr>
      </tbody>
    </table>
  )
}

// ── Register row (Modules 5 & 6) ──────────────────────────────────────────────
function RegisterTable({
  prefix,
  register,
  watch,
}: {
  prefix: 'reg136c' | 'photo3a'
  register: any
  watch: any
}) {
  const vals = watch()
  const bd = Number(vals[`${prefix}_balance_bd`]) || 0
  const used = Number(vals[`${prefix}_used`]) || 0
  const spoilt = Number(vals[`${prefix}_spoilt`]) || 0
  const returned = Number(vals[`${prefix}_returned`]) || 0
  const cf = Math.max(0, bd - used - spoilt + returned)

  const FIELDS: Array<{ key: string; label: string; desc: string; readOnly?: boolean }> = [
    { key: `${prefix}_balance_bd`, label: 'Balance B/D', desc: 'Opening balance brought down from previous month' },
    { key: `${prefix}_used`,       label: 'Used',        desc: 'Number used during the month' },
    { key: `${prefix}_spoilt`,     label: 'Spoilt',      desc: 'Number spoilt or damaged' },
    { key: `${prefix}_returned`,   label: 'Returned',    desc: 'Number returned to store' },
    { key: `${prefix}_balance_cf`, label: 'Balance C/F', desc: 'Closing balance = B/D − Used − Spoilt + Returned', readOnly: true },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {FIELDS.map((f) => (
        <div key={f.key}>
          <label className="label">{f.label}</label>
          {f.readOnly ? (
            <div className="input bg-gray-50 text-center font-bold text-primary-700 cursor-default">
              {cf.toLocaleString()}
            </div>
          ) : (
            <input
              type="number"
              min="0"
              className="input text-center"
              {...register(f.key)}
            />
          )}
          <p className="text-xs text-gray-400 mt-1 leading-tight">{f.desc}</p>
        </div>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function NewSubmissionPage() {
  const { user, isClerk } = useAuth()
  const isStationLocked = isClerk
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [apiError, setApiError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState(0)

  const { data: stations } = useQuery({ queryKey: ['stations'], queryFn: getStations })
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      station_id: user?.station_id ?? 0,
      period_month: new Date().getMonth() + 1,
      period_year: new Date().getFullYear(),
    },
  })

  const mutation = useMutation({
    mutationFn: createSubmission,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['submissions'] })
      navigate('/submissions')
    },
    onError: (err: any) => {
      setApiError(err.response?.data?.detail ?? 'Failed to save submission')
    },
  })

  const TABS = [
    { label: '1. Applications to HQ',   short: 'Applications' },
    { label: '2. IDs Received from HQ', short: 'IDs Received' },
    { label: '3. Rejections from HQ',   short: 'Rejections' },
    { label: '4. Collected / Uncollected', short: 'Collected' },
    { label: '5. Reg. 136C',            short: 'Reg. 136C' },
    { label: '6. Photo Papers 3A',      short: 'Photo 3A' },
  ]

  const v = watch()
  // Collected sub-totals
  const colNprM   = Number(v.collected_npr_male)      || 0
  const colNprF   = Number(v.collected_npr_female)    || 0
  const colOthM   = Number(v.collected_others_male)   || 0
  const colOthF   = Number(v.collected_others_female) || 0
  const colRejM   = Number(v.collected_rejected_male)   || 0
  const colRejF   = Number(v.collected_rejected_female) || 0
  const colM = colNprM + colOthM + colRejM
  const colF = colNprF + colOthF + colRejF
  // Uncollected sub-totals
  const uncolNprM  = Number(v.uncollected_npr_male)      || 0
  const uncolNprF  = Number(v.uncollected_npr_female)    || 0
  const uncolOthM  = Number(v.uncollected_others_male)   || 0
  const uncolOthF  = Number(v.uncollected_others_female) || 0
  const uncolLostM = Number(v.uncollected_lost_male)     || 0
  const uncolLostF = Number(v.uncollected_lost_female)   || 0
  const uncolM = uncolNprM + uncolOthM + uncolLostM
  const uncolF = uncolNprF + uncolOthF + uncolLostF

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">New Monthly Submission</h1>
        <p className="text-gray-500 mt-1">Complete all 6 statistical modules for the reporting period</p>
      </div>

      {apiError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {apiError}
        </div>
      )}

      <form onSubmit={handleSubmit((v) => mutation.mutate(v))}>
        {/* ── Period & Station ── */}
        <div className="card mb-5">
          <h2 className="font-semibold text-gray-800 mb-4">Reporting Period &amp; Station</h2>

          {isStationLocked ? (
            /* Station officers and registrars see only their assigned station */
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Station</label>
                <div className="input bg-gray-50 text-gray-700 font-medium cursor-default select-none">
                  {stations?.find((s) => s.id === user?.station_id)?.name ?? '—'}
                  <span className="ml-2 text-xs text-gray-400">
                    {stations?.find((s) => s.id === user?.station_id)?.county}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Month</label>
                  <select className="input" {...register('period_month')}>
                    {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Year</label>
                  <select className="input" {...register('period_year')}>
                    {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
            </div>
          ) : (
            /* Admins / registrars get the 3-level station picker */
            <div className="grid grid-cols-2 gap-6">
              <StationPicker
                stations={stations ?? []}
                value={watch('station_id') || undefined}
                onChange={(id) => setValue('station_id', id ?? 0, { shouldValidate: true })}
                error={errors.station_id?.message}
              />
              <div className="space-y-3">
                <div>
                  <label className="label">Month</label>
                  <select className="input" {...register('period_month')}>
                    {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Year</label>
                  <select className="input" {...register('period_year')}>
                    {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Tab navigation ── */}
        <div className="flex border-b border-gray-200 mb-0 overflow-x-auto">
          {TABS.map((tab, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActiveTab(i)}
              className={clsx(
                'px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                activeTab === i
                  ? 'border-primary-600 text-primary-700 bg-white'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
              )}
            >
              {tab.short}
            </button>
          ))}
        </div>

        {/* ── Module 1: Applications to HQ ── */}
        {activeTab === 0 && (
          <div className="card rounded-tl-none">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: MODULE_COLORS.app }} />
              <h2 className="font-semibold text-gray-900">Applications Sent to Headquarters</h2>
            </div>
            <NrbTable prefix="app" register={register} watch={watch} color={MODULE_COLORS.app} />
          </div>
        )}

        {/* ── Module 2: IDs Received ── */}
        {activeTab === 1 && (
          <div className="card rounded-tl-none">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: MODULE_COLORS.ids }} />
              <h2 className="font-semibold text-gray-900">IDs Received from Headquarters</h2>
            </div>
            <NrbTable prefix="ids" register={register} watch={watch} color={MODULE_COLORS.ids} />
          </div>
        )}

        {/* ── Module 3: Rejections ── */}
        {activeTab === 2 && (
          <div className="card rounded-tl-none">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: MODULE_COLORS.rej }} />
              <h2 className="font-semibold text-gray-900">Rejections Received from Headquarters</h2>
            </div>
            <NrbTable prefix="rej" register={register} watch={watch} color={MODULE_COLORS.rej} />
          </div>
        )}

        {/* ── Module 4: Collected / Uncollected ── */}
        {activeTab === 3 && (
          <div className="card rounded-tl-none space-y-6">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-indigo-500" />
              <h2 className="font-semibold text-gray-900">Collected & Uncollected ID Cards</h2>
            </div>

            {/* Collected */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-emerald-700 mb-2">Collected IDs</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-emerald-50">
                    <th className="text-left py-2.5 px-4 font-medium text-gray-600 w-52">Category</th>
                    <th className="text-center py-2.5 px-3 font-semibold text-blue-600 w-32">Male</th>
                    <th className="text-center py-2.5 px-3 font-semibold text-pink-600 w-32">Female</th>
                    <th className="text-center py-2.5 px-3 font-medium text-gray-500 w-28">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {([
                    { key: 'collected_npr',      label: 'NPR',                    m: colNprM, f: colNprF },
                    { key: 'collected_others',   label: 'Others',                 m: colOthM, f: colOthF },
                    { key: 'collected_rejected', label: 'ID Rejected by Holders', m: colRejM, f: colRejF },
                  ] as const).map((row) => (
                    <tr key={row.key} className="hover:bg-gray-50">
                      <td className="py-2.5 px-4 font-medium text-gray-700">{row.label}</td>
                      <td className="py-2 px-3">
                        <input type="number" min="0" className="input text-center text-sm py-1.5"
                          {...register(`${row.key}_male` as any)} />
                      </td>
                      <td className="py-2 px-3">
                        <input type="number" min="0" className="input text-center text-sm py-1.5"
                          {...register(`${row.key}_female` as any)} />
                      </td>
                      <td className="py-2 px-3 text-center font-bold text-gray-700">
                        {(row.m + row.f).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-emerald-300 bg-emerald-50 font-bold">
                    <td className="py-3 px-4 text-emerald-700">Grand Total — Collected</td>
                    <td className="py-3 px-3 text-center text-blue-700">{colM.toLocaleString()}</td>
                    <td className="py-3 px-3 text-center text-pink-700">{colF.toLocaleString()}</td>
                    <td className="py-3 px-3 text-center text-emerald-700">{(colM + colF).toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Uncollected */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-orange-600 mb-2">Uncollected IDs</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-orange-50">
                    <th className="text-left py-2.5 px-4 font-medium text-gray-600 w-52">Category</th>
                    <th className="text-center py-2.5 px-3 font-semibold text-blue-600 w-32">Male</th>
                    <th className="text-center py-2.5 px-3 font-semibold text-pink-600 w-32">Female</th>
                    <th className="text-center py-2.5 px-3 font-medium text-gray-500 w-28">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {([
                    { key: 'uncollected_npr',    label: 'NPR',            m: uncolNprM,  f: uncolNprF  },
                    { key: 'uncollected_others', label: 'Others',         m: uncolOthM,  f: uncolOthF  },
                    { key: 'uncollected_lost',   label: 'Lost and Found', m: uncolLostM, f: uncolLostF },
                  ] as const).map((row) => (
                    <tr key={row.key} className="hover:bg-gray-50">
                      <td className="py-2.5 px-4 font-medium text-gray-700">{row.label}</td>
                      <td className="py-2 px-3">
                        <input type="number" min="0" className="input text-center text-sm py-1.5"
                          {...register(`${row.key}_male` as any)} />
                      </td>
                      <td className="py-2 px-3">
                        <input type="number" min="0" className="input text-center text-sm py-1.5"
                          {...register(`${row.key}_female` as any)} />
                      </td>
                      <td className="py-2 px-3 text-center font-bold text-gray-700">
                        {(row.m + row.f).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-orange-300 bg-orange-50 font-bold">
                    <td className="py-3 px-4 text-orange-700">Grand Total — Uncollected</td>
                    <td className="py-3 px-3 text-center text-blue-700">{uncolM.toLocaleString()}</td>
                    <td className="py-3 px-3 text-center text-pink-700">{uncolF.toLocaleString()}</td>
                    <td className="py-3 px-3 text-center text-orange-700">{(uncolM + uncolF).toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Overall grand total */}
            <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-5 py-3 flex items-center justify-between">
              <span className="font-bold text-indigo-800">Overall Grand Total</span>
              <div className="flex gap-6 text-sm font-semibold">
                <span className="text-blue-700">M {(colM + uncolM).toLocaleString()}</span>
                <span className="text-pink-700">F {(colF + uncolF).toLocaleString()}</span>
                <span className="text-indigo-700 text-base">{(colM + colF + uncolM + uncolF).toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Module 5: Reg. 136C ── */}
        {activeTab === 4 && (
          <div className="card rounded-tl-none">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full bg-orange-500" />
              <h2 className="font-semibold text-gray-900">Reg. 136C — Acknowledgement Register</h2>
            </div>
            <p className="text-xs text-gray-400 mb-5 ml-5">
              Balance C/F is auto-calculated: B/D − Used − Spoilt + Returned
            </p>
            <RegisterTable prefix="reg136c" register={register} watch={watch} />
          </div>
        )}

        {/* ── Module 6: Photo Papers 3A ── */}
        {activeTab === 5 && (
          <div className="card rounded-tl-none">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full bg-teal-500" />
              <h2 className="font-semibold text-gray-900">Photo Papers 3A</h2>
            </div>
            <p className="text-xs text-gray-400 mb-5 ml-5">
              Balance C/F is auto-calculated: B/D − Used − Spoilt + Returned
            </p>
            <RegisterTable prefix="photo3a" register={register} watch={watch} />
          </div>
        )}

        {/* ── Notes & actions ── */}
        <div className="card mt-5">
          <label className="label">Notes (optional)</label>
          <textarea className="input h-20 resize-none" placeholder="Any additional remarks…" {...register('notes')} />
        </div>

        {/* Tab nav footer */}
        <div className="flex items-center justify-between mt-5">
          <div className="flex gap-2">
            {activeTab > 0 && (
              <button type="button" onClick={() => setActiveTab(activeTab - 1)} className="btn-secondary">
                ← Previous
              </button>
            )}
            {activeTab < TABS.length - 1 && (
              <button type="button" onClick={() => setActiveTab(activeTab + 1)} className="btn-secondary">
                Next →
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => navigate(-1)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? 'Saving…' : 'Save as Draft'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
