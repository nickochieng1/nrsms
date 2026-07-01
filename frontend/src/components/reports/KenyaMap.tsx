import { useState } from 'react'
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps'
import type { LeagueRow } from '@/api/reports'

// GADM county names → our system county names (only entries that differ)
const GADM_TO_SYSTEM: Record<string, string> = {
  "HomaBay":      "Homa Bay",
  "TaitaTaveta":  "Taita Taveta",
  "TanaRiver":    "Tana River",
  "TransNzoia":   "Trans Nzoia",
  "UasinGishu":   "Uasin Gishu",
  "WestPokot":    "West Pokot",
  "Murang'a":     "Murang'a",
}

function normalise(name: string): string {
  return (GADM_TO_SYSTEM[name] ?? name).toLowerCase().trim()
}

type Metric = 'applications' | 'ids_received' | 'completeness'

interface Props {
  rows: LeagueRow[]
  metric: Metric
}

function getColor(row: LeagueRow | undefined, metric: Metric, maxVal: number): string {
  if (!row) return '#e5e7eb' // light gray — no data

  if (metric === 'completeness') {
    const p = row.completeness_pct ?? 0
    if (p >= 80) return '#16a34a'
    if (p >= 60) return '#65a30d'
    if (p >= 40) return '#d97706'
    if (p >= 20) return '#f97316'
    return '#dc2626'
  }

  // applications / ids_received — light → dark blue scale
  const val = metric === 'applications' ? row.applications : row.ids_received
  if (maxVal === 0) return '#dbeafe'
  const ratio = Math.min(val / maxVal, 1)
  // interpolate from #dbeafe (very light blue) to #1e40af (deep blue)
  const r = Math.round(219 - ratio * (219 - 30))
  const g = Math.round(190 - ratio * (190 - 64))
  const b = Math.round(254 - ratio * (254 - 175))
  return `rgb(${r},${g},${b})`
}

export function KenyaMap({ rows, metric }: Props) {
  const [tooltip, setTooltip] = useState<{
    name: string
    x: number
    y: number
    row?: LeagueRow
  } | null>(null)

  const byCounty = Object.fromEntries(
    rows.map((r) => [normalise(r.county), r])
  )

  const maxVal = Math.max(
    1,
    ...rows.map((r) => metric === 'applications' ? r.applications : r.ids_received)
  )

  return (
    <div className="relative select-none">
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ center: [37.9, 0.5], scale: 2200 }}
        width={600}
        height={520}
        style={{ width: '100%', height: 'auto' }}
      >
        <ZoomableGroup zoom={1} center={[37.9, 0.5]} minZoom={0.8} maxZoom={6}>
          <Geographies geography="/kenya-counties.json">
            {({ geographies }) =>
              geographies.map((geo) => {
                const gadmName = geo.properties.NAME_1 as string
                const sysName  = normalise(gadmName)
                const row      = byCounty[sysName]
                const fill     = getColor(row, metric, maxVal)
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={fill}
                    stroke="#ffffff"
                    strokeWidth={0.5}
                    style={{
                      default:  { outline: 'none', cursor: 'pointer', transition: 'fill 0.2s' },
                      hover:    { outline: 'none', filter: 'brightness(0.85)' },
                      pressed:  { outline: 'none' },
                    }}
                    onMouseEnter={(e) => {
                      setTooltip({ name: GADM_TO_SYSTEM[gadmName] ?? gadmName, x: e.clientX, y: e.clientY, row })
                    }}
                    onMouseMove={(e) => {
                      setTooltip((t) => t ? { ...t, x: e.clientX, y: e.clientY } : t)
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                )
              })
            }
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-white border border-gray-200 rounded-xl shadow-xl px-4 py-3 text-sm pointer-events-none"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10, minWidth: 180 }}
        >
          <p className="font-bold text-gray-900 mb-1">{tooltip.name} County</p>
          {tooltip.row ? (
            <dl className="space-y-0.5 text-xs">
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Applications</dt>
                <dd className="font-medium text-blue-700">{tooltip.row.applications.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">IDs Received</dt>
                <dd className="font-medium text-green-700">{tooltip.row.ids_received.toLocaleString()}</dd>
              </div>
              {tooltip.row.completeness_pct != null && (
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Completeness</dt>
                  <dd className={`font-medium ${tooltip.row.completeness_pct >= 80 ? 'text-emerald-600' : tooltip.row.completeness_pct >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                    {tooltip.row.completeness_pct}%
                    ({tooltip.row.submitted_subcounties}/{tooltip.row.expected_subcounties})
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Rank</dt>
                <dd className="font-medium text-gray-700">#{tooltip.row.rank}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-xs text-gray-400">No approved data this period</p>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="mt-3 flex items-center gap-3 flex-wrap">
        {metric === 'completeness' ? (
          <>
            <span className="text-xs text-gray-500">Completeness:</span>
            {[['≥ 80%', '#16a34a'], ['60–79%', '#65a30d'], ['40–59%', '#d97706'], ['20–39%', '#f97316'], ['< 20%', '#dc2626'], ['No data', '#e5e7eb']].map(([label, color]) => (
              <span key={label} className="flex items-center gap-1 text-xs text-gray-600">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
                {label}
              </span>
            ))}
          </>
        ) : (
          <>
            <span className="text-xs text-gray-500">{metric === 'applications' ? 'Applications' : 'IDs Received'}:</span>
            <span className="flex items-center gap-1 text-xs text-gray-600">
              <span className="inline-block w-16 h-3 rounded-sm" style={{ background: 'linear-gradient(to right, #dbeafe, #1e40af)' }} />
              Low → High
            </span>
            <span className="flex items-center gap-1 text-xs text-gray-600">
              <span className="inline-block w-3 h-3 rounded-sm bg-gray-200" />
              No data
            </span>
          </>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-1">Scroll to zoom · Drag to pan</p>
    </div>
  )
}
