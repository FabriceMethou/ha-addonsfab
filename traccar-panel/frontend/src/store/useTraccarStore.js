import { create } from 'zustand'

const useTraccarStore = create((set, get) => ({
  // Data
  devices: [],       // [{id, name, status, lastUpdate, ...}]
  positions: {},     // deviceId -> {latitude, longitude, speed, course, address, geofenceIds, ...}
  geofences: [],     // [{id, name, area, ...}]

  // UI state
  selectedDeviceId: null,
  activeTab: 'live', // 'live' | 'places' | 'history'
  darkMode: localStorage.getItem('darkMode') === 'true',

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

  // Derived helpers
  getDevicePosition: (deviceId) => get().positions[deviceId] ?? null,

  getDeviceName: (deviceId) => {
    const d = get().devices.find((d) => d.id === deviceId)
    return d?.name ?? `Device ${deviceId}`
  },

  getGeofencePresence: () => {
    const { devices, positions, geofences } = get()
    const presence = {}
    for (const gf of geofences) {
      presence[gf.id] = []
    }
    for (const device of devices) {
      const pos = positions[device.id]
      if (pos?.geofenceIds) {
        for (const gfId of pos.geofenceIds) {
          if (presence[gfId] !== undefined) {
            presence[gfId].push(device.name)
          }
        }
      }
    }
    return presence
  },
}))

export default useTraccarStore
