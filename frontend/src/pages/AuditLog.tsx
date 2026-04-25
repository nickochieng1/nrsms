import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAuditLogs } from '@/api/audit'
import { formatDateTime } from '@/utils/format'

const ACTION_COLORS: Record<string, string> = {
  LOGIN: 'bg-gray-100 text-gray-700',
  CREATE: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
  APPROVE: 'bg-emerald-100 text-emerald-700',
  REJECT: 'bg-orange-100 text-orange-700',
  SUBMIT: 'bg-purple-100 text-purple-700',
}

export default function AuditLogPage() {
  const [resource, setResource] = useState('')
  const [action, setAction] = useState('')

  const { data: logs, isLoading } = useQuery({
    queryKey: ['audit', resource, action],
    queryFn: () => getAuditLogs({
      resource: resource || undefined,
      action: action || undefined,
      limit: 200,
    }),
  })

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
        <p className="text-gray-500 mt-1">Complete record of all system activity</p>
      </div>

      {/* Filters */}
      <div className="card mb-6 flex gap-4 flex-wrap items-end">
        <div>
          <label className="label">Resource</label>
          <select className="input" value={resource} onChange={(e) => setResource(e.target.value)}>
            <option value="">All resources</option>
            <option value="user">User</option>
            <option value="station">Station</option>
            <option value="submission">Submission</option>
          </select>
        </div>
        <div>
          <label className="label">Action</label>
          <select className="input" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">All actions</option>
            {Object.keys(ACTION_COLORS).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading audit log…</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Timestamp</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">User</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Action</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Resource</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">ID</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">IP</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Changes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs?.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gray-400">No audit records found.</td>
                </tr>
              )}
              {logs?.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50 align-top">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDateTime(log.timestamp)}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {log.user_id ? `User #${log.user_id}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${ACTION_COLORS[log.action] ?? 'bg-gray-100 text-gray-600'}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 capitalize text-gray-700">{log.resource}</td>
                  <td className="px-4 py-3 text-gray-500">{log.resource_id ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{log.ip_address ?? '—'}</td>
                  <td className="px-4 py-3 max-w-xs">
                    {log.new_value && (
                      <pre className="text-xs text-gray-500 whitespace-pre-wrap break-all">
                        {log.new_value}
                      </pre>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
