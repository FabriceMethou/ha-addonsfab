import React, { useState, useMemo } from 'react'
import useTraccarStore from '../store/useTraccarStore.js'
import DeviceCard from './DeviceCard.jsx'
import DeviceTripsView from './DeviceTripsView.jsx'
import PlacesList from './PlacesList.jsx'
import { HistoryControls } from './HistoryPlayer.jsx'
import EventLog from './EventLog.jsx'
import WeeklyReport from './WeeklyReport.jsx'

const TABS = [
  { id: 'live', label: 'Live' },
  { id: 'places', label: 'Places' },
  { id: 'history', label: 'History' },
  { id: 'events', label: 'Events' },
  { id: 'report', label: 'Report' },
]

const SORT_OPTIONS = [
  { value: 'lastSeen', label: 'Last seen' },
  { value: 'driving', label: 'Driving first' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'battery', label: 'Battery low' },
]

function sortDevices(devices, positions, sortBy) {
  return [...devices].sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name)

    if (sortBy === 'driving') {
      const aKmh = Math.round((positions[a.id]?.speed ?? 0) * 1.852)
      const bKmh = Math.round((positions[b.id]?.speed ?? 0) * 1.852)
      const aDriving = aKmh > 5
      const bDriving = bKmh > 5
      if (aDriving !== bDriving) return aDriving ? -1 : 1
      return bKmh - aKmh
    }

    if (sortBy === 'battery') {
      // Lowest battery first (most needs charging); devices with no battery data go last
      const aBatt = positions[a.id]?.attributes?.batteryLevel ?? 101
      const bBatt = positions[b.id]?.attributes?.batteryLevel ?? 101
      return aBatt - bBatt
    }

    // lastSeen — most recent fixTime first, offline devices last
    const aTime = positions[a.id]?.fixTime ? new Date(positions[a.id].fixTime).getTime() : 0
    const bTime = positions[b.id]?.fixTime ? new Date(positions[b.id].fixTime).getTime() : 0
    return bTime - aTime
  })
}

export default function Sidebar({ mapRef }) {
  const devices = useTraccarStore((s) => s.devices)
  const positions = useTraccarStore((s) => s.positions)
  const selectedDeviceId = useTraccarStore((s) => s.selectedDeviceId)
  const profileDevice = useTraccarStore((s) => s.profileDevice)
  const activeTab = useTraccarStore((s) => s.activeTab)
  const connected = useTraccarStore((s) => s.connected)
  const darkMode = useTraccarStore((s) => s.darkMode)
  const loading = useTraccarStore((s) => s.loading)
  const { setProfileDevice, openDeviceProfile, setActiveTab, toggleDarkMode, refresh } = useTraccarStore()

  const [sortBy, setSortBy] = useState('lastSeen')
  const [filterText, setFilterText] = useState('')
  const [notifDismissed, setNotifDismissed] = useState(
    () => localStorage.getItem('notifBannerDismissed') === 'true'
  )

  function handleDeviceClick(device) {
    openDeviceProfile(device) // sets selectedDeviceId + profileDevice + activeTab:'live'
    // Use the component-level positions subscription — avoids synchronous getState() call
    // which could read stale data if a WS update arrives between the click and the read.
    const pos = positions[device.id]
    if (pos && mapRef?.current) {
      mapRef.current.flyTo([pos.latitude, pos.longitude], 15)
    }
  }

  function handleRefresh() {
    refresh()
  }

  function handleEnableNotifications() {
    Notification.requestPermission()
    setNotifDismissed(true)
    localStorage.setItem('notifBannerDismissed', 'true')
  }

  function handleDismissNotifBanner() {
    setNotifDismissed(true)
    localStorage.setItem('notifBannerDismissed', 'true')
  }

  // Memoised so the expensive sort only runs when devices, positions or sortBy change —
  // not on every render triggered by unrelated state (dark mode, tab, etc.).
  const sortedDevices = useMemo(
    () => sortDevices(devices, positions, sortBy),
    [devices, positions, sortBy]
  )
  const filteredDevices = useMemo(
    () =>
      filterText
        ? sortedDevices.filter((d) => d.name.toLowerCase().includes(filterText.toLowerCase()))
        : sortedDevices,
    [sortedDevices, filterText]
  )

  const showNotifBanner =
    typeof Notification !== 'undefined' &&
    Notification.permission === 'default' &&
    !notifDismissed

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <span className="font-bold text-sm dark:text-white">Family Map</span>
        <div className="flex items-center gap-2">
          <span
            title={connected ? 'Connected' : 'Disconnected'}
            className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}
          />
          <button
            onClick={handleRefresh}
            disabled={loading}
            className={`text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-sm ${loading ? 'animate-spin' : ''}`}
            title="Refresh data"
          >
            ↺
          </button>
          <button
            onClick={toggleDarkMode}
            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-sm"
            title="Toggle dark mode"
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
      </div>

      {/* Notification permission banner */}
      {showNotifBanner && (
        <div className="bg-blue-50 dark:bg-blue-900/40 border-b border-blue-200 dark:border-blue-700 px-3 py-1.5 flex items-center gap-2">
          <p className="text-xs text-blue-700 dark:text-blue-300 flex-1">
            Enable notifications for arrival/departure alerts.
          </p>
          <button
            onClick={handleEnableNotifications}
            className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline flex-shrink-0"
          >
            Enable
          </button>
          <button
            onClick={handleDismissNotifBanner}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm leading-none flex-shrink-0"
          >
            ×
          </button>
        </div>
      )}

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
          profileDevice ? (
            <DeviceTripsView
              device={profileDevice}
              onBack={() => setProfileDevice(null)}
              mapRef={mapRef}
            />
          ) : (
            <div className="flex flex-col h-full">
              {/* Sort + Search controls */}
              <div className="flex items-center gap-2 px-3 pt-2 pb-1">
                <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">Sort:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="text-xs rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-1.5 py-0.5"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              {/* Search filter */}
              <div className="px-3 pb-1">
                <input
                  type="search"
                  placeholder="Search by name..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  className="w-full text-xs rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-2 py-1 placeholder-gray-400"
                />
              </div>

              <div className="flex-1 overflow-y-auto px-2 pb-2">
                {devices.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500 px-1 py-4">No devices found.</p>
                ) : filteredDevices.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500 px-1 py-4">No match for "{filterText}".</p>
                ) : (
                  filteredDevices.map((device) => (
                    <DeviceCard
                      key={device.id}
                      device={device}
                      isSelected={selectedDeviceId === device.id}
                      onClick={() => handleDeviceClick(device)}
                    />
                  ))
                )}
              </div>
            </div>
          )
        )}

        {activeTab === 'places' && <PlacesList mapRef={mapRef} />}

        {activeTab === 'history' && <HistoryControls mapRef={mapRef} />}

        {activeTab === 'events' && <EventLog />}

        {activeTab === 'report' && <WeeklyReport />}
      </div>
    </div>
  )
}
