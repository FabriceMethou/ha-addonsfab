import React, { useRef } from 'react'
import useTraccarStore from '../store/useTraccarStore.js'
import DeviceCard from './DeviceCard.jsx'
import PlacesList from './PlacesList.jsx'
import { HistoryControls } from './HistoryPlayer.jsx'
import EventLog from './EventLog.jsx'

const TABS = [
  { id: 'live', label: 'Live' },
  { id: 'places', label: 'Places' },
  { id: 'history', label: 'History' },
  { id: 'events', label: 'Events' },
]

export default function Sidebar({ mapRef }) {
  const devices = useTraccarStore((s) => s.devices)
  const selectedDeviceId = useTraccarStore((s) => s.selectedDeviceId)
  const activeTab = useTraccarStore((s) => s.activeTab)
  const connected = useTraccarStore((s) => s.connected)
  const darkMode = useTraccarStore((s) => s.darkMode)
  const { setSelectedDevice, setActiveTab, toggleDarkMode } = useTraccarStore()

  function handleDeviceClick(id) {
    setSelectedDevice(id)
    // Fly to device on map
    const pos = useTraccarStore.getState().positions[id]
    if (pos && mapRef?.current) {
      mapRef.current.flyTo([pos.latitude, pos.longitude], 15)
    }
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <span className="font-bold text-sm dark:text-white">Family Map</span>
        <div className="flex items-center gap-2">
          {/* Connection indicator */}
          <span
            title={connected ? 'Connected' : 'Disconnected'}
            className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}
          />
          <button
            onClick={toggleDarkMode}
            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-sm"
            title="Toggle dark mode"
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
      </div>

      {/* Disconnected banner */}
      {!connected && (
        <div className="bg-yellow-50 dark:bg-yellow-900 border-b border-yellow-200 dark:border-yellow-700 px-3 py-1.5">
          <p className="text-xs text-yellow-700 dark:text-yellow-300">
            <span className="animate-pulse">●</span> Lost connection — reconnecting...
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'live' && (
          <div className="p-2">
            {devices.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 px-1 py-4">No devices found.</p>
            ) : (
              devices.map((device) => (
                <DeviceCard
                  key={device.id}
                  device={device}
                  isSelected={selectedDeviceId === device.id}
                  onClick={() => handleDeviceClick(device.id)}
                />
              ))
            )}
          </div>
        )}

        {activeTab === 'places' && <PlacesList mapRef={mapRef} />}

        {activeTab === 'history' && <HistoryControls mapRef={mapRef} />}

        {activeTab === 'events' && <EventLog />}
      </div>
    </div>
  )
}
