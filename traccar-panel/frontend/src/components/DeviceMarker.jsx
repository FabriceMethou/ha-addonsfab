import React, { useRef, useEffect, useState } from "react";
import { Marker, Popup, Tooltip, Circle } from "react-leaflet";
import L from "leaflet";
import { formatDistanceToNow } from "date-fns";
import useTraccarStore from "../store/useTraccarStore.js";
import {
  detectActivity,
  activityBadgeSvg,
} from "../utils/activityDetection.js";
import {
  interpolatePosition,
  removeInterpolation,
} from "../utils/positionInterpolator.js";

// Deterministic color per device
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

function colorForDevice(deviceId) {
  return COLORS[Math.abs(deviceId) % COLORS.length];
}

function makeDotIcon(
  color,
  initials,
  course,
  speedKmh,
  isOnline,
  photoUrl,
  activity,
  deviceId,
) {
  const showArrow = speedKmh > 2;
  const arrow = showArrow
    ? `<g transform="rotate(${course}, 24, 24)"><polygon points="24,2 19,12 29,12" fill="${color}" stroke="white" stroke-width="1.5"/></g>`
    : "";
  const opacity = isOnline ? 1 : 0.45;

  const cpId = `cp-${deviceId}`;
  const centerContent = photoUrl
    ? `<defs><clipPath id="${cpId}"><circle cx="24" cy="24" r="19"/></clipPath></defs>
       <circle cx="24" cy="24" r="20" fill="${color}" stroke="white" stroke-width="2.5"/>
       <image href="${photoUrl}" x="5" y="5" width="38" height="38" clip-path="url(#${cpId})" preserveAspectRatio="xMidYMid slice"/>`
    : `<circle cx="24" cy="24" r="20" fill="${color}" stroke="white" stroke-width="2.5"/>
       <text x="24" y="30" text-anchor="middle" fill="white" font-size="13" font-family="sans-serif" font-weight="bold">${initials}</text>`;

  const badge = activity ? activityBadgeSvg(activity, 38, 38) : "";

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="48" height="62" viewBox="0 0 48 62" opacity="${opacity}">
      ${arrow}
      ${centerContent}
      ${badge}
      <polygon points="17,42 31,42 24,60" fill="${color}"/>
    </svg>
  `;
  return L.divIcon({
    html: svg,
    iconSize: [48, 62],
    iconAnchor: [24, 60],
    popupAnchor: [0, -62],
    className: "",
  });
}

export default function DeviceMarker({ device, position, onClick }) {
  const geofences = useTraccarStore((s) => s.geofences);
  const selectedDeviceId = useTraccarStore((s) => s.selectedDeviceId);
  const photo = useTraccarStore((s) => s.devicePhotos[device.id]);
  const isPaused = useTraccarStore((s) => s.pausedDevices.has(device.id));
  const isBubble = useTraccarStore((s) => s.bubbleDevices.has(device.id));
  const isSelected = selectedDeviceId === device.id;
  const markerRef = useRef(null);
  const circleRef = useRef(null);

  // Interpolated display position (for React rendering of initial position)
  const [displayPos, setDisplayPos] = useState(
    position ? { lat: position.latitude, lng: position.longitude } : null,
  );

  // Set up interpolation when position changes
  useEffect(() => {
    if (!position) return;

    interpolatePosition(
      device.id,
      position.latitude,
      position.longitude,
      (pos) => {
        // Update Leaflet marker directly for smooth animation (bypasses React)
        if (markerRef.current) {
          markerRef.current.setLatLng([pos.lat, pos.lng]);
        }
        // Update accuracy circle center too
        if (circleRef.current) {
          circleRef.current.setLatLng([pos.lat, pos.lng]);
        }
      },
    );

    // Update React state for initial render position
    setDisplayPos({ lat: position.latitude, lng: position.longitude });

    return () => {}; // cleanup handled by unmount effect below
  }, [device.id, position?.latitude, position?.longitude]);

  // Cleanup interpolation on unmount
  useEffect(() => {
    return () => removeInterpolation(device.id);
  }, [device.id]);

  if (!position) return null;

  const {
    latitude,
    longitude,
    speed,
    course,
    attributes,
    address,
    fixTime,
    geofenceIds,
  } = position;
  const color = colorForDevice(device.id);
  const initials = device.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  const isOnline = device.status === "online";
  const speedKmh = Math.round((speed ?? 0) * 1.852);
  const activity =
    isOnline && !isPaused
      ? detectActivity(speedKmh, position, geofences)
      : "stationary";
  const icon = makeDotIcon(
    color,
    initials,
    isPaused ? 0 : (course ?? 0),
    isPaused ? 0 : speedKmh,
    isPaused ? false : isOnline,
    photo,
    isPaused ? null : activity,
    device.id,
  );

  const battery = attributes?.batteryLevel ?? null;
  const ignition = attributes?.ignition ?? null;
  const satellites = attributes?.sat ?? null;
  const accuracy = position.accuracy ?? null;
  const lastSeen = fixTime
    ? formatDistanceToNow(new Date(fixTime), { addSuffix: true })
    : "unknown";
  const currentPlaces = (geofenceIds ?? [])
    .map((id) => geofences.find((g) => g.id === id)?.name)
    .filter(Boolean);

  function courseLabel(deg) {
    const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return dirs[Math.round(deg / 45) % 8];
  }

  // Use display position (which gets set to the target immediately for React render)
  const renderLat = displayPos?.lat ?? latitude;
  const renderLng = displayPos?.lng ?? longitude;

  // Bubble mode: show a large translucent circle instead of precise location
  if (isBubble) {
    const BUBBLE_RADIUS = 500; // metres
    return (
      <Circle
        center={[renderLat, renderLng]}
        radius={BUBBLE_RADIUS}
        pathOptions={{
          color,
          fillColor: color,
          fillOpacity: 0.15,
          weight: 2,
          opacity: 0.4,
        }}
        eventHandlers={{ click: () => onClick?.(device) }}
      >
        <Tooltip permanent={isSelected} direction="top" offset={[0, 0]}>
          <span
            style={{ fontWeight: isSelected ? 700 : 500, fontSize: "12px" }}
          >
            {device.name} (approximate)
          </span>
        </Tooltip>
      </Circle>
    );
  }

  return (
    <>
      {accuracy !== null && accuracy > 5 && (
        <Circle
          ref={circleRef}
          center={[renderLat, renderLng]}
          radius={accuracy}
          pathOptions={{
            color,
            fillColor: color,
            fillOpacity: 0.08,
            weight: 1,
            opacity: 0.25,
            interactive: false,
          }}
        />
      )}
      <Marker
        ref={markerRef}
        position={[renderLat, renderLng]}
        icon={icon}
        eventHandlers={{ click: () => onClick?.(device) }}
      >
        <Tooltip permanent={isSelected} direction="top" offset={[0, -62]}>
          <span
            style={{ fontWeight: isSelected ? 700 : 500, fontSize: "12px" }}
          >
            {device.name}
            {isPaused ? " (paused)" : ""}
          </span>
        </Tooltip>
        <Popup>
          <div className="min-w-[170px] space-y-0.5">
            <p className="font-bold text-base">{device.name}</p>

            <p
              className={`text-xs font-medium ${isOnline ? "text-green-600" : "text-gray-400"}`}
            >
              {isOnline
                ? ignition === true
                  ? "Ignition on"
                  : "Online"
                : "Offline"}
            </p>

            {currentPlaces.length > 0 && (
              <p className="text-xs text-brand-600 font-medium">
                At {currentPlaces.join(", ")}
              </p>
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
            <div className="pt-1.5 border-t border-gray-200 mt-1.5">
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-xs font-medium text-brand-600 hover:text-brand-800 hover:underline"
              >
                Get directions
              </a>
            </div>
          </div>
        </Popup>
      </Marker>
    </>
  );
}
