import React, { useRef, useEffect, useState } from 'react'
import useTraccarStore from './store/useTraccarStore.js'
import { useTraccar } from './hooks/useTraccar.js'
import { useWebSocket } from './hooks/useWebSocket.js'
import Map from './components/Map.jsx'
import Sidebar from './components/Sidebar.jsx'
import ToastAlerts from './components/ToastAlerts.jsx'

export default function App() {
  const loading = useTraccarStore((s) => s.loading)
  const error = useTraccarStore((s) => s.error)
  const darkMode = useTraccarStore((s) => s.darkMode)
  const mapTile = useTraccarStore((s) => s.mapTile)
  const setMapTile = useTraccarStore((s) => s.setMapTile)
  const mapRef = useRef(null)

  // Sidebar hidden by default on mobile, visible on desktop
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  )

  // Apply dark mode class on root element
  useEffect(() => {
    const root = document.documentElement
    if (darkMode) root.classList.add('dark')
    else root.classList.remove('dark')
  }, [darkMode])

  // Auto-switch map tiles with dark mode (only for light/dark pairs, not satellite)
  useEffect(() => {
    if (darkMode && (mapTile === 'osm' || mapTile === 'cartoLight')) {
      setMapTile('cartoDark')
    } else if (!darkMode && mapTile === 'cartoDark') {
      setMapTile('osm')
    }
  }, [darkMode]) // eslint-disable-line

  useTraccar()
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
        <Map mapRef={mapRef} />
      </div>

      {/* Mobile backdrop — close sidebar when tapping outside */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-[499] md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — slides in from right on mobile, always visible on md+ */}
      <div
        className={`
          flex-shrink-0 flex flex-col
          fixed right-0 top-0 bottom-0 w-72 z-[500]
          transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'}
          md:relative md:translate-x-0
        `}
      >
        <Sidebar mapRef={mapRef} onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Mobile FAB — toggle sidebar */}
      <button
        onClick={() => setSidebarOpen((v) => !v)}
        className="fixed bottom-6 right-4 z-[501] md:hidden w-12 h-12 rounded-full bg-blue-500 text-white shadow-lg flex items-center justify-center text-xl font-bold"
        aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
      >
        {sidebarOpen ? '✕' : '☰'}
      </button>

      <ToastAlerts />
    </div>
  )
}
