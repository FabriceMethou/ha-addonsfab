import React, { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import useTraccarStore from '../store/useTraccarStore.js'
import { parseTraccarArea, areaCenter } from '../utils/parseTraccarArea.js'

export default function PlacesList({ mapRef }) {
  const geofences = useTraccarStore((s) => s.geofences)
  const presence = useTraccarStore((s) => s.getGeofencePresence())
  const devices = useTraccarStore((s) => s.devices)
  const positions = useTraccarStore((s) => s.positions)

  const [selectedGfId, setSelectedGfId] = useState(null)

  function handleClick(gf) {
    // Fly to geofence on map
    const parsed = parseTraccarArea(gf.area)
    const center = areaCenter(parsed)
    if (center && mapRef?.current) mapRef.current.flyTo(center, 15)
    // Toggle detail panel
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
    <div className="overflow-y-auto flex-1 p-2">
      {sorted.map((gf) => {
        const names = presence[gf.id] ?? []
        const occupied = names.length > 0
        const isSelected = selectedGfId === gf.id

        // Find the actual device objects currently inside this geofence
        const occupants = devices
          .filter((d) => {
            const pos = positions[d.id]
            return pos?.geofenceIds?.includes(gf.id)
          })
          .map((d) => ({ device: d, pos: positions[d.id] }))

        return (
          <div key={gf.id} className="mb-1">
            <button
              onClick={() => handleClick(gf)}
              className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                isSelected
                  ? 'bg-blue-50 dark:bg-blue-900/40 ring-1 ring-blue-400'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm dark:text-white">{gf.name}</span>
                <div className="flex items-center gap-1.5">
                  {occupied && (
                    <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                      {names.length}
                    </span>
                  )}
                  <span
                    className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      occupied ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {occupied ? names.join(', ') : 'Empty'}
              </p>
            </button>

            {/* Detail panel — shown when geofence is selected */}
            {isSelected && (
              <div className="mx-1 mb-1 rounded-b-lg border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 px-3 py-2">
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
                      <div key={device.id} className="flex items-start justify-between py-1 border-b border-blue-100 dark:border-blue-800 last:border-0">
                        <div>
                          <p className="text-xs font-medium dark:text-white">{device.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{lastSeen}</p>
                        </div>
                        <div className="text-right">
                          {battery !== null && (
                            <p className={`text-xs font-medium ${
                              battery > 40 ? 'text-green-600' : battery > 20 ? 'text-yellow-600' : 'text-red-500'
                            }`}>{battery}%</p>
                          )}
                          {speedKmh > 0 && (
                            <p className="text-xs text-gray-400">{speedKmh} km/h</p>
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
