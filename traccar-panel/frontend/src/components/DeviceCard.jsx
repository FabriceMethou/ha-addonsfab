import React from 'react'
import { formatDistanceToNow } from 'date-fns'
import useTraccarStore from '../store/useTraccarStore.js'
import { parseTraccarArea, areaCenter } from '../utils/parseTraccarArea.js'
import { haversineMetres } from '../utils/haversine.js'

// Must match DeviceMarker's palette so the avatar color is consistent
const COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16']
function colorForDevice(id) {
  return COLORS[Math.abs(id) % COLORS.length]
}

function formatDistance(metres) {
  if (metres < 1000) return `${Math.round(metres)} m`
  return `${(metres / 1000).toFixed(1)} km`
}

// Inline SVG battery icon with fill proportional to charge level
function BatteryBar({ level }) {
  const fillColor = level > 40 ? '#22C55E' : level > 20 ? '#F59E0B' : '#EF4444'
  const textColor =
    level > 40
      ? 'text-green-600 dark:text-green-400'
      : level > 20
      ? 'text-yellow-500 dark:text-yellow-400'
      : 'text-red-500'
  const fillW = Math.round(13 * level / 100)
  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${textColor}`}>
      <svg width="20" height="11" viewBox="0 0 20 11" fill="none">
        <rect x="0.5" y="0.5" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1" />
        <rect x="1.5" y="1.5" width={fillW} height="8" rx="1" fill={fillColor} />
        <rect x="17" y="3.5" width="2.5" height="4" rx="1" fill="currentColor" />
      </svg>
      {level}%
    </span>
  )
}

export default function DeviceCard({ device, isSelected, onClick }) {
  const position = useTraccarStore((s) => s.positions[device.id])
  const geofences = useTraccarStore((s) => s.geofences)

  const color = colorForDevice(device.id)
  const initial = device.name[0]?.toUpperCase() ?? '?'

  const speedKmh = position ? Math.round((position.speed ?? 0) * 1.852) : 0
  const battery = position?.attributes?.batteryLevel ?? null
  const address = position?.address ?? null
  const lastSeen = position?.fixTime
    ? formatDistanceToNow(new Date(position.fixTime), { addSuffix: true })
    : 'never'

  const isOnline = device.status === 'online'
  const isDriving = speedKmh > 5
  const isWalking = !isDriving && speedKmh >= 0.5

  // Geofences the device is currently inside
  const geofenceIds = position?.geofenceIds ?? []
  const currentPlaces = geofenceIds
    .map((id) => geofences.find((g) => g.id === id)?.name)
    .filter(Boolean)

  // Distance from the "Home" geofence when not currently at home
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

  // Life360-style: icon + descriptive status text
  let statusIcon, statusText, statusColor
  if (!isOnline) {
    statusIcon = '○'
    statusText = 'Offline'
    statusColor = 'text-gray-400 dark:text-gray-500'
  } else if (isDriving) {
    statusIcon = '🚗'
    statusText = `Driving · ${speedKmh} km/h`
    statusColor = 'text-blue-600 dark:text-blue-400'
  } else if (isWalking) {
    statusIcon = '🚶'
    statusText = 'Walking'
    statusColor = 'text-teal-600 dark:text-teal-400'
  } else if (currentPlaces.length > 0) {
    const isHome = /home/i.test(currentPlaces[0])
    statusIcon = isHome ? '🏠' : '📍'
    statusText = `At ${currentPlaces[0]}`
    statusColor = 'text-green-600 dark:text-green-400'
  } else {
    statusIcon = '💤'
    statusText = 'Still'
    statusColor = 'text-gray-500 dark:text-gray-400'
  }

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-xl mb-1.5 transition-colors ${
        isSelected
          ? 'bg-blue-50 dark:bg-blue-900/40 ring-1 ring-blue-400'
          : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
      }`}
    >
      <div className="flex items-start gap-2.5">
        {/* Avatar circle — same color as map marker */}
        <div
          style={{ background: isOnline ? color : '#9CA3AF' }}
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm mt-0.5"
        >
          <span className="text-white font-bold text-base select-none">{initial}</span>
        </div>

        <div className="flex-1 min-w-0">
          {/* Row 1: Name + last seen */}
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-sm dark:text-white truncate">{device.name}</span>
            <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">{lastSeen}</span>
          </div>

          {/* Row 2: Status — hero element */}
          <p className={`text-sm font-medium mt-0.5 ${statusColor}`}>
            {statusIcon} {statusText}
          </p>

          {/* Row 3: Address (shown only when not at a named place) */}
          {address && currentPlaces.length === 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
              📍 {address}
            </p>
          )}

          {/* Row 4: Battery + distance from home */}
          {(battery !== null || distFromHome !== null) && (
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {battery !== null && <BatteryBar level={battery} />}
              {distFromHome !== null && (
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {formatDistance(distFromHome)} from home
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}
