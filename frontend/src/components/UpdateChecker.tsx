import { useEffect, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'

type Phase = 'idle' | 'checking' | 'downloading' | 'ready' | 'error'

// Desktop-app-only: checks the GitHub Releases update feed on launch and
// silently downloads any newer signed build, then offers a one-click
// restart. No-op entirely on the web build (isTauri() is false there).
export function UpdateChecker() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [version, setVersion] = useState<string>('')

  useEffect(() => {
    if (!isTauri()) return
    let cancelled = false

    async function run() {
      const { check } = await import('@tauri-apps/plugin-updater')
      setPhase('checking')
      const update = await check().catch(() => null)
      if (cancelled || !update) {
        setPhase('idle')
        return
      }
      setVersion(update.version)
      setPhase('downloading')
      await update.downloadAndInstall().catch(() => {
        if (!cancelled) setPhase('error')
      })
      if (!cancelled) setPhase('ready')
    }

    run()
    return () => { cancelled = true }
  }, [])

  async function restartNow() {
    const { relaunch } = await import('@tauri-apps/plugin-process')
    relaunch()
  }

  if (phase === 'idle' || phase === 'checking' || phase === 'error') return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] rounded-lg shadow-lg bg-slate-800 text-white px-4 py-3 text-sm flex items-center gap-3">
      {phase === 'downloading' && <span>Downloading update {version}…</span>}
      {phase === 'ready' && (
        <>
          <span>Update {version} ready.</span>
          <button onClick={restartNow} className="btn-primary py-1 px-3 text-xs">Restart Now</button>
        </>
      )}
    </div>
  )
}
