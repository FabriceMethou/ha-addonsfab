import React from 'react'
import useTraccarStore from '../store/useTraccarStore.js'
import { parseTraccarArea, areaCenter } from '../utils/parseTraccarArea.js'

export default function PlacesList({ mapRef }) {
  const geofences = useTraccarStore((s) => s.geofences)
  const presence = useTraccarStore((s) => s.getGeofencePresence())

  function flyToGeofence(gf) {
    const parsed = parseTraccarArea(gf.area)
    const center = areaCenter(parsed)
    if (!center || !mapRef?.current) return
    mapRef.current.flyTo(center, 15)
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
        return (
          <button
            key={gf.id}
            onClick={() => flyToGeofence(gf)}
            className="w-full text-left px-3 py-2 rounded-lg mb-1 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm dark:text-white">{gf.name}</span>
              <span
                className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                  occupied ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {occupied ? names.join(', ') : 'Empty'}
            </p>
          </button>
        )
      })}
    </div>
  )
}
