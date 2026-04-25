import type { User } from '@/types'

// Simple module-level store backed by localStorage
let _listeners: Array<() => void> = []

function notify() {
  _listeners.forEach((fn) => fn())
}

export const authStore = {
  getToken: (): string | null => localStorage.getItem('token'),
  getUser: (): User | null => {
    const raw = localStorage.getItem('user')
    return raw ? JSON.parse(raw) : null
  },
  setAuth(token: string, user: User) {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    notify()
  },
  clearAuth() {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    notify()
  },
  subscribe(fn: () => void) {
    _listeners.push(fn)
    return () => { _listeners = _listeners.filter((l) => l !== fn) }
  },
}
