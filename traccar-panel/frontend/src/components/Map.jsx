import React, { useRef } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import useTraccarStore from '../store/useTraccarStore.js'
import DeviceMarker from './DeviceMarker.jsx'
import GeofenceLayer from './GeofenceLayer.jsx'
import { HistoryOverlay } from './HistoryPlayer.jsx'

// Exposes the Leaflet map instance to the parent via a ref
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
  const { setSelectedDevice } = useTraccarStore()

  // Default center: Europe; will fly to device on selection
  const defaultCenter = [48.8566, 2.3522]

  return (
    <MapContainer
      center={defaultCenter}
      zoom={5}
      className="h-full w-full"
      zoomControl={true}
    >
      <MapRefCapture mapRef={mapRef} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
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
  )
}
