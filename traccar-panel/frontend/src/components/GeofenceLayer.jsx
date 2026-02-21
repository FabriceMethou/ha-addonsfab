import React from 'react'
import { Circle, Polygon, Polyline, Tooltip } from 'react-leaflet'
import { parseTraccarArea } from '../utils/parseTraccarArea.js'

export default function GeofenceLayer({ geofences, presence }) {
  return (
    <>
      {geofences.map((gf) => {
        const parsed = parseTraccarArea(gf.area)
        if (!parsed) return null

        const occupied = presence?.[gf.id]?.length > 0
        const color = occupied ? '#22C55E' : '#6B7280'
        const fillColor = occupied ? '#22C55E' : '#9CA3AF'
        const fillOpacity = occupied ? 0.2 : 0.1
        const weight = occupied ? 2.5 : 1.5

        // Occupied geofences get a permanent label visible on the map;
        // empty geofences just show a hover tooltip to avoid clutter.
        const tooltip = (
          <Tooltip permanent={occupied} sticky={!occupied} direction="center">
            <strong>{gf.name}</strong>
            {occupied && (
              <div style={{ color: '#16a34a', fontSize: '11px' }}>{presence[gf.id].join(', ')}</div>
            )}
          </Tooltip>
        )

        if (parsed.type === 'circle') {
          return (
            <Circle
              key={gf.id}
              center={[parsed.lat, parsed.lon]}
              radius={parsed.radius}
              pathOptions={{ color, fillColor, fillOpacity, weight }}
            >
              {tooltip}
            </Circle>
          )
        }

        if (parsed.type === 'polygon') {
          return (
            <Polygon
              key={gf.id}
              positions={parsed.coords}
              pathOptions={{ color, fillColor, fillOpacity, weight }}
            >
              {tooltip}
            </Polygon>
          )
        }

        if (parsed.type === 'linestring') {
          return (
            <Polyline
              key={gf.id}
              positions={parsed.coords}
              pathOptions={{ color, weight: 3, dashArray: '6 4' }}
            >
              {tooltip}
            </Polyline>
          )
        }

        return null
      })}
    </>
  )
}
