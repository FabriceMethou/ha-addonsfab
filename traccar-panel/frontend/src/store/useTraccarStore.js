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

  // Alerts (geofence enter/exit from WS events)
  alerts: [], // [{id, type, deviceName, geofenceName, ts}]

  // Trip replay state (written by HistoryControls, read by HistoryOverlay inside MapContainer)
  animatedRoute: [],          // GPS points array currently loaded
  animatedMarker: null,       // {lat, lon} current animation position

  // Connection state
  connected: false,
  loading: true,
  error: null,

  // Actions
  setDevices: (devices) => set({ devices }),

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

  // Handle incoming WS events (geofenceEnter, geofenceExit, etc.)
  handleWsEvent: (event) => {
    const { type, deviceId, geofenceId } = event
    if (type !== 'geofenceEnter' && type !== 'geofenceExit') return
    const { devices, geofences } = get()
    const device = devices.find((d) => d.id === deviceId)
    const geofence = geofences.find((g) => g.id === geofenceId)
    if (!device || !geofence) return
    get().pushAlert({
      type,
      deviceName: device.name,
      geofenceName: geofence.name,
      ts: Date.now(),
    })
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
