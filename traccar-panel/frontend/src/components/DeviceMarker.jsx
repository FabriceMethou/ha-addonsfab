import React from 'react'
import { Marker, Popup, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import { formatDistanceToNow } from 'date-fns'
import useTraccarStore from '../store/useTraccarStore.js'

// Deterministic color per device
const COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16']

function colorForDevice(deviceId) {
  return COLORS[Math.abs(deviceId) % COLORS.length]
}

function makeDotIcon(color, initials, course, speedKmh, isOnline) {
  const showArrow = speedKmh > 2
  const arrow = showArrow
    ? `<g transform="rotate(${course}, 20, 20)"><polygon points="20,2 16,10 24,10" fill="${color}" stroke="white" stroke-width="1.5"/></g>`
    : ''
  // Offline devices get 50% opacity so they stand out as inactive
  const opacity = isOnline ? 1 : 0.45
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="52" viewBox="0 0 40 52" opacity="${opacity}">
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
  const selectedDeviceId = useTraccarStore((s) => s.selectedDeviceId)
  const isSelected = selectedDeviceId === device.id

  if (!position) return null

  const { latitude, longitude, speed, course, attributes, address, fixTime, geofenceIds } = position
  const color = colorForDevice(device.id)
  const initials = device.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

  const isOnline = device.status === 'online'
  const speedKmh = Math.round((speed ?? 0) * 1.852)
  const icon = makeDotIcon(color, initials, course ?? 0, speedKmh, isOnline)

  const battery = attributes?.batteryLevel ?? null
  const ignition = attributes?.ignition ?? null
  const satellites = attributes?.sat ?? null
  const lastSeen = fixTime ? formatDistanceToNow(new Date(fixTime), { addSuffix: true }) : 'unknown'
  const currentPlaces = (geofenceIds ?? [])
    .map((id) => geofences.find((g) => g.id === id)?.name)
    .filter(Boolean)

  // Compass bearing label
  function courseLabel(deg) {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
    return dirs[Math.round(deg / 45) % 8]
  }

  return (
    <Marker
      position={[latitude, longitude]}
      icon={icon}
      eventHandlers={{ click: () => onClick?.(device.id) }}
    >
      {/* Name label: always visible for selected device, hover-only for others */}
      <Tooltip permanent={isSelected} direction="top" offset={[0, -52]}>
        <span style={{ fontWeight: isSelected ? 700 : 500, fontSize: '12px' }}>{device.name}</span>
      </Tooltip>
      <Popup>
        <div className="min-w-[170px] space-y-0.5">
          <p className="font-bold text-base">{device.name}</p>

          {/* Status row */}
          <p className={`text-xs font-medium ${isOnline ? 'text-green-600' : 'text-gray-400'}`}>
            {isOnline ? (ignition === true ? 'Ignition on' : 'Online') : 'Offline'}
          </p>

          {currentPlaces.length > 0 && (
            <p className="text-xs text-blue-600 font-medium">At {currentPlaces.join(', ')}</p>
          )}
          {address && <p className="text-xs text-gray-500">{address}</p>}

          <div className="pt-1 space-y-0.5 text-sm">
            <p>Speed: {speedKmh} km/h</p>
            {speedKmh > 2 && course != null && (
              <p className="text-xs text-gray-500">
                Heading {Math.round(course)}° ({courseLabel(course)})
              </p>
            )}
            {battery !== null && <p>Battery: {battery}%</p>}
            {satellites !== null && (
              <p className="text-xs text-gray-500">{satellites} satellites</p>
            )}
          </div>
          <p className="text-xs text-gray-400 pt-1">Last seen {lastSeen}</p>
        </div>
      </Popup>
    </Marker>
  )
}
