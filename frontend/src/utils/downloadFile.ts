import { isTauri } from '@tauri-apps/api/core'

// In the packaged desktop app, the webview's <a download> attribute is not
// honored (WebView2/WKWebView just navigate to the blob URL instead of
// saving a file), so the export buttons looked like they did nothing.
// Route through Tauri's native save dialog + fs write there instead, and
// keep the normal browser download for the web build.
export async function downloadFile(url: string, filename: string) {
  const token = localStorage.getItem('token')
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Export failed (${res.status})`)
  const blob = await res.blob()

  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { writeFile } = await import('@tauri-apps/plugin-fs')
    const path = await save({ defaultPath: filename })
    if (!path) return
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()))
    return
  }

  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: filename,
  })
  a.click()
  URL.revokeObjectURL(a.href)
}
