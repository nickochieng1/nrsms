import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { useOfflineQueue } from '@/hooks/useOfflineQueue'

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { isOnline, queueCount, syncing, syncQueue, syncError } = useOfflineQueue()

  return (
    <div className="flex min-h-screen">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-30 transition-transform duration-200 lg:static lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <div className="lg:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
            aria-label="Open menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-bold text-gray-900 text-sm tracking-wide">NRSMS</span>
        </div>

        {/* Offline banner */}
        {!isOnline && (
          <div className="bg-amber-500 text-white text-sm px-4 py-2 flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728M15.536 8.464a5 5 0 010 7.072M12 12h.01M8.464 15.536a5 5 0 01-1.414-3.536m0 0a5 5 0 011.414-3.536" />
            </svg>
            <span>No internet connection — you can still fill in and save submissions, they will sync automatically when you reconnect.</span>
          </div>
        )}

        {/* Pending sync banner */}
        {isOnline && queueCount > 0 && (
          <div className="bg-blue-600 text-white text-sm px-4 py-2 flex items-center gap-3">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>{queueCount} submission{queueCount !== 1 ? 's' : ''} saved offline</span>
            <button
              onClick={syncQueue}
              disabled={syncing}
              className="ml-auto text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full font-medium"
            >
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
          </div>
        )}

        {/* Sync error */}
        {syncError && (
          <div className="bg-red-50 border-b border-red-200 text-red-700 text-xs px-4 py-2">{syncError}</div>
        )}

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
