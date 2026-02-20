import React from 'react'
import useTraccarStore from '../store/useTraccarStore.js'
import { parseTraccarArea } from '../utils/parseTraccarArea.js'

export default function PlacesList({ mapRef }) {
  const geofences = useTraccarStore((s) => s.geofences)
  const presence = useTraccarStore((s) => s.getGeofencePresence())

  function flyToGeofence(gf) {
    const parsed = parseTraccarArea(gf.area)
    if (!parsed || !mapRef?.current) return

    if (parsed.type === 'circle') {
      mapRef.current.flyTo([parsed.lat, parsed.lon], 15)
    } else if (parsed.type === 'polygon' && parsed.coords.length > 0) {
      const lats = parsed.coords.map((c) => c[0])
      const lons = parsed.coords.map((c) => c[1])
      const center = [
        (Math.min(...lats) + Math.max(...lats)) / 2,
        (Math.min(...lons) + Math.max(...lons)) / 2,
      ]
      mapRef.current.flyTo(center, 15)
    }
  }

  if (geofences.length === 0) {
    return (
      <p className="text-sm text-gray-400 dark:text-gray-500 px-3 py-4">
        No geofences configured in Traccar.
      </p>
    )
  }

  return (
    <div className="overflow-y-auto flex-1">
      {geofences.map((gf) => {
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
                className={`w-2.5 h-2.5 rounded-full ${occupied ? 'bg-green-500' : 'bg-gray-300'}`}
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
