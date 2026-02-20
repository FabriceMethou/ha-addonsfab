import React from 'react'
import { Circle, Polygon, Tooltip } from 'react-leaflet'
import { parseTraccarArea } from '../utils/parseTraccarArea.js'

export default function GeofenceLayer({ geofences, presence }) {
  return (
    <>
      {geofences.map((gf) => {
        const parsed = parseTraccarArea(gf.area)
        if (!parsed) return null

        const occupied = presence?.[gf.id]?.length > 0
        const color = occupied ? '#22C55E' : '#9CA3AF'
        const fillOpacity = occupied ? 0.15 : 0.08

        if (parsed.type === 'circle') {
          return (
            <Circle
              key={gf.id}
              center={[parsed.lat, parsed.lon]}
              radius={parsed.radius}
              pathOptions={{ color, fillColor: color, fillOpacity, weight: 2 }}
            >
              <Tooltip>{gf.name}</Tooltip>
            </Circle>
          )
        }

        if (parsed.type === 'polygon') {
          return (
            <Polygon
              key={gf.id}
              positions={parsed.coords}
              pathOptions={{ color, fillColor: color, fillOpacity, weight: 2 }}
            >
              <Tooltip>{gf.name}</Tooltip>
            </Polygon>
          )
        }

        return null
      })}
    </>
  )
}
