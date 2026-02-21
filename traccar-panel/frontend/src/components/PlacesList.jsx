import React, { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import useTraccarStore from '../store/useTraccarStore.js'
import { parseTraccarArea, areaCenter } from '../utils/parseTraccarArea.js'

const PLACE_COLORS = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#84CC16']

function placeColor(name) {
  const code = [...name].reduce((sum, c) => sum + c.charCodeAt(0), 0)
  return PLACE_COLORS[code % PLACE_COLORS.length]
}

// Life360-style circular avatar with place initial
function PlaceAvatar({ name, occupied }) {
  const color = occupied ? placeColor(name) : '#9CA3AF'
  const initial = name[0]?.toUpperCase() ?? '?'
  return (
    <div
      style={{ background: color }}
      className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm"
    >
      <span className="text-white font-bold text-lg select-none">{initial}</span>
    </div>
  )
}

export default function PlacesList({ mapRef }) {
  const geofences = useTraccarStore((s) => s.geofences)
  const presence = useTraccarStore((s) => s.getGeofencePresence())
  const devices = useTraccarStore((s) => s.devices)
  const positions = useTraccarStore((s) => s.positions)

  const [selectedGfId, setSelectedGfId] = useState(null)

  function handleClick(gf) {
    const parsed = parseTraccarArea(gf.area)
    const center = areaCenter(parsed)
    if (center && mapRef?.current) mapRef.current.flyTo(center, 15)
    setSelectedGfId((prev) => (prev === gf.id ? null : gf.id))
  }

  if (geofences.length === 0) {
    return (
      <p className="text-sm text-gray-400 dark:text-gray-500 px-3 py-4">
        No geofences configured in Traccar.
      </p>
    )
  }

  // Sort: occupied first, then alphabetically
  const sorted = [...geofences].sort((a, b) => {
    const aOcc = (presence[a.id]?.length ?? 0) > 0
    const bOcc = (presence[b.id]?.length ?? 0) > 0
    if (aOcc !== bOcc) return aOcc ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return (
    <div className="overflow-y-auto flex-1 px-2 py-1">
      {sorted.map((gf) => {
        const names = presence[gf.id] ?? []
        const occupied = names.length > 0
        const isSelected = selectedGfId === gf.id

        const occupants = devices
          .filter((d) => positions[d.id]?.geofenceIds?.includes(gf.id))
          .map((d) => ({ device: d, pos: positions[d.id] }))

        return (
          <div key={gf.id} className="mb-1">
            <button
              onClick={() => handleClick(gf)}
              className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors ${
                isSelected
                  ? 'bg-blue-50 dark:bg-blue-900/40 ring-1 ring-blue-400'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <PlaceAvatar name={gf.name} occupied={occupied} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm dark:text-white truncate">{gf.name}</span>
                    {occupied && (
                      <span className="text-xs bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full flex-shrink-0 font-medium">
                        {names.length} here
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                    {occupied ? names.join(', ') : 'No one here'}
                  </p>
                </div>
              </div>
            </button>

            {/* Expanded occupant detail panel */}
            {isSelected && (
              <div className="mx-1 mb-1 rounded-b-xl border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 px-3 py-2">
                {occupants.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-gray-500">No one here right now.</p>
                ) : (
                  occupants.map(({ device, pos }) => {
                    const lastSeen = pos?.fixTime
                      ? formatDistanceToNow(new Date(pos.fixTime), { addSuffix: true })
                      : 'unknown'
                    const speedKmh = Math.round((pos?.speed ?? 0) * 1.852)
                    const battery = pos?.attributes?.batteryLevel ?? null
                    return (
                      <div
                        key={device.id}
                        className="flex items-center justify-between py-1.5 border-b border-blue-100 dark:border-blue-800 last:border-0"
                      >
                        <div>
                          <p className="text-xs font-semibold dark:text-white">{device.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{lastSeen}</p>
                        </div>
                        <div className="text-right">
                          {battery !== null && (
                            <p className={`text-xs font-medium ${
                              battery > 40
                                ? 'text-green-600 dark:text-green-400'
                                : battery > 20
                                ? 'text-yellow-600 dark:text-yellow-400'
                                : 'text-red-500'
                            }`}>
                              🔋 {battery}%
                            </p>
                          )}
                          {speedKmh > 0 && (
                            <p className="text-xs text-gray-400 dark:text-gray-500">🚗 {speedKmh} km/h</p>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
