import { Fragment, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAuditLogs, getAuditActors, getAuditStats, getAuditExportUrl, type AuditFilters } from '@/api/audit'
import { downloadFile } from '@/utils/downloadFile'
import { formatDateTime, formatRelativeTime, ROLE_LABELS } from '@/utils/format'
import type { AuditLog as AuditLogEntry } from '@/types'

const ACTION_LABELS: Record<string, string> = {
  LOGIN: 'Logged In',
  FAILED_LOGIN: 'Failed Login',
  CHANGE_PASSWORD: 'Changed Password',
  RESET_PASSWORD: 'Reset Password',
  CREATE: 'Created',
  UPDATE: 'Updated',
  DELETE: 'Deleted',
  SUBMIT: 'Submitted',
  APPROVE: 'Approved',
  REJECT: 'Rejected',
  CLOSE: 'Closed',
  REOPEN: 'Reopened',
}

const ACTION_COLORS: Record<string, string> = {
  LOGIN: 'bg-gray-100 text-gray-700',
  FAILED_LOGIN: 'bg-red-100 text-red-700',
  CHANGE_PASSWORD: 'bg-indigo-100 text-indigo-700',
  RESET_PASSWORD: 'bg-indigo-100 text-indigo-700',
  CREATE: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
  APPROVE: 'bg-emerald-100 text-emerald-700',
  REJECT: 'bg-orange-100 text-orange-700',
  SUBMIT: 'bg-purple-100 text-purple-700',
  CLOSE: 'bg-slate-100 text-slate-700',
  REOPEN: 'bg-cyan-100 text-cyan-700',
}

const RESOURCE_LABELS: Record<string, string> = {
  user: 'User',
  station: 'Station',
  submission: 'Submission',
  mobile_registration: 'Usajili Mashinani',
  mobile_registration_target: 'Mashinani Target',
}

const FIELD_LABELS: Record<string, string> = {
  is_active: 'Active', role: 'Role', region: 'Region', county: 'County',
  email: 'Email', full_name: 'Full name', target_set: 'Target',
}

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
}

function resourceLabel(resource: string): string {
  return RESOURCE_LABELS[resource] ?? resource.replace(/_/g, ' ')
}

function describeEntry(log: AuditLogEntry): string {
  const who = log.actor_name || log.actor_username || 'Unknown user'
  const what = resourceLabel(log.resource).toLowerCase()
  const idSuffix = log.resource_id ? ` (#${log.resource_id})` : ''
  switch (log.action) {
    case 'LOGIN': return `${who} logged in`
    case 'FAILED_LOGIN': return `Failed login attempt as "${log.actor_username}"`
    case 'CHANGE_PASSWORD': return `${who} changed their own password`
    case 'RESET_PASSWORD': return `${who} reset a user's password${idSuffix}`
    case 'CREATE': return `${who} created a ${what}${idSuffix}`
    case 'UPDATE': return `${who} updated a ${what}${idSuffix}`
    case 'DELETE': return `${who} deleted a ${what}${idSuffix}`
    case 'SUBMIT': return `${who} submitted a ${what}${idSuffix}`
    case 'APPROVE': return `${who} approved a ${what}${idSuffix}`
    case 'REJECT': return `${who} rejected a ${what}${idSuffix}`
    case 'CLOSE': return `${who} closed a ${what}${idSuffix}`
    case 'REOPEN': return `${who} reopened a ${what}${idSuffix}`
    default: return `${who} performed ${log.action} on ${what}${idSuffix}`
  }
}

