import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { getStations, createStation, updateStation, deleteStation } from '@/api/stations'
import { useAuth } from '@/hooks/useAuth'
import type { Station } from '@/types'

const schema = z.object({
  name: z.string().min(2),
  region: z.string().min(2),
  county: z.string().min(2),
  code: z.string().min(2),
})
type FormValues = z.infer<typeof schema>

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-gray-900 rounded-sm px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}

export default function StationsPage() {
  const qc = useQueryClient()
  const { isAdmin, isDirector } = useAuth()
  const [showForm, setShowForm] = useState(false)
  const [editStation, setEditStation] = useState<Station | null>(null)
  const [search, setSearch] = useState('')

  const { data: stations, isLoading } = useQuery({ queryKey: ['stations'], queryFn: getStations })

  // Create form
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  // Edit form
  const {
    register: registerEdit,
    handleSubmit: handleEditSubmit,
    reset: resetEdit,
    formState: { errors: editErrors, isSubmitting: isEditSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  function openEdit(s: Station) {
    setEditStation(s)
    resetEdit({ name: s.name, region: s.region, county: s.county, code: s.code })
    setShowForm(false)
  }

  function closeEdit() {
    setEditStation(null)
  }

  const createMutation = useMutation({
    mutationFn: createStation,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stations'] })
      reset()
      setShowForm(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<Station> }) =>
      updateStation(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stations'] })
      closeEdit()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteStation,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stations'] }),
  })

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stations</h1>
          <p className="text-gray-500 mt-1">
            {stations ? `${stations.length} stations across Kenya` : 'Manage registration stations'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by name or code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-9 w-full sm:w-64"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                ×
              </button>
            )}
          </div>
          {isAdmin && (
            <button onClick={() => { setShowForm(true); closeEdit() }} className="btn-primary">
              + Add Station
            </button>
          )}
        </div>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="card mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">New Station</h2>
          <form onSubmit={handleSubmit((v) => createMutation.mutate(v))} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Station Name</label>
              <input className="input" {...register('name')} />
              {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name.message}</p>}
            </div>
            <div>
              <label className="label">Code</label>
              <input className="input" {...register('code')} />
              {errors.code && <p className="text-xs text-red-600 mt-1">{errors.code.message}</p>}
            </div>
            <div>
              <label className="label">Region</label>
              <input className="input" {...register('region')} />
              {errors.region && <p className="text-xs text-red-600 mt-1">{errors.region.message}</p>}
            </div>
            <div>
              <label className="label">County</label>
              <input className="input" {...register('county')} />
              {errors.county && <p className="text-xs text-red-600 mt-1">{errors.county.message}</p>}
            </div>
            <div className="col-span-2 flex gap-3">
              <button type="submit" disabled={isSubmitting} className="btn-primary">Save</button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Edit modal */}
      {editStation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) closeEdit() }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-base font-bold text-gray-900">Edit Station</h2>
                <p className="text-xs text-gray-500 mt-0.5">{editStation.county} County · {editStation.region} Region</p>
              </div>
              <button
                type="button"
                onClick={closeEdit}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100"
              >
                ×
              </button>
            </div>

            {/* Modal body */}
            <form
              onSubmit={handleEditSubmit((v) =>
                updateMutation.mutate({ id: editStation.id, payload: v })
              )}
              className="px-6 py-5 grid grid-cols-2 gap-4"
            >
              <div className="col-span-2">
                <label className="label">Station Name</label>
                <input className="input" {...registerEdit('name')} />
                {editErrors.name && <p className="text-xs text-red-600 mt-1">{editErrors.name.message}</p>}
              </div>
              <div>
                <label className="label">Code</label>
                <input className="input font-mono" {...registerEdit('code')} />
                {editErrors.code && <p className="text-xs text-red-600 mt-1">{editErrors.code.message}</p>}
              </div>
              <div>
                <label className="label">Region</label>
                <input className="input" {...registerEdit('region')} />
                {editErrors.region && <p className="text-xs text-red-600 mt-1">{editErrors.region.message}</p>}
              </div>
              <div className="col-span-2">
                <label className="label">County</label>
                <input className="input" {...registerEdit('county')} />
                {editErrors.county && <p className="text-xs text-red-600 mt-1">{editErrors.county.message}</p>}
              </div>

              {/* Footer actions */}
              <div className="col-span-2 flex justify-end gap-3 pt-2 border-t border-gray-100">
                <button type="button" onClick={closeEdit} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={isEditSubmitting} className="btn-primary">
                  {isEditSubmitting ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="card p-8 text-center text-gray-400">Loading…</div>
      ) : (
        (() => {
          const q = search.trim().toLowerCase()
          const filtered = (stations ?? [])
            .filter((s) =>
              !q ||
              s.name.toLowerCase().includes(q) ||
              s.code.toLowerCase().includes(q)
            )
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))

          // Build Region → County → Station[] map (sorted)
          const regionMap = new Map<string, Map<string, Station[]>>()
          for (const s of filtered) {
            if (!regionMap.has(s.region)) regionMap.set(s.region, new Map())
            const countyMap = regionMap.get(s.region)!
            if (!countyMap.has(s.county)) countyMap.set(s.county, [])
            countyMap.get(s.county)!.push(s)
          }
          const sortedRegions = [...regionMap.keys()].sort()

          if (q && filtered.length === 0) {
            return (
              <div className="card p-8 text-center text-gray-400">
                No stations match <span className="font-medium text-gray-600">"{search}"</span>
              </div>
            )
          }

          return (
            <div className="space-y-6">
              {sortedRegions.map((region) => {
                const countyMap = regionMap.get(region)!
                const sortedCounties = [...countyMap.keys()].sort()
                const regionTotal = [...countyMap.values()].reduce((n, arr) => n + arr.length, 0)
                return (
                  <div key={region} className="card p-0 overflow-hidden">
                    {/* Region header */}
                    <div className="px-5 py-3 bg-gray-800 flex items-center justify-between">
                      <h2 className="text-sm font-bold text-white uppercase tracking-wide">{region}</h2>
                      <span className="text-xs text-gray-400">{sortedCounties.length} {sortedCounties.length === 1 ? 'county' : 'counties'} · {regionTotal} station{regionTotal !== 1 ? 's' : ''}</span>
                    </div>

                    {sortedCounties.map((county, ci) => {
                      const countyStations = countyMap.get(county)!
                      return (
                        <div key={county} className={ci > 0 ? 'border-t border-gray-200' : ''}>
                          {/* County sub-header */}
                          <div className="px-5 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{county} County</span>
                            <span className="text-xs text-gray-400">{countyStations.length} station{countyStations.length !== 1 ? 's' : ''}</span>
                          </div>

                          <table className="w-full text-sm">
                            <thead className="border-b border-gray-100">
                              <tr className="bg-gray-50/50">
                                <th className="text-left px-5 py-2 font-medium text-gray-500 text-xs w-8">#</th>
                                <th className="text-left px-4 py-2 font-medium text-gray-500 text-xs">Station Name</th>
                                <th className="text-left px-4 py-2 font-medium text-gray-500 text-xs">Code</th>
                                {isDirector && (
                                  <th className="text-left px-4 py-2 font-medium text-gray-500 text-xs">Actions</th>
                                )}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {countyStations.map((s, idx) => (
                                <tr
                                  key={s.id}
                                  className={`hover:bg-gray-50 ${editStation?.id === s.id ? 'bg-primary-50' : ''}`}
                                >
                                  <td className="px-5 py-2.5 text-gray-400 text-xs">{idx + 1}</td>
                                  <td className="px-4 py-2.5 font-medium text-gray-800"><Highlight text={s.name} query={q} /></td>
                                  <td className="px-4 py-2.5 text-gray-500 font-mono text-xs"><Highlight text={s.code} query={q} /></td>
                                  {isDirector && (
                                    <td className="px-4 py-2.5">
                                      <div className="flex items-center gap-3">
                                        <button
                                          onClick={() => openEdit(s)}
                                          className="text-xs text-primary-600 hover:text-primary-800 font-medium"
                                        >
                                          Edit
                                        </button>
                                        {isAdmin && (
                                          <button
                                            onClick={() => {
                                              if (confirm(`Delete station "${s.name}"?`)) deleteMutation.mutate(s.id)
                                            }}
                                            className="text-xs text-red-600 hover:text-red-800"
                                          >
                                            Delete
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )
        })()
      )}
    </div>
  )
}
