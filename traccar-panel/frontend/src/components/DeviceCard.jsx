import React from 'react'
import { formatDistanceToNow } from 'date-fns'
import useTraccarStore from '../store/useTraccarStore.js'
import { parseTraccarArea, areaCenter } from '../utils/parseTraccarArea.js'
import { haversineMetres } from '../utils/haversine.js'

function BatteryIcon({ level }) {
  const color = level > 40 ? 'text-green-500' : level > 20 ? 'text-yellow-500' : 'text-red-500'
  return (
    <span className={`text-xs font-medium ${color}`}>
      {level >= 80 ? '▓▓▓▓' : level >= 60 ? '▓▓▓░' : level >= 40 ? '▓▓░░' : level >= 20 ? '▓░░░' : '░░░░'}{' '}
      {level}%
    </span>
  )
}

function formatDistance(metres) {
  if (metres < 1000) return `${Math.round(metres)} m`
  return `${(metres / 1000).toFixed(1)} km`
}

export default function DeviceCard({ device, isSelected, onClick }) {
  const position = useTraccarStore((s) => s.positions[device.id])
  const geofences = useTraccarStore((s) => s.geofences)

  const speedKmh = position ? Math.round((position.speed ?? 0) * 1.852) : 0
  const battery = position?.attributes?.batteryLevel ?? null
  const address = position?.address ?? null
  const lastSeen = position?.fixTime
    ? formatDistanceToNow(new Date(position.fixTime), { addSuffix: true })
    : 'never'

  const isOnline = device.status === 'online'

  // Activity thresholds
  const isDriving = speedKmh > 5
  const isWalking = !isDriving && speedKmh >= 0.5

  // Geofences the device is currently in
  const geofenceIds = position?.geofenceIds ?? []
  const currentPlaces = geofenceIds
    .map((id) => geofences.find((g) => g.id === id)?.name)
    .filter(Boolean)

  // Distance from "Home" geofence (first geofence matching 'home', case-insensitive)
  let distFromHome = null
  if (position && geofences.length > 0) {
    const homeGf = geofences.find((g) => /home/i.test(g.name)) ?? null
    if (homeGf && !geofenceIds.includes(homeGf.id)) {
      const parsed = parseTraccarArea(homeGf.area)
      const center = areaCenter(parsed)
      if (center) {
        distFromHome = haversineMetres(position.latitude, position.longitude, center[0], center[1])
      }
    }
  }

  // Status label and color
  let statusLabel, statusClass
  if (isDriving) {
    statusLabel = `${speedKmh} km/h`
    statusClass = 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
  } else if (isWalking) {
    statusLabel = 'Walking'
    statusClass = 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300'
  } else if (currentPlaces.length > 0) {
    statusLabel = `At ${currentPlaces[0]}`
    statusClass = 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
  } else if (isOnline) {
    statusLabel = 'Still'
    statusClass = 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
  } else {
    statusLabel = 'Offline'
    statusClass = 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
  }

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-lg mb-1 transition-colors ${
        isSelected
          ? 'bg-blue-50 dark:bg-blue-900/40 ring-1 ring-blue-400'
          : 'hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}
    >
      {/* Row 1: name + status badge */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-sm dark:text-white truncate">{device.name}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${statusClass}`}>
          {statusLabel}
        </span>
      </div>

      {/* Row 2: address — hidden when at a geofence (status badge already shows that) */}
      {address && currentPlaces.length === 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{address}</p>
      )}

      {/* Row 3: meta */}
      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
        {battery !== null && <BatteryIcon level={battery} />}
        {distFromHome !== null && (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {formatDistance(distFromHome)} from home
          </span>
        )}
        <span className="text-xs text-gray-400 dark:text-gray-500">{lastSeen}</span>
      </div>
    </button>
  )
}