function DiffView({ log }: { log: AuditLogEntry }) {
  const oldValue = log.old_value
  const newValue = log.new_value
  const keys = [...new Set([...(oldValue ? Object.keys(oldValue) : []), ...(newValue ? Object.keys(newValue) : [])])]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
      <div>
        <p className="text-gray-400 uppercase font-semibold mb-2">What changed</p>
        {keys.length === 0 ? (
          <p className="text-gray-400">No field-level details recorded for this event.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-gray-400">
                <th className="text-left font-normal py-1 pr-3">Field</th>
                <th className="text-left font-normal py-1 pr-3">Before</th>
                <th className="text-left font-normal py-1">After</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {keys.map((k) => {
                const hasOld = !!oldValue && Object.prototype.hasOwnProperty.call(oldValue, k)
                const hasNew = !!newValue && Object.prototype.hasOwnProperty.call(newValue, k)
                const before = oldValue?.[k]
                const after = newValue?.[k]
                // old_value/new_value aren't always a matched before/after pair for
                // the SAME fields — UPDATE actions often snapshot a few "context"
                // fields into old_value while new_value holds only what the request
                // actually changed. A key present in one but not the other means
                // "wasn't part of this update", not "cleared to nothing".
                const changed = hasOld && hasNew && JSON.stringify(before) !== JSON.stringify(after)
                return (
                  <tr key={k}>
                    <td className="py-1 pr-3 text-gray-500 align-top whitespace-nowrap">{fieldLabel(k)}</td>
                    <td className="py-1 pr-3 align-top text-gray-500">{hasOld ? String(before) : '—'}</td>
                    <td className={`py-1 align-top ${changed ? 'text-gray-900 font-medium' : 'text-gray-400 italic'}`}>
                      {hasNew ? String(after) : (hasOld ? 'not changed' : '—')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      <div>
        <p className="text-gray-400 uppercase font-semibold mb-2">Request details</p>
        <dl className="space-y-1">
          <div className="flex gap-2"><dt className="text-gray-400 w-28 shrink-0">IP Address</dt><dd className="text-gray-700">{log.ip_address ?? '—'}</dd></div>
          <div className="flex gap-2"><dt className="text-gray-400 w-28 shrink-0">User Agent</dt><dd className="text-gray-700 break-all">{log.user_agent ?? '—'}</dd></div>
          <div className="flex gap-2"><dt className="text-gray-400 w-28 shrink-0">Resource ID</dt><dd className="text-gray-700">{log.resource_id ?? '—'}</dd></div>
          <div className="flex gap-2"><dt className="text-gray-400 w-28 shrink-0">Exact time</dt><dd className="text-gray-700">{formatDateTime(log.timestamp)}</dd></div>
        </dl>
      </div>
    </div>
  )
}

const PAGE_SIZE = 25

export default function AuditLogPage() {
  const [resource, setResource] = useState('')
  const [action, setAction] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [actorKey, setActorKey] = useState('')
  const [page, setPage] = useState(0)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const [actorUserId, actorUsername] = actorKey
    ? actorKey.startsWith('uid:') ? [Number(actorKey.slice(4)), undefined] : [undefined, actorKey.slice(3)]
    : [undefined, undefined]

  const filters: AuditFilters = {
    resource: resource || undefined,
    action: action || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    q: search || undefined,
    user_id: actorUserId,
    username: actorUsername,
  }

  const { data: page_, isLoading } = useQuery({
    queryKey: ['audit', filters, page],
    queryFn: () => getAuditLogs({ ...filters, skip: page * PAGE_SIZE, limit: PAGE_SIZE }),
  })

  const { data: stats } = useQuery({
    queryKey: ['audit-stats', filters],
    queryFn: () => getAuditStats(filters),
  })

  const { data: actors } = useQuery({
    queryKey: ['audit-actors'],
    queryFn: getAuditActors,
  })

  function selectActor(key: string) {
    setActorKey(key)
    setPage(0)
  }

  function resetFilters() {
    setResource(''); setAction(''); setDateFrom(''); setDateTo(''); setSearch(''); setActorKey(''); setPage(0)
  }

  function handleExport() {
    downloadFile(getAuditExportUrl(filters), `audit_log_${new Date().toISOString().slice(0, 10)}.csv`)
  }

  const total = page_?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const topAction = stats?.by_action[0]
  const topActor = stats?.top_actors[0]

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
          <p className="text-gray-500 mt-1">Complete, tamper-evident record of every action taken in the system</p>
        </div>
        <button className="btn-secondary" onClick={handleExport}>Export CSV</button>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card text-center">
          <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Events {(dateFrom || dateTo || resource || action || search || actorKey) ? '(filtered)' : ''}</p>
          <p className="text-3xl font-bold text-primary-700">{total.toLocaleString()}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Distinct Actors</p>
          <p className="text-3xl font-bold text-gray-700">{stats?.distinct_actors ?? '—'}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Top Action</p>
          <p className="text-xl font-bold text-blue-600">{topAction ? (ACTION_LABELS[topAction.action] ?? topAction.action) : '—'}</p>
          <p className="text-xs text-gray-400 mt-1">{topAction ? `${topAction.count.toLocaleString()} events` : ''}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Most Active</p>
          <p className="text-xl font-bold text-gray-700 truncate">{topActor ? (topActor.actor_name || topActor.actor_username) : '—'}</p>
          <p className="text-xs text-gray-400 mt-1">{topActor ? `${topActor.count.toLocaleString()} events` : ''}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-6 flex gap-4 flex-wrap items-end">
        <div>
          <label className="label">Actor</label>
          <select className="input w-56" value={actorKey} onChange={(e) => selectActor(e.target.value)}>
            <option value="">All users</option>
            {actors?.map((a) => {
              const key = a.user_id ? `uid:${a.user_id}` : `un:${a.actor_username}`
              const label = a.actor_name ? `${a.actor_name} (${a.actor_username})` : (a.actor_username ?? 'Unknown')
              return <option key={key} value={key}>{label} — {a.event_count}</option>
            })}
          </select>
        </div>
        <div>
          <label className="label">Resource</label>
          <select className="input" value={resource} onChange={(e) => { setResource(e.target.value); setPage(0) }}>
            <option value="">All resources</option>
            {Object.entries(RESOURCE_LABELS).map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Action</label>
          <select className="input" value={action} onChange={(e) => { setAction(e.target.value); setPage(0) }}>
            <option value="">All actions</option>
            {Object.entries(ACTION_LABELS).map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
          </select>
        </div>
        <div>
          <label className="label">From</label>
          <input type="date" className="input" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0) }} />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" className="input" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0) }} />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="label">Search</label>
          <input type="text" className="input" placeholder="Actor, action, resource…" value={search}
                 onChange={(e) => { setSearch(e.target.value); setPage(0) }} />
        </div>
        <button className="btn-secondary" onClick={resetFilters}>Clear filters</button>
      </div>

      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading audit log…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Time</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Actor</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Event</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Action</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">IP</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {page_?.items.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-8 text-gray-400">No audit records found.</td></tr>
                )}
                {page_?.items.map((log) => (
                  <Fragment key={log.id}>
                    <tr
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                    >
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap" title={formatDateTime(log.timestamp)}>
                        {formatRelativeTime(log.timestamp)}
                      </td>
                      <td className="px-4 py-3">
                        {log.actor_username ? (
                          <button
                            className="text-left hover:underline"
                            onClick={(e) => { e.stopPropagation(); selectActor(log.user_id ? `uid:${log.user_id}` : `un:${log.actor_username}`) }}
                          >
                            <span className="text-gray-800 font-medium">{log.actor_name || log.actor_username}</span>
                            {log.actor_role && (ROLE_LABELS[log.actor_role] ?? log.actor_role) !== (log.actor_name || log.actor_username) && (
                              <span className="ml-2 badge bg-gray-100 text-gray-500">{ROLE_LABELS[log.actor_role] ?? log.actor_role}</span>
                            )}
                          </button>
                        ) : (
                          <span className="text-gray-400">System</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{describeEntry(log)}</td>
                      <td className="px-4 py-3">
                        <span className={`badge ${ACTION_COLORS[log.action] ?? 'bg-gray-100 text-gray-600'}`}>
                          {ACTION_LABELS[log.action] ?? log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{log.ip_address ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-400">{expandedId === log.id ? '▲' : '▼'}</td>
                    </tr>
                    {expandedId === log.id && (
                      <tr className="bg-gray-50">
                        <td colSpan={6} className="px-4 py-4">
                          <DiffView log={log} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!isLoading && total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
            <span>
              Showing {page * PAGE_SIZE + 1}–{Math.min(total, (page + 1) * PAGE_SIZE)} of {total.toLocaleString()}
            </span>
            <div className="flex gap-2">
              <button className="btn-secondary py-1 px-3" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <span className="px-2 py-1">Page {page + 1} of {totalPages}</span>
              <button className="btn-secondary py-1 px-3" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
