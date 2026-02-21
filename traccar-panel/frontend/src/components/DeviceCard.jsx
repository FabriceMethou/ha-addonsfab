import React from 'react'
import { formatDistanceToNow } from 'date-fns'
import useTraccarStore from '../store/useTraccarStore.js'

function BatteryIcon({ level }) {
  const color = level > 40 ? 'text-green-500' : level > 20 ? 'text-yellow-500' : 'text-red-500'
  return (
    <span className={`text-xs font-medium ${color}`}>
      {level >= 80 ? '▓▓▓▓' : level >= 60 ? '▓▓▓░' : level >= 40 ? '▓▓░░' : level >= 20 ? '▓░░░' : '░░░░'}{' '}
      {level}%
    </span>
  )
}

export default function DeviceCard({ device, isSelected, onClick }) {
  const position = useTraccarStore((s) => s.positions[device.id])

  const speedKmh = position ? Math.round((position.speed ?? 0) * 1.852) : 0
  const battery = position?.attributes?.batteryLevel ?? null
  const address = position?.address ?? null
  const lastSeen = position?.fixTime
    ? formatDistanceToNow(new Date(position.fixTime), { addSuffix: true })
    : 'never'

  const isOnline = device.status === 'online'
  const isDriving = speedKmh > 3 // moving faster than walking pace

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
        <span
          className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${
            isDriving
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
              : isOnline
              ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
              : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
          }`}
        >
          {isDriving ? `${speedKmh} km/h` : isOnline ? 'Home' : 'Offline'}
        </span>
      </div>

      {/* Row 2: address */}
      {address && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{address}</p>
      )}

      {/* Row 3: meta */}
      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
        {battery !== null && <BatteryIcon level={battery} />}
        <span className="text-xs text-gray-400 dark:text-gray-500">{lastSeen}</span>
      </div>
    </button>
  )
}
