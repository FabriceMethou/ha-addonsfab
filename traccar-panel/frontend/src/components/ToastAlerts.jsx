import React, { useEffect, useRef } from "react";
import useTraccarStore from "../store/useTraccarStore.js";

const ICONS = {
  geofenceEnter: "📍",
  geofenceExit: "🚪",
  lowBattery: "🔋",
  deviceOverspeed: "⚡",
  alarm: "🚨",
  sos: "🆘",
  noShow: "⏰",
  crash: "💥",
  takeoff: "✈️",
  landing: "🛬",
};

const COLORS = {
  geofenceEnter: "border-green-400 bg-green-50 dark:bg-green-900/40",
  geofenceExit: "border-orange-400 bg-orange-50 dark:bg-orange-900/40",
  lowBattery: "border-red-400 bg-red-50 dark:bg-red-900/40",
  deviceOverspeed: "border-yellow-400 bg-yellow-50 dark:bg-yellow-900/40",
  alarm: "border-red-600 bg-red-100 dark:bg-red-900/60",
  sos: "border-red-600 bg-red-100 dark:bg-red-900/60",
  noShow: "border-amber-400 bg-amber-50 dark:bg-amber-900/40",
  crash: "border-red-600 bg-red-100 dark:bg-red-900/60",
  takeoff: "border-brand-400 bg-brand-50 dark:bg-brand-900/40",
  landing: "border-green-400 bg-green-50 dark:bg-green-900/40",
};

const ALARM_LABELS = {
  sos: "SOS alert",
  crash: "Crash detected",
  hardBraking: "Hard braking",
  hardAcceleration: "Rapid acceleration",
  overSpeed: "Overspeed",
  lowBattery: "Low battery",
  general: "Alert triggered",
};

function getAlertBody(alert) {
  if (alert.type === "geofenceEnter") return `arrived at ${alert.geofenceName}`;
  if (alert.type === "geofenceExit") return `left ${alert.geofenceName}`;
  if (alert.type === "lowBattery") return `battery low (${alert.battery}%)`;
  if (alert.type === "deviceOverspeed")
    return `speeding${alert.speedKmh ? ` — ${alert.speedKmh} km/h` : ""}`;
  if (alert.type === "alarm")
    return ALARM_LABELS[alert.alarmType] ?? `Alarm: ${alert.alarmType}`;
  if (alert.type === "sos") return "EMERGENCY — needs help!";
  if (alert.type === "noShow") return `hasn't arrived at ${alert.geofenceName}`;
  if (alert.type === "crash") return "possible crash detected!";
  if (alert.type === "takeoff") return "has taken off";
  if (alert.type === "landing")
    return `has landed${alert.address ? ` at ${alert.address}` : ""}`;
  return alert.type;
}

function Toast({ alert, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(alert.id), 6000);
    return () => clearTimeout(timer);
  }, [alert.id, onDismiss]);

  const body = getAlertBody(alert);

  return (
    <div
      className={`flex items-start gap-2 px-3 py-2 rounded-lg border shadow-md text-sm max-w-xs w-full ${COLORS[alert.type] ?? "border-gray-300 bg-white dark:bg-gray-800"}`}
    >
      <span className="text-base flex-shrink-0">
        {ICONS[alert.type] ?? "●"}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-medium dark:text-white truncate">
          {alert.deviceName}
        </p>
        <p className="text-xs text-gray-600 dark:text-gray-300 truncate">
          {body}
        </p>
      </div>
      <button
        onClick={() => onDismiss(alert.id)}
        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex-shrink-0 leading-none"
      >
        ×
      </button>
    </div>
  );
}

export default function ToastAlerts() {
  const alerts = useTraccarStore((s) => s.alerts);
  const dismissAlert = useTraccarStore((s) => s.dismissAlert);
  const seenIds = useRef(new Set());

  // Request browser notification permission once
  useEffect(() => {
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
    ) {
      Notification.requestPermission();
    }
  }, []);

  // Fire a browser notification for each new alert
  useEffect(() => {
    if (
      typeof Notification === "undefined" ||
      Notification.permission !== "granted"
    )
      return;
    for (const alert of alerts) {
      if (!seenIds.current.has(alert.id)) {
        seenIds.current.add(alert.id);
        try {
          new Notification(alert.deviceName, {
            body: getAlertBody(alert),
            icon: "./favicon.ico",
            tag: String(alert.id),
          });
        } catch {
          // Notifications may be blocked by the browser in some contexts
        }
      }
    }
    // Prune seenIds to only current alert IDs so the Set doesn't grow unbounded
    const currentIds = new Set(alerts.map((a) => a.id));
    for (const id of seenIds.current) {
      if (!currentIds.has(id)) seenIds.current.delete(id);
    }
  }, [alerts]);

  if (alerts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[2000] flex flex-col gap-2 items-end pointer-events-none">
      {alerts.slice(0, 5).map((alert) => (
        <div key={alert.id} className="pointer-events-auto">
          <Toast alert={alert} onDismiss={dismissAlert} />
        </div>
      ))}
    </div>
  );
}
