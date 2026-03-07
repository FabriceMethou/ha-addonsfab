import React, { useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import useTraccarStore from "../store/useTraccarStore.js";
import { parseTraccarArea, areaCenter } from "../utils/parseTraccarArea.js";
import { haversineMetres } from "../utils/haversine.js";
import { useTick } from "../hooks/useTick.js";

// Must match DeviceMarker's palette so the avatar color is consistent
const COLORS = [
  "#8652FF",
  "#EF4444",
  "#10B981",
  "#F59E0B",
  "#EC4899",
  "#06B6D4",
  "#84CC16",
  "#F97316",
];
function colorForDevice(id) {
  return COLORS[Math.abs(id) % COLORS.length];
}

// Smart place icon based on common geofence name keywords
function placeIcon(name) {
  if (/home|huis|maison|casa|thuis/i.test(name)) return "🏠";
  if (/work|bureau|kantoor|office|job|werk/i.test(name)) return "💼";
  if (/school|college|university|universit|klas/i.test(name)) return "🎓";
  if (/gym|sport|fitness|pool|zwembad/i.test(name)) return "🏋️";
  if (/shop|market|store|winkel|supermark|grocery/i.test(name)) return "🛒";
  return "📍";
}

function formatDistance(metres) {
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

// Inline SVG battery icon with fill proportional to charge level
function BatteryBar({ level, charging }) {
  const fillColor = level > 40 ? "#22C55E" : level > 20 ? "#F59E0B" : "#EF4444";
  const textColor =
    level > 40
      ? "text-green-600 dark:text-green-400"
      : level > 20
        ? "text-yellow-500 dark:text-yellow-400"
        : "text-red-500";
  const fillW = Math.round((13 * level) / 100);
  return (
    <span
      className={`flex items-center gap-1 text-xs font-medium ${textColor}`}
    >
      {charging && (
        <span className="text-yellow-400" title="Charging">
          ⚡
        </span>
      )}
      <svg width="20" height="11" viewBox="0 0 20 11" fill="none">
        <rect
          x="0.5"
          y="0.5"
          width="16"
          height="10"
          rx="2"
          stroke="currentColor"
          strokeWidth="1"
        />
        <rect
          x="1.5"
          y="1.5"
          width={fillW}
          height="8"
          rx="1"
          fill={fillColor}
        />
        <rect
          x="17"
          y="3.5"
          width="2.5"
          height="4"
          rx="1"
          fill="currentColor"
        />
      </svg>
      {level}%
    </span>
  );
}

export default function DeviceCard({ device, isSelected, onClick }) {
  useTick(60000); // force re-render every 60s for dwell/offline durations
  const position = useTraccarStore((s) => s.positions[device.id]);
  const geofences = useTraccarStore((s) => s.geofences);
  const geofenceArrivals = useTraccarStore((s) => s.geofenceArrivals);
  const deviceOfflineSince = useTraccarStore((s) => s.deviceOfflineSince);
  const deviceStillSince = useTraccarStore((s) => s.deviceStillSince);
  const alerts = useTraccarStore((s) => s.alerts);
  const photo = useTraccarStore((s) => s.devicePhotos[device.id]);
  const isPaused = useTraccarStore((s) => s.pausedDevices.has(device.id));
  const togglePause = useTraccarStore((s) => s.togglePauseDevice);

  const color = colorForDevice(device.id);
  const initial = device.name[0]?.toUpperCase() ?? "?";
  const hasRecentAlert = alerts.some(
    (a) => a.deviceName === device.name && a.ts > Date.now() - 3600000,
  );

  const speedKmh = position ? Math.round((position.speed ?? 0) * 1.852) : 0;
  const battery = position?.attributes?.batteryLevel ?? null;
  const charging = position?.attributes?.charge ?? false;
  const ignition = position?.attributes?.ignition ?? null;
  const address = position?.address ?? null;
  const accuracy = position?.accuracy ?? null; // metres
  const satellites = position?.attributes?.sat ?? null;
  const hdop = position?.attributes?.hdop ?? null;

  // Staleness: minutes since last GPS fix
  const fixAge = position?.fixTime
    ? (Date.now() - new Date(position.fixTime).getTime()) / 60000
    : null;
  const lastSeen = position?.fixTime
    ? formatDistanceToNow(new Date(position.fixTime), { addSuffix: true })
    : "never";
  const lastSeenColor = !position
    ? "text-gray-400 dark:text-gray-500"
    : fixAge > 15
      ? "text-orange-500 dark:text-orange-400"
      : fixAge > 5
        ? "text-yellow-500 dark:text-yellow-400"
        : "text-gray-400 dark:text-gray-500";

  const isOnline = device.status === "online";

  // Low accuracy: cell-tower-level positioning (>150m) shown as approximate
  const isApproximate = accuracy !== null && accuracy > 150;
  // Weak GPS signal: fewer than 4 satellites or HDOP > 5
  const isWeakSignal =
    isOnline &&
    ((satellites !== null && satellites < 4) || (hdop !== null && hdop > 5));
  const isDriving = speedKmh > 5;
  const isIgnitionIdle = ignition === true && !isDriving; // engine on but not moving
  const isWalking = !isDriving && !isIgnitionIdle && speedKmh >= 0.5;

  // Geofences the device is currently inside — sorted smallest-first so the most
  // specific place (e.g. "Home" inside "Neighborhood") is always shown first.
  const geofenceIds = position?.geofenceIds ?? [];
  const currentPlaces = useMemo(() => {
    return geofenceIds
      .map((id) => geofences.find((g) => g.id === id))
      .filter(Boolean)
      .sort((a, b) => {
        const sizeOf = (gf) => {
          const p = parseTraccarArea(gf.area);
          if (!p) return Infinity;
          if (p.type === "circle") return p.radius;
          if (p.coords?.length > 0) {
            const lats = p.coords.map(([lat]) => lat);
            const lons = p.coords.map(([, lon]) => lon);
            return (
              (Math.max(...lats) -
                Math.min(...lats) +
                (Math.max(...lons) - Math.min(...lons))) *
              55500
            );
          }
          return Infinity;
        };
        return sizeOf(a) - sizeOf(b);
      })
      .map((g) => g.name);
  }, [geofenceIds, geofences]); // eslint-disable-line

  // Memoize home geofence center — geofences don't change at runtime so this
  // avoids re-parsing the WKT area string on every WebSocket position update.
  const { homeGfId, homeGfCenter } = useMemo(() => {
    const homeGf = geofences.find((g) => /home/i.test(g.name)) ?? null;
    if (!homeGf) return { homeGfId: null, homeGfCenter: null };
    const parsed = parseTraccarArea(homeGf.area);
    return { homeGfId: homeGf.id, homeGfCenter: areaCenter(parsed) };
  }, [geofences]);

  // Distance from the "Home" geofence when not currently at home
  const distFromHome = useMemo(() => {
    if (!position || !homeGfCenter || geofenceIds.includes(homeGfId))
      return null;
    return haversineMetres(
      position.latitude,
      position.longitude,
      homeGfCenter[0],
      homeGfCenter[1],
    );
  }, [position, homeGfCenter, homeGfId, geofenceIds]); // eslint-disable-line

  // Life360-style: icon + descriptive status text
  let statusIcon, statusText, statusColor;
  if (isPaused) {
    statusIcon = "⏸";
    statusText = "Location paused";
    statusColor = "text-orange-500 dark:text-orange-400";
  } else if (!isOnline) {
    statusIcon = "○";
    const offlineTs = deviceOfflineSince[device.id] ?? null;
    if (offlineTs) {
      const ms = Date.now() - offlineTs;
      const totalMin = Math.floor(ms / 60000);
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      statusText = `Offline · ${h > 0 ? `${h}h ${m}m` : `${m}m`}`;
    } else {
      statusText = "Offline";
    }
    statusColor = "text-gray-400 dark:text-gray-500";
  } else if (isDriving) {
    statusIcon = "🚗";
    statusText = `Driving · ${speedKmh} km/h`;
    statusColor = "text-brand-600 dark:text-brand-400";
  } else if (isIgnitionIdle) {
    statusIcon = "🚗";
    statusText = "In car · idle";
    statusColor = "text-amber-500 dark:text-amber-400";
  } else if (isWalking) {
    statusIcon = "🚶";
    statusText = "Walking";
    statusColor = "text-teal-600 dark:text-teal-400";
  } else if (currentPlaces.length > 0) {
    const placeName = currentPlaces[0];
    statusIcon = placeIcon(placeName);
    // Show dwell time "At Home · 2h 15m" when we have an arrival timestamp
    const placeGf = geofences.find((g) => g.name === placeName);
    const arrivalTs = placeGf
      ? (geofenceArrivals[device.id]?.[placeGf.id] ?? null)
      : null;
    let dwellText = "";
    if (arrivalTs) {
      const ms = Date.now() - arrivalTs;
      const totalMin = Math.floor(ms / 60000);
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      dwellText = ` · ${h > 0 ? `${h}h ${m}m` : `${m}m`}`;
    }
    statusText = `At ${placeName}${dwellText}${charging ? " · ⚡" : ""}`;
    statusColor = "text-green-600 dark:text-green-400";
  } else {
    statusIcon = "💤";
    // Show idle duration when stationary for >30 min outside any geofence
    const stillTs = deviceStillSince[device.id] ?? null;
    const stillMs = stillTs ? Date.now() - stillTs : 0;
    if (stillMs > 30 * 60000) {
      const totalMin = Math.floor(stillMs / 60000);
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      const durText = h > 0 ? `${h}h ${m}m` : `${m}m`;
      statusText = `Idle · ${durText}${charging ? " · ⚡" : ""}`;
    } else {
      statusText = charging ? "Still · ⚡" : "Still";
    }
    statusColor = "text-gray-500 dark:text-gray-400";
  }

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-xl mb-1.5 transition-colors ${
        isSelected
          ? "bg-brand-50 dark:bg-brand-900/40 ring-1 ring-brand-400"
          : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
      }`}
    >
      <div className="flex items-start gap-2.5">
        {/* Avatar: photo or initials with status rings */}
        <div className="relative flex-shrink-0 mt-0.5">
          {photo ? (
            <img
              src={photo}
              alt={device.name}
              className={`w-10 h-10 rounded-full object-cover shadow-sm transition-all ${
                !isOnline ? "opacity-50 grayscale" : ""
              } ${
                isOnline && fixAge > 15
                  ? "ring-2 ring-orange-400 dark:ring-orange-500 ring-offset-1"
                  : isOnline && isApproximate
                    ? "ring-2 ring-yellow-400 dark:ring-yellow-500 ring-offset-1"
                    : ""
              }`}
            />
          ) : (
            <div
              style={{ background: isOnline ? color : "#9CA3AF" }}
              className={`w-10 h-10 rounded-full flex items-center justify-center shadow-sm transition-all ${
                isOnline && fixAge > 15
                  ? "ring-2 ring-orange-400 dark:ring-orange-500 ring-offset-1"
                  : isOnline && isApproximate
                    ? "ring-2 ring-yellow-400 dark:ring-yellow-500 ring-offset-1"
                    : ""
              }`}
            >
              <span className="text-white font-bold text-base select-none">
                {initial}
              </span>
            </div>
          )}
          {hasRecentAlert && (
            <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-gray-800" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* Row 1: Name + last seen (color shifts orange/red when stale) */}
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-sm dark:text-white truncate">
              {device.name}
            </span>
            <span className={`text-xs flex-shrink-0 ${lastSeenColor}`}>
              {lastSeen}
            </span>
          </div>

          {/* Row 2: Status — hero element */}
          <p className={`text-sm font-medium mt-0.5 ${statusColor}`}>
            {statusIcon} {statusText}
          </p>

          {/* Row 3: Address — always shown; "approx." flag when GPS accuracy is poor */}
          {address && (
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
              {isApproximate && (
                <span className="text-orange-400 dark:text-orange-500 mr-1">
                  ±{Math.round(accuracy)}m
                </span>
              )}
              {address}
            </p>
          )}

          {/* Row 3b: Weak GPS signal indicator */}
          {isWeakSignal && (
            <p className="text-xs text-orange-400 dark:text-orange-500 mt-0.5">
              📡{" "}
              {satellites !== null
                ? `${satellites} sat`
                : `HDOP ${hdop?.toFixed(1)}`}{" "}
              · weak signal
            </p>
          )}

          {/* Row 4: Battery + distance from home + directions */}
          {(battery !== null || distFromHome !== null || position) && (
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {battery !== null && (
                <BatteryBar level={battery} charging={charging} />
              )}
              {distFromHome !== null && (
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {formatDistance(distFromHome)} from home
                </span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  togglePause(device.id);
                }}
                className={`text-xs font-medium ${isPaused ? "text-orange-500 hover:text-orange-700" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"}`}
                title={isPaused ? "Resume sharing" : "Pause sharing"}
              >
                {isPaused ? "▶ Resume" : "⏸ Pause"}
              </button>
              {position && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${position.latitude},${position.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs text-brand-500 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 ml-auto"
                  title="Get directions"
                >
                  Directions
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
