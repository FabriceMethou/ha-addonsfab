import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Polyline, Marker } from 'react-leaflet'
import { format, subDays } from 'date-fns'
import useTraccarStore from '../store/useTraccarStore.js'
import { createAnimation } from '../utils/tripAnimation.js'
import { routeDistanceKm } from '../utils/haversine.js'

const KNOTS_TO_KMH = 1.852
const SPEED_MULTIPLIERS = [1, 5, 10, 30]
const MAX_POINTS = 10000

function formatMs(ms) {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatDist(metres) {
  if (metres >= 1000) return `${(metres / 1000).toFixed(1)} km`
  return `${Math.round(metres)} m`
}

function formatDuration(ms) {
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

/**
 * Life360-style member profile view.
 * Shows the last 30 days of trips for a device.
 * Tapping a trip fetches its GPS route and shows it on the map with playback controls.
 */
export default function DeviceTripsView({ device, onBack, mapRef }) {
  const { setAnimatedRoute, setAnimatedMarker, clearAnimation } = useTraccarStore()

  // Trips list
  const [trips, setTrips] = useState([])
  const [tripsLoading, setTripsLoading] = useState(true)
  const [tripsError, setTripsError] = useState(null)
  const [selectedTripStart, setSelectedTripStart] = useState(null)
  const [tripInfo, setTripInfo] = useState(null)

  // Route playback
  const [playbackStatus, setPlaybackStatus] = useState('idle') // 'idle'|'loading'|'paused'|'playing'
  const [speed, setSpeed] = useState(1)
  const [progress, setProgress] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [stats, setStats] = useState(null)
  const [hasRoute, setHasRoute] = useState(false)
  const [routeError, setRouteError] = useState(null)

  const animRef = useRef(null)
  const abortRef = useRef(null)

  // Load trips for the last 30 days, newest first
  useEffect(() => {
    let cancelled = false
    setTripsLoading(true)
    setTripsError(null)

    const from = subDays(new Date(), 30).toISOString()
    const to = new Date().toISOString()

    fetch(
      `./api/reports/trips?deviceId=${device.id}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    )
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => {
        if (!cancelled) {
          const list = Array.isArray(data) ? data : []
          setTrips([...list].reverse()) // newest first
        }
      })
      .catch((err) => { if (!cancelled) setTripsError(err.message) })
      .finally(() => { if (!cancelled) setTripsLoading(false) })

    return () => { cancelled = true }
  }, [device.id])

  // Abort in-flight requests and destroy animation on unmount.
  // Do NOT call clearAnimation() here so the route stays on the map when
  // switching to other tabs and coming back.
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      animRef.current?.destroy()
    }
  }, []) // eslint-disable-line

  const onUpdate = useCallback(
    ({ lat, lon, progress: prog }) => {
      setAnimatedMarker({ lat, lon })
      setProgress(prog)
      if (animRef.current) setElapsed(Math.round(prog * animRef.current.totalDurationMs))
    },
    [setAnimatedMarker]
  )

  async function loadRoute(fromISO, toISO, prefetchedStats = null) {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    animRef.current?.destroy()
    animRef.current = null
    clearAnimation()
    setHasRoute(false)
    setPlaybackStatus('loading')
    setRouteError(null)
    setProgress(0)
    setElapsed(0)
    setStats(prefetchedStats)

    try {
      const res = await fetch(
        `./api/reports/route?deviceId=${device.id}&from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`,
        { signal: controller.signal }
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const rawData = await res.json()

      if (!Array.isArray(rawData) || rawData.length === 0) {
        setRouteError('No GPS data for this trip.')
        setPlaybackStatus('idle')
        return
      }

      let data = rawData
      if (rawData.length > MAX_POINTS) {
        const step = Math.ceil(rawData.length / MAX_POINTS)
        data = rawData.filter((_, i) => i % step === 0)
        if (data[data.length - 1] !== rawData[rawData.length - 1]) {
          data.push(rawData[rawData.length - 1])
        }
      }

      setAnimatedRoute(data)

      const dist = routeDistanceKm(data)
      const durMs =
        new Date(data[data.length - 1].fixTime).getTime() -
        new Date(data[0].fixTime).getTime()
      const maxSpd = Math.max(...data.map((p) => (p.speed ?? 0) * KNOTS_TO_KMH))
      const avgSpd = isFinite(dist) && durMs > 0 ? dist / (durMs / 3_600_000) : 0
      setStats({ dist, durMs, maxSpd, avgSpd })

      const anim = createAnimation(data, onUpdate)
      animRef.current = anim
      setHasRoute(true)
      if (mapRef?.current) mapRef.current.flyTo([data[0].latitude, data[0].longitude], 13)
      setPlaybackStatus('paused')
    } catch (err) {
      if (err.name === 'AbortError') return
      setRouteError(err.message)
      setPlaybackStatus('idle')
    }
  }

  function handleSelectTrip(trip) {
    setSelectedTripStart(trip.startTime)
    setTripInfo({
      startAddress: trip.startAddress ?? null,
      endAddress: trip.endAddress ?? null,
    })
    loadRoute(trip.startTime, trip.endTime, {
      dist: (trip.distance ?? 0) / 1000,
      durMs: trip.duration ?? 0,
      maxSpd: (trip.maxSpeed ?? 0) * KNOTS_TO_KMH,
      avgSpd: (trip.averageSpeed ?? 0) * KNOTS_TO_KMH,
    })
  }

  function handlePlay() {
    animRef.current?.play(speed)
    setPlaybackStatus('playing')
  }

  function handlePause() {
    animRef.current?.pause()
    setPlaybackStatus('paused')
  }

  function handleStop() {
    animRef.current?.stop()
    setPlaybackStatus('paused')
    setProgress(0)
    setElapsed(0)
    setAnimatedMarker(null)
  }

  function handleSpeedChange(s) {
    setSpeed(s)
    if (playbackStatus === 'playing') {
      animRef.current?.pause()
      animRef.current?.play(s)
    }
  }

  function handleSeek(e) {
    const frac = parseFloat(e.target.value)
    animRef.current?.seek(frac)
    setProgress(frac)
    if (animRef.current) setElapsed(Math.round(frac * animRef.current.totalDurationMs))
  }

  return (
    <div className="flex flex-col h-full">
      {/* Profile header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <button
          onClick={() => { onBack(); clearAnimation() }}
          className="text-blue-500 hover:text-blue-600 dark:text-blue-400 text-sm font-medium flex items-center gap-1"
        >
          ← All
        </button>
        <span className="font-semibold text-sm dark:text-white truncate">{device.name}</span>
      </div>

      {/* Section label */}
      <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 px-3 pt-2 pb-1 uppercase tracking-wider flex-shrink-0">
        Trips — last 30 days
      </p>

      {/* Loading / error / empty */}
      {tripsLoading && (
        <p className="text-xs text-gray-400 dark:text-gray-500 px-3 py-2">Loading trips...</p>
      )}
      {tripsError && (
        <p className="text-xs text-red-500 px-3 py-2">{tripsError}</p>
      )}
      {!tripsLoading && !tripsError && trips.length === 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500 px-3 py-2">
          No trips in the last 30 days.
        </p>
      )}

      {/* Trip list */}
      <div className="overflow-y-auto flex-1">
        {trips.map((trip, i) => {
          const start = new Date(trip.startTime)
          const end = new Date(trip.endTime)
          const distM = trip.distance ?? 0
          const durMs = trip.duration ?? 0
          const maxKmh = Math.round((trip.maxSpeed ?? 0) * KNOTS_TO_KMH)
          const isSelected = selectedTripStart === trip.startTime

          return (
            <button
              key={i}
              onClick={() => handleSelectTrip(trip)}
              className={`w-full text-left px-3 py-2.5 border-b border-gray-100 dark:border-gray-700 transition-colors ${
                isSelected
                  ? 'bg-blue-50 dark:bg-blue-900/40 border-l-2 border-l-blue-500'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {/* Date + distance */}
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs font-semibold dark:text-white">
                  {format(start, 'EEE d MMM')}
                </span>
                <span className="text-xs text-blue-500 font-semibold">{formatDist(distM)}</span>
              </div>

              {/* Departure → Arrival + duration + max speed */}
              <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                <span className="text-green-500 text-[10px]">▲</span>
                <span>{format(start, 'HH:mm')}</span>
                <span>→</span>
                <span className="text-red-500 text-[10px]">▼</span>
                <span>{format(end, 'HH:mm')}</span>
                <span className="mx-0.5">·</span>
                <span>{formatDuration(durMs)}</span>
                {maxKmh > 0 && (
                  <>
                    <span className="mx-0.5">·</span>
                    <span>Max {maxKmh} km/h</span>
                  </>
                )}
              </div>

              {/* Addresses */}
              {(trip.startAddress || trip.endAddress) && (
                <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
                  {trip.startAddress ?? ''}
                  {trip.endAddress ? ` → ${trip.endAddress}` : ''}
                </p>
              )}
            </button>
          )
        })}
      </div>

      {/* Route loading / error */}
      {playbackStatus === 'loading' && (
        <p className="text-xs text-gray-400 dark:text-gray-500 px-3 py-1 flex-shrink-0">
          Loading route...
        </p>
      )}
      {routeError && (
        <p className="text-xs text-red-500 px-3 py-1 flex-shrink-0">{routeError}</p>
      )}

      {/* Trip address summary */}
      {hasRoute && tripInfo && (tripInfo.startAddress || tripInfo.endAddress) && (
        <div className="px-3 py-1.5 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            <span className="text-green-600 dark:text-green-400">▲</span>{' '}
            {tripInfo.startAddress ?? '—'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            <span className="text-red-500 dark:text-red-400">▼</span>{' '}
            {tripInfo.endAddress ?? '—'}
          </p>
        </div>
      )}

      {/* Playback controls */}
      {hasRoute && (
        <div className="px-3 py-2 space-y-2 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex gap-1 items-center">
            <button
              onClick={playbackStatus === 'playing' ? handlePause : handlePlay}
              className="px-3 py-1 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded"
            >
              {playbackStatus === 'playing' ? '⏸' : '▶'}
            </button>
            <button
              onClick={handleStop}
              className="px-3 py-1 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded"
            >
              ⏹
            </button>
            <button
              onClick={() => {
                animRef.current?.stop()
                setProgress(0)
                setElapsed(0)
                setAnimatedMarker(null)
                animRef.current?.play(speed)
                setPlaybackStatus('playing')
              }}
              title="Replay from start"
              className="px-3 py-1 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded"
            >
              ↺
            </button>
            <div className="flex gap-1 ml-auto">
              {SPEED_MULTIPLIERS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSpeedChange(s)}
                  className={`px-2 py-0.5 text-xs rounded ${
                    speed === s
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>

          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={progress}
            onChange={handleSeek}
            className="w-full"
          />

          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>{formatMs(elapsed)}</span>
            <span>{stats ? formatMs(stats.durMs) : '--'}</span>
          </div>

          {stats && (
            <div className="text-xs text-gray-500 dark:text-gray-400 flex gap-3 flex-wrap">
              <span>{stats.dist.toFixed(1)} km</span>
              <span>Max {isFinite(stats.maxSpd) ? Math.round(stats.maxSpd) : 0} km/h</span>
              <span>Avg {isFinite(stats.avgSpd) ? Math.round(stats.avgSpd) : 0} km/h</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
