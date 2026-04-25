import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { changePassword } from '@/api/auth'
import { getMe } from '@/api/auth'
import { authStore } from '@/store/authStore'
import nrbLogo from '@/images/nrb-kenya.svg'

const schema = z
  .object({
    current_password: z.string().min(1, 'Enter your current password'),
    new_password: z.string().min(6, 'New password must be at least 6 characters'),
    confirm_password: z.string().min(1, 'Confirm your new password'),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  })

type FormValues = z.infer<typeof schema>

export default function ChangePasswordPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    setError(null)
    try {
      await changePassword(values.current_password, values.new_password)
      // Refresh user so must_change_password is now false
      const user = await getMe()
      authStore.setAuth(authStore.getToken()!, user)
      navigate('/dashboard', { replace: true })
    } catch (err: any) {
      setError(err.response?.data?.detail ?? 'Failed to change password')
    }
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-[#E3EDEB] rounded-t-2xl px-8 py-7 flex flex-col items-center">
          <img src={nrbLogo} alt="National Registration Bureau" className="h-12 w-auto object-contain" />
          <p className="text-gray-600 text-xs font-medium tracking-wide mt-3 uppercase">
            Statistics Management System
          </p>
        </div>

        <div className="bg-white rounded-b-2xl shadow-2xl px-8 py-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Set your password</h2>
          <p className="text-sm text-gray-500 mb-6">
            Your account requires a new password before you can continue. Enter the password given to you by the admin, then choose a new one.
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label">Current password (given by admin)</label>
              <input
                type="password"
                className="input"
                placeholder="••••••••"
                autoComplete="current-password"
                {...register('current_password')}
              />
              {errors.current_password && (
                <p className="mt-1 text-xs text-red-600">{errors.current_password.message}</p>
              )}
            </div>

            <div>
              <label className="label">New password</label>
              <input
                type="password"
                className="input"
                placeholder="••••••••"
                autoComplete="new-password"
                {...register('new_password')}
              />
              {errors.new_password && (
                <p className="mt-1 text-xs text-red-600">{errors.new_password.message}</p>
              )}
            </div>

            <div>
              <label className="label">Confirm new password</label>
              <input
                type="password"
                className="input"
                placeholder="••••••••"
                autoComplete="new-password"
                {...register('confirm_password')}
              />
              {errors.confirm_password && (
                <p className="mt-1 text-xs text-red-600">{errors.confirm_password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary w-full mt-2 py-2.5"
            >
              {isSubmitting ? 'Saving…' : 'Set new password'}
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
