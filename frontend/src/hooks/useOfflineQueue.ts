import { useState, useEffect, useCallback } from 'react'
import { createSubmission } from '@/api/submissions'

interface QueueItem {
  id: string
  data: Record<string, unknown>
  queuedAt: string
  stationName?: string
  period?: string
}

const KEY = 'nrsms_offline_queue'

function load(): QueueItem[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}

function save(q: QueueItem[]) {
  localStorage.setItem(KEY, JSON.stringify(q))
}

export function useOfflineQueue() {
  const [isOnline, setIsOnline]   = useState(() => navigator.onLine)
  const [queue,    setQueue]      = useState<QueueItem[]>(load)
  const [syncing,  setSyncing]    = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  useEffect(() => {
    const up   = () => setIsOnline(true)
    const down = () => setIsOnline(false)
    window.addEventListener('online',  up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])

  const addToQueue = useCallback((data: Record<string, unknown>, meta?: { stationName?: string; period?: string }) => {
    const item: QueueItem = {
      id:          `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      data,
      queuedAt:    new Date().toISOString(),
      stationName: meta?.stationName,
      period:      meta?.period,
    }
    const next = [...load(), item]
    save(next)
    setQueue(next)
  }, [])

  const syncQueue = useCallback(async () => {
    const current = load()
    if (!current.length || syncing) return
    setSyncing(true)
    setSyncError(null)
    const failed: QueueItem[] = []
    for (const item of current) {
      try {
        await createSubmission(item.data as any)
      } catch {
        failed.push(item)
      }
    }
    save(failed)
    setQueue(failed)
    setSyncing(false)
    if (failed.length) setSyncError(`${failed.length} submission(s) failed to sync — will retry when online`)
  }, [syncing])

  // Auto-sync the moment the browser reconnects
  useEffect(() => {
    if (isOnline && load().length > 0) syncQueue()
  }, [isOnline])  // eslint-disable-line react-hooks/exhaustive-deps

  return { isOnline, queueCount: queue.length, addToQueue, syncQueue, syncing, syncError }
}
