import { useState, useEffect } from 'react'
import type { Station } from '@/types'

interface StationPickerProps {
  stations: Station[]
  value?: number                          // currently selected station_id
  onChange: (stationId: number | undefined) => void
  error?: string
  disabled?: boolean
}

export function StationPicker({ stations, value, onChange, error, disabled }: StationPickerProps) {
  const [region, setRegion] = useState('')
  const [county, setCounty] = useState('')

  // Sync pickers when value is set externally (e.g. default from user profile)
  useEffect(() => {
    if (value) {
      const st = stations.find((s) => s.id === value)
      if (st) {
        setRegion(st.region)
        setCounty(st.county)
      }
    }
  }, [value, stations])

  const regions = [...new Set(stations.map((s) => s.region))].sort()

  const counties = [...new Set(
    stations.filter((s) => s.region === region).map((s) => s.county)
  )].sort()

  const stationList = stations.filter(
    (s) => s.region === region && s.county === county
  ).sort((a, b) => a.name.localeCompare(b.name))

  function handleRegion(r: string) {
    setRegion(r)
    setCounty('')
    onChange(undefined)
  }

  function handleCounty(c: string) {
    setCounty(c)
    onChange(undefined)
  }

  function handleStation(raw: string) {
    onChange(raw ? Number(raw) : undefined)
  }

  const selectedStationId = value ?? ''

  return (
    <div className="space-y-3">
      {/* Row 1: Region */}
      <div>
        <label className="label">Region</label>
        <select
          className="input"
          value={region}
          onChange={(e) => handleRegion(e.target.value)}
          disabled={disabled}
        >
          <option value="">— Select region —</option>
          {regions.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      {/* Row 2: County — visible once region chosen */}
      <div>
        <label className={`label ${!region ? 'text-gray-400' : ''}`}>County</label>
        <select
          className="input disabled:bg-gray-50 disabled:text-gray-400"
          value={county}
          onChange={(e) => handleCounty(e.target.value)}
          disabled={disabled || !region}
        >
          <option value="">— Select county —</option>
          {counties.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Row 3: Station — visible once county chosen */}
      <div>
        <label className={`label ${!county ? 'text-gray-400' : ''}`}>Station</label>
        <select
          className="input disabled:bg-gray-50 disabled:text-gray-400"
          value={selectedStationId}
          onChange={(e) => handleStation(e.target.value)}
          disabled={disabled || !county}
        >
          <option value="">— Select station —</option>
          {stationList.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  )
}
