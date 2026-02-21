import { create } from 'zustand'

const MAX_ALERTS = 20

const useTraccarStore = create((set, get) => ({
  // Data
  devices: [],       // [{id, name, status, lastUpdate, ...}]
  positions: {},     // deviceId -> {latitude, longitude, speed, course, address, geofenceIds, ...}
  geofences: [],     // [{id, name, area, ...}]
  trips: [],         // auto-detected trips from /api/reports/trips

  // UI state
  selectedDeviceId: null,
  activeTab: 'live', // 'live' | 'places' | 'history'
  darkMode: localStorage.getItem('darkMode') === 'true',
  mapTile: localStorage.getItem('mapTile') || 'osm', // 'osm' | 'satellite'

  // Alerts (geofence enter/exit, battery low from WS events)
  alerts: [], // [{id, type, deviceName, geofenceName?, battery?, ts}]
  batteryAlerted: new Set(), // deviceIds that have had a low-battery alert sent

  // Geofence arrival times from live WS events: { [deviceId]: { [geofenceId]: timestamp_ms } }
  geofenceArrivals: {},

  // Trip replay state (written by HistoryControls, read by HistoryOverlay inside MapContainer)
  animatedRoute: [],          // GPS points array currently loaded
  animatedMarker: null,       // {lat, lon} current animation position

  // Connection state
  connected: false,
  loading: true,
  error: null,

  // Manual refresh trigger (increment to force useTraccar to reload)
  refreshToken: 0,

  // Selected stop in StopsList (for map highlight)
  selectedStop: null, // {latitude, longitude, duration, address?}

  // Actions
  setDevices: (devices) => set({ devices }),

  // Merge backfilled arrival timestamps; WS-derived arrivals win if newer
  seedGeofenceArrivals: (arrivals) =>
    set((s) => {
      const merged = { ...s.geofenceArrivals }
      for (const [deviceId, gfMap] of Object.entries(arrivals)) {
        merged[deviceId] = { ...(merged[deviceId] ?? {}) }
        for (const [gfId, ts] of Object.entries(gfMap)) {
          if (!merged[deviceId][gfId] || ts > merged[deviceId][gfId]) {
            merged[deviceId][gfId] = ts
          }
        }
      }
      return { geofenceArrivals: merged }
    }),

  setPositions: (positionsArray) => {
    const map = {}
    for (const p of positionsArray) map[p.deviceId] = p
    set({ positions: map })
  },

  updatePosition: (position) =>
    set((state) => ({
      positions: { ...state.positions, [position.deviceId]: position },
    })),

  setGeofences: (geofences) => set({ geofences }),

  setTrips: (trips) => set({ trips }),

  setSelectedDevice: (id) => set({ selectedDeviceId: id }),

  setActiveTab: (tab) => set({ activeTab: tab }),

  setConnected: (connected) => set({ connected }),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error }),

  refresh: () => set((s) => ({ refreshToken: s.refreshToken + 1 })),

  setSelectedStop: (stop) => set({ selectedStop: stop }),

  toggleDarkMode: () =>
    set((state) => {
      const next = !state.darkMode
      localStorage.setItem('darkMode', String(next))
      return { darkMode: next }
    }),

  setMapTile: (tile) => {
    localStorage.setItem('mapTile', tile)
    set({ mapTile: tile })
  },

  pushAlert: (alert) =>
    set((state) => ({
      alerts: [{ ...alert, id: Date.now() + Math.random() }, ...state.alerts].slice(0, MAX_ALERTS),
    })),

  dismissAlert: (id) =>
    set((state) => ({ alerts: state.alerts.filter((a) => a.id !== id) })),

  setAnimatedRoute: (points) => set({ animatedRoute: points }),
  setAnimatedMarker: (pos) => set({ animatedMarker: pos }),
  clearAnimation: () => set({ animatedRoute: [], animatedMarker: null }),

  // Check if a position update should trigger a low-battery alert
  checkBatteryAlert: (position) => {
    const { batteryAlerted, devices } = get()
    const battery = position?.attributes?.batteryLevel ?? null
    if (battery === null) return
    const deviceId = position.deviceId
    if (battery <= 20 && !batteryAlerted.has(deviceId)) {
      const device = devices.find((d) => d.id === deviceId)
      if (device) {
        get().pushAlert({ type: 'lowBattery', deviceName: device.name, battery, ts: Date.now() })
        const next = new Set(batteryAlerted)
        next.add(deviceId)
        set({ batteryAlerted: next })
      }
    } else if (battery > 20 && batteryAlerted.has(deviceId)) {
      // Reset so it will alert again when battery drops next time
      const next = new Set(batteryAlerted)
      next.delete(deviceId)
      set({ batteryAlerted: next })
    }
  },

  // Handle incoming WS events (geofenceEnter, geofenceExit, deviceOverspeed, etc.)
  handleWsEvent: (event) => {
    const { type, deviceId, geofenceId, attributes } = event
    const { devices, geofences } = get()
    const device = devices.find((d) => d.id === deviceId)

    if (type === 'geofenceEnter' || type === 'geofenceExit') {
      const geofence = geofences.find((g) => g.id === geofenceId)
      if (!device || !geofence) return
      get().pushAlert({ type, deviceName: device.name, geofenceName: geofence.name, ts: Date.now() })
      if (type === 'geofenceEnter') {
        set((s) => ({
          geofenceArrivals: {
            ...s.geofenceArrivals,
            [deviceId]: { ...(s.geofenceArrivals[deviceId] ?? {}), [geofenceId]: Date.now() },
          },
        }))
      } else {
        set((s) => {
          const next = { ...(s.geofenceArrivals[deviceId] ?? {}) }
          delete next[geofenceId]
          return { geofenceArrivals: { ...s.geofenceArrivals, [deviceId]: next } }
        })
      }
    } else if (type === 'deviceOverspeed') {
      if (!device) return
      const speedKmh = Math.round((attributes?.speed ?? 0) * 1.852)
      get().pushAlert({ type, deviceName: device.name, speedKmh, ts: Date.now() })
    } else if (type === 'alarm') {
      if (!device) return
      const alarmType = attributes?.alarm ?? 'general'
      get().pushAlert({ type: 'alarm', deviceName: device.name, alarmType, ts: Date.now() })
    }
  },

  // Derived helpers
  getDevicePosition: (deviceId) => get().positions[deviceId] ?? null,

  getDeviceName: (deviceId) => {
    const d = get().devices.find((d) => d.id === deviceId)
    return d?.name ?? `Device ${deviceId}`
  },

  getGeofencePresence: () => {
    const { devices, positions, geofences } = get()
    const presence = {}
    for (const gf of geofences) presence[gf.id] = []
    for (const device of devices) {
      const pos = positions[device.id]
      if (pos?.geofenceIds) {
        for (const gfId of pos.geofenceIds) {
          if (presence[gfId] !== undefined) presence[gfId].push(device.name)
        }
      }
    }
    return presence
  },
}))

export default useTraccarStore
