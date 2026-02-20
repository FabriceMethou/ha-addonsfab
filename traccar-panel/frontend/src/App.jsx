import React, { useRef, useEffect } from 'react'
import useTraccarStore from './store/useTraccarStore.js'
import { useTraccar } from './hooks/useTraccar.js'
import { useWebSocket } from './hooks/useWebSocket.js'
import Map from './components/Map.jsx'
import Sidebar from './components/Sidebar.jsx'

export default function App() {
  const loading = useTraccarStore((s) => s.loading)
  const error = useTraccarStore((s) => s.error)
  const darkMode = useTraccarStore((s) => s.darkMode)
  const mapRef = useRef(null)
  // Shared ref: HistoryControls writes here, HistoryOverlay (inside MapContainer) reads it
  const historyOverlayRef = useRef({ points: [], markerPos: null })

  // Apply dark mode class on root element
  useEffect(() => {
    const root = document.documentElement
    if (darkMode) root.classList.add('dark')
    else root.classList.remove('dark')
  }, [darkMode])

  // Load initial data
  useTraccar()

  // Connect WebSocket
  useWebSocket()

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-white dark:bg-gray-900">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Connecting to Traccar...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-white dark:bg-gray-900">
        <div className="text-center max-w-sm px-4">
          <p className="text-red-500 font-medium mb-2">Failed to load</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`h-screen flex overflow-hidden ${darkMode ? 'dark' : ''}`}>
      {/* Map — takes remaining space */}
      <div className="flex-1 relative">
        <Map mapRef={mapRef} historyOverlayRef={historyOverlayRef} />
      </div>

      {/* Sidebar — fixed width, visible on sm+ screens */}
      <div className="w-72 flex-shrink-0 flex flex-col">
        <Sidebar mapRef={mapRef} historyOverlayRef={historyOverlayRef} />
      </div>
    </div>
  )
}
