import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { getUsers, createUser, updateUser, deleteUser, resetUserPassword } from '@/api/users'
import { getStations } from '@/api/stations'
import { ROLE_LABELS, formatDate } from '@/utils/format'
import { useAuth } from '@/hooks/useAuth'
import type { UserRole } from '@/types'

const NEEDS_STATION  = new Set<UserRole>(['clerk', 'sub_county_registrar'])
const NEEDS_COUNTY   = new Set<UserRole>(['county_registrar'])
const NEEDS_REGION   = new Set<UserRole>(['regional_registrar'])

const schema = z.object({
  full_name:  z.string().min(2),
  username:   z.string().min(3, 'Username must be at least 3 characters').regex(/^\S+$/, 'No spaces allowed'),
  email:      z.string().email(),
  password:   z.string().min(6),
  role:       z.enum(['clerk', 'sub_county_registrar', 'county_registrar', 'regional_registrar',
                      'hq_clerk', 'hq_officer', 'director', 'admin']),
  station_id: z.coerce.number().nullable().optional(),
  county:     z.string().optional(),
  region:     z.string().optional(),
})
type FormValues = z.infer<typeof schema>

export default function UsersPage() {
  const qc = useQueryClient()
  const { isAdmin, user: currentUser } = useAuth()
  const [showForm, setShowForm] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [resetModal, setResetModal] = useState<{ id: number; name: string } | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetError, setResetError] = useState<string | null>(null)

  const { data: users, isLoading } = useQuery({ queryKey: ['users'], queryFn: getUsers })
  const { data: stations } = useQuery({ queryKey: ['stations'], queryFn: getStations })

  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'clerk' },
  })

  const role = watch('role') as UserRole

  const createMutation = useMutation({
    mutationFn: (v: FormValues) => createUser({
      ...v,
      station_id: NEEDS_STATION.has(v.role as UserRole) ? (v.station_id || null) : null,
      county:     NEEDS_COUNTY.has(v.role as UserRole)  ? (v.county || null) : null,
      region:     NEEDS_REGION.has(v.role as UserRole)  ? (v.region || null) : null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      reset()
      setShowForm(false)
    },
  })

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      updateUser(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setDeleteConfirm(null)
    },
  })

  const resetMutation = useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) =>
      resetUserPassword(id, password),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setResetModal(null)
      setResetPassword('')
      setResetError(null)
    },
    onError: (err: any) => {
      setResetError(err.response?.data?.detail ?? 'Failed to reset password')
    },
  })

  const needsStation = NEEDS_STATION.has(role)
  const needsCounty  = NEEDS_COUNTY.has(role)
  const needsRegion  = NEEDS_REGION.has(role)

  const counties = [...new Set((stations ?? []).map(s => s.county))].sort()
  const regions  = [...new Set((stations ?? []).map(s => s.region))].sort()

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-gray-500 mt-1">Manage system users and roles</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">+ Add User</button>
      </div>

      {showForm && (
        <div className="card mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">New User</h2>
          <form onSubmit={handleSubmit((v) => createMutation.mutate(v))} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Full Name</label>
              <input className="input" {...register('full_name')} />
              {errors.full_name && <p className="text-xs text-red-600 mt-1">{errors.full_name.message}</p>}
            </div>
            <div>
              <label className="label">Username</label>
              <input className="input" placeholder="e.g. jdoe" {...register('username')} />
              {errors.username && <p className="text-xs text-red-600 mt-1">{errors.username.message}</p>}
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" {...register('email')} />
              {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <label className="label">Password</label>
              <input type="password" className="input" {...register('password')} />
              {errors.password && <p className="text-xs text-red-600 mt-1">{errors.password.message}</p>}
            </div>
            <div>
              <label className="label">Role</label>
              <select className="input" {...register('role')}>
                <optgroup label="Field">
                  <option value="clerk">Clerk</option>
                  <option value="sub_county_registrar">Sub-County Registrar</option>
                  <option value="county_registrar">County Registrar</option>
                  <option value="regional_registrar">Regional Registrar</option>
                </optgroup>
                <optgroup label="Headquarters">
                  <option value="hq_clerk">HQ Clerk</option>
                  <option value="hq_officer">HQ Officer</option>
                  <option value="director">Director of Statistics</option>
                  <option value="admin">System Administrator</option>
                </optgroup>
              </select>
            </div>
            {needsStation && (
              <div>
                <label className="label">Assigned Station</label>
                <select className="input" {...register('station_id')}>
                  <option value="">Select station…</option>
                  {stations?.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.county}</option>)}
                </select>
              </div>
            )}
            {needsCounty && (
              <div>
                <label className="label">Assigned County</label>
                <select className="input" {...register('county')}>
                  <option value="">Select county…</option>
                  {counties.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
            {needsRegion && (
              <div>
                <label className="label">Assigned Region</label>
                <select className="input" {...register('region')}>
                  <option value="">Select region…</option>
                  {regions.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            )}
            <div className="col-span-2 flex gap-3">
              <button type="submit" disabled={isSubmitting} className="btn-primary">Create User</button>
              <button type="button" onClick={() => { setShowForm(false); reset() }} className="btn-secondary">Cancel</button>
              {createMutation.isError && (
                <p className="text-xs text-red-600 self-center">
                  {(createMutation.error as any)?.response?.data?.detail ?? 'Failed to create user'}
                </p>
              )}
            </div>
          </form>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Username</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Scope</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Created</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users?.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{u.full_name}</td>
                  <td className="px-4 py-3 font-mono text-gray-700">{u.username ?? <span className="text-gray-400 italic">—</span>}</td>
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className="badge bg-blue-50 text-blue-700">{ROLE_LABELS[u.role]}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {u.county   ? u.county   :
                     u.region   ? u.region   :
                     u.station_id ? stations?.find(s => s.id === u.station_id)?.name ?? `#${u.station_id}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{formatDate(u.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <button
                        onClick={() => toggleActiveMutation.mutate({ id: u.id, is_active: !u.is_active })}
                        className={`text-xs ${u.is_active ? 'text-amber-600 hover:text-amber-800' : 'text-green-600 hover:text-green-800'}`}
                      >
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => { setResetModal({ id: u.id, name: u.full_name }); setResetPassword(''); setResetError(null) }}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          Set Password
                        </button>
                      )}
                      {isAdmin && u.id !== currentUser?.id && (
                        <button
                          onClick={() => setDeleteConfirm(u.id)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Reset password modal */}
      {resetModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card w-full max-w-sm">
            <h3 className="font-semibold text-gray-900 mb-1">Set Password</h3>
            <p className="text-sm text-gray-500 mb-4">
              Setting a new password for <span className="font-medium text-gray-700">{resetModal.name}</span>.
              They will be required to change it on their next login.
            </p>
            <input
              type="password"
              className="input mb-3"
              placeholder="New password (min 6 characters)"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              autoFocus
            />
            {resetError && <p className="text-xs text-red-600 mb-3">{resetError}</p>}
            <div className="flex gap-3">
              <button
                onClick={() => resetMutation.mutate({ id: resetModal.id, password: resetPassword })}
                disabled={resetPassword.length < 6 || resetMutation.isPending}
                className="btn-primary flex-1"
              >
                {resetMutation.isPending ? 'Saving…' : 'Save Password'}
              </button>
              <button onClick={() => setResetModal(null)} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card w-full max-w-sm">
            <h3 className="font-semibold text-gray-900 mb-2">Delete User</h3>
            <p className="text-sm text-gray-500 mb-5">
              This will permanently remove the user. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => deleteMutation.mutate(deleteConfirm)}
                disabled={deleteMutation.isPending}
                className="btn-danger flex-1"
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Yes, Delete'}
              </button>
              <button onClick={() => setDeleteConfirm(null)} className="btn-secondary flex-1">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
