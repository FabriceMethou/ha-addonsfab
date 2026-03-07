import React from 'react'
import useTraccarStore from '../store/useTraccarStore.js'

export default function SOSOverlay() {
  const sosAlert = useTraccarStore((s) => s.activeSOS)
  const dismissSOS = useTraccarStore((s) => s.dismissSOS)

  if (!sosAlert) return null

  const { deviceName, latitude, longitude, timestamp } = sosAlert
  const time = new Date(timestamp).toLocaleTimeString()
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`

  return (
    <div className="fixed inset-0 z-[3000] bg-red-600/95 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
        <div className="text-5xl mb-4">🆘</div>
        <h2 className="text-2xl font-bold text-red-600 mb-2">SOS Emergency</h2>
        <p className="text-lg font-semibold dark:text-white mb-1">{deviceName}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">at {time}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
          {latitude.toFixed(5)}, {longitude.toFixed(5)}
        </p>
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-medium text-sm mb-3"
        >
          Get Directions
        </a>
        <button
          onClick={dismissSOS}
          className="block w-full py-2.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg font-medium text-sm"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
