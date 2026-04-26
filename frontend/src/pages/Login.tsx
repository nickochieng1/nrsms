import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { login, getMe } from '@/api/auth'
import { authStore } from '@/store/authStore'
import nrbLogo from '@/images/nrb-kenya.svg'

const schema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
})
type FormValues = z.infer<typeof schema>

export default function LoginPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [slowWarning, setSlowWarning] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    setError(null)
    setSlowWarning(false)
    const timer = setTimeout(() => setSlowWarning(true), 5000)
    try {
      const token = await login(values.username, values.password)
      localStorage.setItem('token', token)
      const user = await getMe()
      authStore.setAuth(token, user)
      navigate('/dashboard', { replace: true })
    } catch {
      setError('Invalid username or password. If this is your first login today, the server may still be waking up — please try again.')
    } finally {
      clearTimeout(timer)
      setSlowWarning(false)
    }
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
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
          <p className="text-sm text-gray-500 mb-6">Enter your credentials to continue</p>

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
                {...register('username')}
              />
              {errors.username && (
                <p className="mt-1 text-xs text-red-600">{errors.username.message}</p>
              )}
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
              {errors.password && (
                <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary w-full mt-2 py-2.5 flex items-center justify-center gap-2"
            >
              {isSubmitting && (
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              )}
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </button>
            {isSubmitting && slowWarning && (
              <p className="text-center text-xs text-amber-600 mt-2">
                Server is waking up, please wait a moment…
              </p>
            )}
          </form>
        </div>

        <p className="text-center text-xs text-gray-500 mt-6">
          © {new Date().getFullYear()} National Registration Bureau — Kenya
        </p>
      </div>
    </div>
  )
}
