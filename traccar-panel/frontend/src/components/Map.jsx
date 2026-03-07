import React, { useEffect, useRef, useMemo } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import useTraccarStore from '../store/useTraccarStore.js'
import DeviceMarker from './DeviceMarker.jsx'
import GeofenceLayer from './GeofenceLayer.jsx'
import { HistoryOverlay } from './HistoryPlayer.jsx'

const TILES = {
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
    label: 'Street',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; <a href="https://www.esri.com">Esri</a>',
    maxZoom: 19,
    label: 'Satellite',
  },
  cartoLight: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com">CARTO</a>',
    maxZoom: 19,
    label: 'Light',
  },
  cartoDark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com">CARTO</a>',
    maxZoom: 19,
    label: 'Dark',
  },
}

function MapRefCapture({ mapRef }) {
  const map = useMap()
  mapRef.current = map
  return null
}

/**
 * Auto-fits all devices on first load, then pans smoothly to follow
 * the selected device whenever its position updates via WebSocket.
 */
function MapFollower() {
  const map = useMap()
  const devices = useTraccarStore((s) => s.devices)
  const positions = useTraccarStore((s) => s.positions)
  const selectedDeviceId = useTraccarStore((s) => s.selectedDeviceId)
  const selectedPos = useTraccarStore((s) =>
    s.selectedDeviceId ? s.positions[s.selectedDeviceId] : null
  )

  const initialFitDone = useRef(false)
  const prevSelectedId = useRef(null)
  const prevLatLon = useRef(null)

  // Initial fit: once positions have loaded, fit all devices on screen
  useEffect(() => {
    if (initialFitDone.current || devices.length === 0) return
    const pts = devices
      .map((d) => positions[d.id])
      .filter(Boolean)
      .map((p) => [p.latitude, p.longitude])
    if (pts.length === 0) return
    map.fitBounds(pts, { padding: [50, 50], maxZoom: 14 })
    initialFitDone.current = true
  }, [positions, devices, map])

  // Live follow: pan smoothly when selected device position changes
  useEffect(() => {
    if (!selectedDeviceId || !selectedPos) {
      prevSelectedId.current = null
      prevLatLon.current = null
      return
    }
    const { latitude, longitude } = selectedPos
    // Device just changed — flyTo already handled by sidebar
    if (selectedDeviceId !== prevSelectedId.current) {
      prevSelectedId.current = selectedDeviceId
      prevLatLon.current = [latitude, longitude]
      return
    }
    const prev = prevLatLon.current
    if (prev && prev[0] === latitude && prev[1] === longitude) return
    prevLatLon.current = [latitude, longitude]
    map.panTo([latitude, longitude], { animate: true, duration: 1 })
  }, [selectedDeviceId, selectedPos, map])

  return null
}

// Fit all visible device markers into the viewport
function FitAllControl({ positions, devices }) {
  const map = useMap()

  function handleFitAll() {
    const pts = devices
      .map((d) => positions[d.id])
      .filter(Boolean)
      .map((p) => [p.latitude, p.longitude])
    if (pts.length === 0) return
    map.fitBounds(pts, { padding: [40, 40], maxZoom: 15 })
  }

  return (
    <div className="leaflet-top leaflet-left" style={{ marginTop: '80px' }}>
      <div className="leaflet-control">
        <button
          onClick={handleFitAll}
          title="Fit all devices"
          className="w-10 h-10 rounded-full shadow-lg bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm
                     flex items-center justify-center text-gray-600 dark:text-gray-300
                     hover:bg-white dark:hover:bg-gray-700 transition-colors border border-gray-200/50 dark:border-gray-600/50"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
          </svg>
        </button>
      </div>
    </div>
  )
}

// Pill-style segmented tile switcher
function TileSwitcher({ mapTile, setMapTile }) {
  return (
    <div className="absolute bottom-6 left-3 z-[1000]">
      <div className="flex bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-full shadow-lg p-0.5 border border-gray-200/50 dark:border-gray-600/50">
        {Object.entries(TILES).map(([key, t]) => (
          <button
            key={key}
            onClick={() => setMapTile(key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-200 ${
              mapTile === key
                ? 'bg-brand-500 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function Map({ mapRef }) {
  const devices = useTraccarStore((s) => s.devices)
  const positions = useTraccarStore((s) => s.positions)
  const geofences = useTraccarStore((s) => s.geofences)

  // Memoised so a new object is only created when devices/positions/geofences change.
  const presence = useMemo(() => {
    const result = {}
    for (const gf of geofences) result[gf.id] = []
    for (const device of devices) {
      const pos = positions[device.id]
      if (pos?.geofenceIds) {
        for (const gfId of pos.geofenceIds) {
          if (result[gfId] !== undefined) result[gfId].push(device.name)
        }
      }
    }
    return result
  }, [geofences, devices, positions])
  const mapTile = useTraccarStore((s) => s.mapTile)
  const setMapTile = useTraccarStore((s) => s.setMapTile)
  const { openDeviceProfile } = useTraccarStore()

  const tile = TILES[mapTile] ?? TILES.osm

  return (
    <div className="relative h-full w-full">
      <MapContainer center={[48.8566, 2.3522]} zoom={5} className="h-full w-full" zoomControl>
        <MapRefCapture mapRef={mapRef} />
        <MapFollower />
        <TileLayer url={tile.url} attribution={tile.attribution} maxZoom={tile.maxZoom} />
        <GeofenceLayer geofences={geofences} presence={presence} />
        {/* Cluster nearby device markers; expand at zoom 14+ so followed devices always show */}
        <MarkerClusterGroup chunkedLoading disableClusteringAtZoom={14}>
          {devices.map((device) => (
            <DeviceMarker
              key={device.id}
              device={device}
              position={positions[device.id]}
              onClick={openDeviceProfile}
            />
          ))}
        </MarkerClusterGroup>
        <HistoryOverlay />
        <FitAllControl positions={positions} devices={devices} />
      </MapContainer>

      <TileSwitcher mapTile={mapTile} setMapTile={setMapTile} />
    </div>
  )
}
