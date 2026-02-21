import React from 'react'
import { Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import { formatDistanceToNow } from 'date-fns'
import useTraccarStore from '../store/useTraccarStore.js'

// Deterministic color per device
const COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16']

function colorForDevice(deviceId) {
  return COLORS[Math.abs(deviceId) % COLORS.length]
}

function makeDotIcon(color, initials, course, speedKmh) {
  const showArrow = speedKmh > 2
  const arrow = showArrow
    ? `<g transform="rotate(${course}, 20, 20)"><polygon points="20,2 16,10 24,10" fill="${color}" stroke="white" stroke-width="1.5"/></g>`
    : ''
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="52" viewBox="0 0 40 52">
      ${arrow}
      <circle cx="20" cy="20" r="16" fill="${color}" stroke="white" stroke-width="2"/>
      <text x="20" y="25" text-anchor="middle" fill="white" font-size="11" font-family="sans-serif" font-weight="bold">${initials}</text>
      <polygon points="14,34 26,34 20,50" fill="${color}"/>
    </svg>
  `
  return L.divIcon({
    html: svg,
    iconSize: [40, 52],
    iconAnchor: [20, 50],
    popupAnchor: [0, -52],
    className: '',
  })
}

export default function DeviceMarker({ device, position, onClick }) {
  const geofences = useTraccarStore((s) => s.geofences)

  if (!position) return null

  const { latitude, longitude, speed, course, attributes, address, fixTime, geofenceIds } = position
  const color = colorForDevice(device.id)
  const initials = device.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

  const speedKmh = Math.round((speed ?? 0) * 1.852) // knots → km/h
  const icon = makeDotIcon(color, initials, course ?? 0, speedKmh)

  const battery = attributes?.batteryLevel ?? null
  const lastSeen = fixTime ? formatDistanceToNow(new Date(fixTime), { addSuffix: true }) : 'unknown'
  const currentPlaces = (geofenceIds ?? [])
    .map((id) => geofences.find((g) => g.id === id)?.name)
    .filter(Boolean)

  return (
    <Marker
      position={[latitude, longitude]}
      icon={icon}
      eventHandlers={{ click: () => onClick?.(device.id) }}
    >
      <Popup>
        <div className="min-w-[160px]">
          <p className="font-bold text-base mb-1">{device.name}</p>
          {currentPlaces.length > 0 && (
            <p className="text-xs text-blue-600 font-medium mb-1">At {currentPlaces.join(', ')}</p>
          )}
          {address && <p className="text-xs text-gray-500 mb-1">{address}</p>}
          <p className="text-sm">Speed: {speedKmh} km/h</p>
          {battery !== null && <p className="text-sm">Battery: {battery}%</p>}
          <p className="text-xs text-gray-400 mt-1">Last seen {lastSeen}</p>
        </div>
      </Popup>
    </Marker>
  )
}
