import React from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import useTraccarStore from '../store/useTraccarStore.js'
import DeviceMarker from './DeviceMarker.jsx'
import GeofenceLayer from './GeofenceLayer.jsx'
import { HistoryOverlay } from './HistoryPlayer.jsx'

const TILES = {
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; <a href="https://www.esri.com">Esri</a>',
    maxZoom: 19,
  },
}

function MapRefCapture({ mapRef }) {
  const map = useMap()
  mapRef.current = map
  return null
}

export default function Map({ mapRef, historyOverlayRef }) {
  const devices = useTraccarStore((s) => s.devices)
  const positions = useTraccarStore((s) => s.positions)
  const geofences = useTraccarStore((s) => s.geofences)
  const presence = useTraccarStore((s) => s.getGeofencePresence())
  const mapTile = useTraccarStore((s) => s.mapTile)
  const setMapTile = useTraccarStore((s) => s.setMapTile)
  const { setSelectedDevice } = useTraccarStore()

  const tile = TILES[mapTile] ?? TILES.osm

  return (
    <div className="relative h-full w-full">
      <MapContainer center={[48.8566, 2.3522]} zoom={5} className="h-full w-full" zoomControl>
        <MapRefCapture mapRef={mapRef} />
        <TileLayer url={tile.url} attribution={tile.attribution} maxZoom={tile.maxZoom} />
        <GeofenceLayer geofences={geofences} presence={presence} />
        {devices.map((device) => (
          <DeviceMarker
            key={device.id}
            device={device}
            position={positions[device.id]}
            onClick={setSelectedDevice}
          />
        ))}
        <HistoryOverlay overlayRef={historyOverlayRef} />
      </MapContainer>

      {/* Tile switcher overlay */}
      <div className="absolute bottom-6 left-3 z-[1000] flex gap-1">
        <button
          onClick={() => setMapTile('osm')}
          className={`px-2 py-1 text-xs rounded shadow ${
            mapTile === 'osm'
              ? 'bg-blue-500 text-white'
              : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600'
          }`}
        >
          Map
        </button>
        <button
          onClick={() => setMapTile('satellite')}
          className={`px-2 py-1 text-xs rounded shadow ${
            mapTile === 'satellite'
              ? 'bg-blue-500 text-white'
              : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600'
          }`}
        >
          Satellite
        </button>
      </div>
    </div>
  )
}
