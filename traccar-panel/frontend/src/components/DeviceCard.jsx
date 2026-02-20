import React from 'react'
import { formatDistanceToNow } from 'date-fns'
import useTraccarStore from '../store/useTraccarStore.js'

export default function DeviceCard({ device, isSelected, onClick }) {
  const position = useTraccarStore((s) => s.positions[device.id])

  const speedKmh = position ? Math.round((position.speed ?? 0) * 1.852) : 0
  const battery = position?.attributes?.batteryLevel ?? null
  const address = position?.address ?? null
  const lastSeen = position?.fixTime
    ? formatDistanceToNow(new Date(position.fixTime), { addSuffix: true })
    : 'never'
  const isOnline = device.status === 'online'

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-lg mb-1 transition-colors ${
        isSelected
          ? 'bg-blue-100 dark:bg-blue-900'
          : 'hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm dark:text-white">{device.name}</span>
        <span
          className={`text-xs px-1.5 py-0.5 rounded-full ${
            isOnline ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {isOnline ? 'Online' : 'Offline'}
        </span>
      </div>
      {address && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{address}</p>
      )}
      <div className="flex gap-3 mt-0.5">
        {speedKmh > 0 && (
          <span className="text-xs text-gray-500 dark:text-gray-400">{speedKmh} km/h</span>
        )}
        {battery !== null && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {battery >= 20 ? '🔋' : '🪫'} {battery}%
          </span>
        )}
        <span className="text-xs text-gray-400 dark:text-gray-500">{lastSeen}</span>
      </div>
    </button>
  )
}
