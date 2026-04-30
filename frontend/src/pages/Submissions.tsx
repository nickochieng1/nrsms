import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSubmissions, submitSubmission, reviewSubmission } from '@/api/submissions'
import { useAuth } from '@/hooks/useAuth'
import { STATUS_COLORS, STATUS_LABELS } from '@/utils/format'
import { NRB_CATS, CAT_LABELS, MODULE_LABELS, MODULE_COLORS } from '@/types'
import type { Submission, SubmissionStatus, ModulePrefix } from '@/types'

const PREFIXES: ModulePrefix[] = ['app', 'ids', 'rej']
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function SubmissionsPage() {
  const { canApprove, myPendingStatus, isClerk } = useAuth()
  const showStation = !isClerk  // county/regional/HQ see the station column
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const [statusFilter, setStatusFilter] = useState<SubmissionStatus | ''>((searchParams.get('status') as SubmissionStatus) || '')
  const [yearFilter, setYearFilter] = useState<number>(new Date().getFullYear())
  const [rejectModal, setRejectModal] = useState<{ id: number } | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [reviewModal, setReviewModal] = useState<Submission | null>(null)

  const { data: submissions, isLoading } = useQuery({
    queryKey: ['submissions', statusFilter, yearFilter],
    queryFn: () => getSubmissions({ status: statusFilter || undefined, year: yearFilter, limit: 200 }),
  })

  const submitMutation = useMutation({
    mutationFn: (id: number) => submitSubmission(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['submissions'] }),
  })

  const [reviewError, setReviewError] = useState<string | null>(null)

  const reviewMutation = useMutation({
    mutationFn: ({ id, action, reason }: { id: number; action: 'approve' | 'reject'; reason?: string }) =>
      reviewSubmission(id, action, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['submissions'] })
      setRejectModal(null)
      setRejectReason('')
      setReviewModal(null)
      setReviewError(null)
    },
    onError: (err: any) => {
      setReviewError(err.response?.data?.detail ?? 'Action failed')
    },
  })

  const canReview = canApprove

  function handleRowClick(sub: Submission) {
    const canReviewNow = canApprove && myPendingStatus && sub.status === myPendingStatus
    if (canReviewNow) {
      setReviewModal(sub)
    } else {
      setExpanded(expanded === sub.id ? null : sub.id)
    }
  }

  const YEARS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Submissions</h1>
          <p className="text-gray-500 mt-1">Monthly ID statistics submissions</p>
        </div>
        <Link to="/submissions/new" className="btn-primary">+ New Submission</Link>
      </div>

      {/* Filters */}
      <div className="card mb-6 flex gap-4 flex-wrap items-end">
        <div>
          <label className="label">Status</label>
          <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as SubmissionStatus | '')}>
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Year</label>
          <select className="input" value={yearFilter} onChange={(e) => setYearFilter(Number(e.target.value))}>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading submissions…</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Period</th>
                {showStation && <th className="text-left px-4 py-3 font-medium text-gray-600">Station</th>}
                <th className="text-left px-4 py-3 font-medium text-gray-600">Submitted By</th>
                <th className="text-right px-4 py-3 font-medium text-blue-600">Applications</th>
                <th className="text-right px-4 py-3 font-medium text-green-600">IDs Received</th>
                <th className="text-right px-4 py-3 font-medium text-red-600">Rejections</th>
                <th className="text-right px-4 py-3 font-medium text-emerald-600">Collected</th>
                <th className="text-right px-4 py-3 font-medium text-orange-600">Uncollected</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {submissions?.length === 0 && (
                <tr>
                  <td colSpan={showStation ? 10 : 9} className="text-center py-10 text-gray-400">No submissions found.</td>
                </tr>
              )}
              {submissions?.map((sub) => (
                <>
                  <tr
                    key={sub.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => handleRowClick(sub)}
                  >
                    <td className="px-4 py-3 font-medium">
                      {MONTH_SHORT[sub.period_month - 1]} {sub.period_year}
                      <span className="ml-2 text-xs text-gray-400">#{sub.id}</span>
                      {canApprove && myPendingStatus && sub.status === myPendingStatus && (
                        <span className="ml-2 text-xs text-amber-600 font-semibold">· click to review</span>
                      )}
                    </td>
                    {showStation && (
                      <td className="px-4 py-3 text-xs text-gray-600">
                        <div className="font-medium">{sub.station_name ?? `#${sub.station_id}`}</div>
                        {sub.station_county && <div className="text-gray-400">{sub.station_county}</div>}
                      </td>
                    )}
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {sub.submitted_by_name ?? `User #${sub.submitted_by}`}
                    </td>
                    <td className="px-4 py-3 text-right text-blue-700">{sub.app_grand_total.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-green-700">{sub.ids_grand_total.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-red-700">{sub.rej_grand_total.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-emerald-700">{sub.collected_total.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-orange-600">{sub.uncollected_total.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${STATUS_COLORS[sub.status]}`}>
                        {STATUS_LABELS[sub.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-2 flex-wrap">
                        {sub.status === 'draft' && (
                          <button
                            onClick={() => submitMutation.mutate(sub.id)}
                            className="text-xs btn-primary py-1 px-2"
                          >
                            Submit
                          </button>
                        )}
                        {canReview && myPendingStatus && sub.status === myPendingStatus && (
                          <>
                            <button
                              onClick={() => reviewMutation.mutate({ id: sub.id, action: 'approve' })}
                              className="text-xs btn-success py-1 px-2"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => { setRejectModal({ id: sub.id }); setRejectReason('') }}
                              className="text-xs btn-danger py-1 px-2"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {sub.status === 'rejected' && sub.rejection_reason && (
                          <span className="text-xs text-red-500 italic max-w-xs truncate" title={sub.rejection_reason}>
                            {sub.rejection_reason}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Expandable detail (non-submitted rows or non-reviewers) */}
                  {expanded === sub.id && (
                    <tr key={`${sub.id}-detail`} className="bg-slate-50">
                      <td colSpan={showStation ? 9 : 8} className="px-6 py-5">
                        {/* Modules 1–3 */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
                          {PREFIXES.map((px) => (
                            <div key={px} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                              <div
                                className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white"
                                style={{ backgroundColor: MODULE_COLORS[px] }}
                              >
                                {MODULE_LABELS[px]}
                              </div>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-gray-50 border-b border-gray-100">
                                    <th className="text-left px-3 py-1.5 text-gray-400 font-medium">Category</th>
                                    <th className="text-right px-2 py-1.5 text-blue-400 font-medium">M</th>
                                    <th className="text-right px-2 py-1.5 text-pink-400 font-medium">F</th>
                                    <th className="text-right px-3 py-1.5 text-gray-600 font-medium">Total</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                  {NRB_CATS.map((cat) => (
                                    <tr key={cat}>
                                      <td className="px-3 py-1.5 text-gray-600">{CAT_LABELS[cat]}</td>
                                      <td className="px-2 py-1.5 text-right text-blue-600">
                                        {(sub[`${px}_${cat}_male` as keyof typeof sub] as number).toLocaleString()}
                                      </td>
                                      <td className="px-2 py-1.5 text-right text-pink-600">
                                        {(sub[`${px}_${cat}_female` as keyof typeof sub] as number).toLocaleString()}
                                      </td>
                                      <td className="px-3 py-1.5 text-right font-medium text-gray-800">
                                        {(sub[`${px}_${cat}_total` as keyof typeof sub] as number).toLocaleString()}
                                      </td>
                                    </tr>
                                  ))}
                                  <tr className="bg-gray-50 font-semibold border-t border-gray-200">
                                    <td className="px-3 py-1.5 text-gray-700">Grand</td>
                                    <td className="px-2 py-1.5 text-right text-blue-700">
                                      {(sub[`${px}_grand_male` as keyof typeof sub] as number).toLocaleString()}
                                    </td>
                                    <td className="px-2 py-1.5 text-right text-pink-700">
                                      {(sub[`${px}_grand_female` as keyof typeof sub] as number).toLocaleString()}
                                    </td>
                                    <td className="px-3 py-1.5 text-right text-gray-900">
                                      {(sub[`${px}_grand_total` as keyof typeof sub] as number).toLocaleString()}
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          ))}
                        </div>

                        {/* Modules 4–6 */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white bg-teal-600">
                              Collected &amp; Uncollected
                            </div>
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-gray-50 border-b border-gray-100">
                                  <th className="text-left px-3 py-1.5 text-gray-400 font-medium" />
                                  <th className="text-right px-2 py-1.5 text-blue-400 font-medium">M</th>
                                  <th className="text-right px-2 py-1.5 text-pink-400 font-medium">F</th>
                                  <th className="text-right px-3 py-1.5 text-gray-600 font-medium">Total</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                <tr>
                                  <td className="px-3 py-1.5 text-gray-600">Collected</td>
                                  <td className="px-2 py-1.5 text-right text-blue-600">{sub.collected_male.toLocaleString()}</td>
                                  <td className="px-2 py-1.5 text-right text-pink-600">{sub.collected_female.toLocaleString()}</td>
                                  <td className="px-3 py-1.5 text-right font-medium text-emerald-700">{sub.collected_total.toLocaleString()}</td>
                                </tr>
                                <tr>
                                  <td className="px-3 py-1.5 text-gray-600">Uncollected</td>
                                  <td className="px-2 py-1.5 text-right text-blue-600">{sub.uncollected_male.toLocaleString()}</td>
                                  <td className="px-2 py-1.5 text-right text-pink-600">{sub.uncollected_female.toLocaleString()}</td>
                                  <td className="px-3 py-1.5 text-right font-medium text-orange-600">{sub.uncollected_total.toLocaleString()}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white bg-purple-600">
                              Reg. 136C
                            </div>
                            <div className="p-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                              {([
                                ['Balance B/D', sub.reg136c_balance_bd],
                                ['Used',        sub.reg136c_used],
                                ['Spoilt',      sub.reg136c_spoilt],
                                ['Returned',    sub.reg136c_returned],
                                ['Balance C/F', sub.reg136c_balance_cf],
                              ] as [string, number][]).map(([label, value]) => (
                                <div key={label}>
                                  <p className="text-gray-400">{label}</p>
                                  <p className="font-semibold text-gray-800">{value.toLocaleString()}</p>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white bg-cyan-600">
                              Photo Papers 3A
                            </div>
                            <div className="p-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                              {([
                                ['Balance B/D', sub.photo3a_balance_bd],
                                ['Used',        sub.photo3a_used],
                                ['Spoilt',      sub.photo3a_spoilt],
                                ['Returned',    sub.photo3a_returned],
                                ['Balance C/F', sub.photo3a_balance_cf],
                              ] as [string, number][]).map(([label, value]) => (
                                <div key={label}>
                                  <p className="text-gray-400">{label}</p>
                                  <p className="font-semibold text-gray-800">{value.toLocaleString()}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {sub.notes && (
                          <p className="mt-3 text-xs text-gray-500 italic">Notes: {sub.notes}</p>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* ── Inline review modal (director / registrar clicking a submitted row) ── */}
      {reviewModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setReviewModal(null)}
        >
          <div className="card w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-900 text-lg">
                  Review Submission #{reviewModal.id}
                  {reviewModal.station_name && (
                    <span className="ml-2 text-sm font-normal text-gray-500">— {reviewModal.station_name}</span>
                  )}
                </h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  {MONTH_SHORT[reviewModal.period_month - 1]} {reviewModal.period_year}
                </p>
              </div>
              <button onClick={() => setReviewModal(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="rounded-lg bg-blue-50 px-4 py-3">
                <p className="text-xs text-blue-500 font-medium uppercase tracking-wide">Applications</p>
                <p className="text-xl font-bold text-blue-700 mt-0.5">{reviewModal.app_grand_total.toLocaleString()}</p>
              </div>
              <div className="rounded-lg bg-green-50 px-4 py-3">
                <p className="text-xs text-green-500 font-medium uppercase tracking-wide">IDs Received</p>
                <p className="text-xl font-bold text-green-700 mt-0.5">{reviewModal.ids_grand_total.toLocaleString()}</p>
              </div>
              <div className="rounded-lg bg-red-50 px-4 py-3">
                <p className="text-xs text-red-500 font-medium uppercase tracking-wide">Rejections</p>
                <p className="text-xl font-bold text-red-700 mt-0.5">{reviewModal.rej_grand_total.toLocaleString()}</p>
              </div>
              <div className="rounded-lg bg-emerald-50 px-4 py-3">
                <p className="text-xs text-emerald-500 font-medium uppercase tracking-wide">Collected / Uncollected</p>
                <p className="text-base font-bold text-emerald-700 mt-0.5">
                  {reviewModal.collected_total.toLocaleString()} / {reviewModal.uncollected_total.toLocaleString()}
                </p>
              </div>
            </div>

            {/* Reject reason — shown inline when rejecting */}
            {rejectModal?.id === reviewModal.id ? (
              <>
                <textarea
                  className="input h-24 resize-none mb-3"
                  placeholder="Reason for rejection (required)…"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  autoFocus
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => reviewMutation.mutate({ id: reviewModal.id, action: 'reject', reason: rejectReason })}
                    disabled={!rejectReason.trim() || reviewMutation.isPending}
                    className="btn-danger flex-1"
                  >
                    {reviewMutation.isPending ? 'Rejecting…' : 'Confirm Rejection'}
                  </button>
                  <button onClick={() => setRejectModal(null)} className="btn-secondary">Back</button>
                </div>
              </>
            ) : (
              <>
                {reviewError && <p className="text-xs text-red-600 mb-3">{reviewError}</p>}
              <div className="flex gap-3">
                <button
                  onClick={() => reviewMutation.mutate({ id: reviewModal.id, action: 'approve' })}
                  disabled={reviewMutation.isPending}
                  className="btn-success flex-1 py-2.5 text-base"
                >
                  {reviewMutation.isPending ? 'Approving…' : 'Approve'}
                </button>
                <button
                  onClick={() => { setRejectModal({ id: reviewModal.id }); setRejectReason(''); setReviewError(null) }}
                  className="btn-danger flex-1 py-2.5 text-base"
                >
                  Reject
                </button>
              </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Standalone reject modal (from Actions column buttons) ── */}
      {rejectModal && !reviewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card w-full max-w-md">
            <h3 className="font-semibold text-gray-900 mb-3">Reject Submission</h3>
            <textarea
              className="input h-28 resize-none mb-4"
              placeholder="Reason for rejection (required)…"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <div className="flex gap-3">
              <button
                onClick={() => reviewMutation.mutate({ id: rejectModal.id, action: 'reject', reason: rejectReason })}
                disabled={!rejectReason.trim()}
                className="btn-danger"
              >
                Confirm Rejection
              </button>
              <button onClick={() => setRejectModal(null)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
