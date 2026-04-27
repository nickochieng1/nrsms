import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { login, getMe } from '@/api/auth'
import { authStore } from '@/store/authStore'
import { apiClient } from '@/api/client'
import nrbLogo from '@/images/nrb-kenya.svg'

const schema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
})
type FormValues = z.infer<typeof schema>

type ServerState = 'checking' | 'waking' | 'ready'

export default function LoginPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [serverState, setServerState] = useState<ServerState>('checking')
  const cancelRef = useRef(false)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  // Silently wake the server as soon as the login page opens
  useEffect(() => {
    cancelRef.current = false
    let attempt = 0

    async function wake() {
      while (!cancelRef.current) {
        try {
          await apiClient.get('/health', { timeout: 10000 })
          if (!cancelRef.current) setServerState('ready')
          return
        } catch {
          attempt++
          if (!cancelRef.current) setServerState(attempt === 1 ? 'waking' : 'waking')
          await new Promise((r) => setTimeout(r, 6000))
        }
      }
    }

    wake()
    return () => { cancelRef.current = true }
  }, [])

  async function onSubmit(values: FormValues) {
    setError(null)
    try {
      const token = await login(values.username, values.password)
      localStorage.setItem('token', token)
      const user = await getMe()
      authStore.setAuth(token, user)
      navigate('/dashboard', { replace: true })
    } catch (err: any) {
      const status = err?.response?.status
      if (status === 401 || status === 403) {
        setError('Incorrect username or password.')
      } else {
        // Server fell asleep mid-session — wake it and ask user to retry
        setServerState('waking')
        setError('Connection lost. The server is restarting — it will be ready in about 30 seconds. Please try again.')
        apiClient.get('/health', { timeout: 30000 })
          .then(() => {
            if (!cancelRef.current) {
              setServerState('ready')
              setError('Server is ready. Please sign in again.')
            }
          })
          .catch(() => {})
      }
    }
  }

  return (
    <div className="min-h-screen bg-primary-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo panel */}
        <div className="bg-[#E3EDEB] rounded-t-2xl px-8 py-7 flex flex-col items-center">
          <img
            src={nrbLogo}
            alt="National Registration Bureau"
            className="h-12 w-auto object-contain"
          />
          <p className="text-gray-600 text-xs font-medium tracking-wide mt-3 uppercase">
            Statistics Management System
          </p>
        </div>

        {/* Form panel */}
        <div className="bg-white rounded-b-2xl shadow-2xl px-8 py-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Sign in</h2>
          <p className="text-sm text-gray-500 mb-5">Enter your credentials to continue</p>

          {/* Server status banners */}
          {serverState === 'checking' && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 flex items-center gap-2">
              <svg className="animate-spin h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Connecting to server…
            </div>
          )}
          {serverState === 'waking' && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 flex items-center gap-2">
              <svg className="animate-spin h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Server is starting up, please wait…
            </div>
          )}
          {serverState === 'ready' && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
              <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Server ready
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label">Username</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. jdoe"
                autoComplete="username"
                autoFocus
                {...register('username')}
              />
              {errors.username && <p className="mt-1 text-xs text-red-600">{errors.username.message}</p>}
            </div>

            <div>
              <label className="label">Password</label>
              <input
                type="password"
                className="input"
                placeholder="••••••••"
                autoComplete="current-password"
                {...register('password')}
              />
              {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
            </div>

            <button
              type="submit"
              disabled={isSubmitting || serverState === 'checking'}
              className="btn-primary w-full mt-2 py-2.5 flex items-center justify-center gap-2"
            >
              {isSubmitting && (
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              )}
              {isSubmitting ? 'Signing in…' : serverState === 'checking' ? 'Connecting…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-500 mt-6">
          © {new Date().getFullYear()} National Registration Bureau — Kenya
        </p>
      </div>
    </div>
  )
}
