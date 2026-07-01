import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getNotifications, markNotificationRead } from '@/api/submissions'
import { useAuth } from '@/hooks/useAuth'
import { formatRelativeTime } from '@/utils/format'

export function NotificationsBell() {
  const { isRROP, isRegistrar, isDirector } = useAuth()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)

  // Only fetch for roles that receive notifications.
  const enabled = isRROP || isRegistrar || isDirector

  const { data: notifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: getNotifications,
    enabled,
    refetchInterval: 60 * 1000,
  })

  const readMutation = useMutation({
    mutationFn: (id: number) => markNotificationRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  if (!enabled) return null

  const unread = (notifications ?? []).filter((n) => !n.is_read).length

  return (
    <div className="relative">
      <button
        className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute top-0.5 right-0.5 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-50 w-80 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-sm text-gray-900">Notifications</h3>
              {unread > 0 && <span className="text-xs text-gray-400">{unread} unread</span>}
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
              {!notifications?.length && (
                <p className="px-4 py-6 text-sm text-gray-400 text-center">No notifications yet.</p>
              )}
              {notifications?.map((n) => (
                <div
                  key={n.id}
                  className={`px-4 py-3 ${n.is_read ? '' : 'bg-blue-50'} cursor-pointer hover:bg-gray-50`}
                  onClick={() => { if (!n.is_read) readMutation.mutate(n.id) }}
                >
                  <p className={`text-sm ${n.is_read ? 'text-gray-700' : 'text-gray-900 font-medium'}`}>
                    {n.title}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
                  <p className="text-xs text-gray-400 mt-1">{formatRelativeTime(n.created_at)}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
