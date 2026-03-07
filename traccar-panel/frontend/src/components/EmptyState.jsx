import React from "react";

const ILLUSTRATIONS = {
  noDevices: {
    icon: (
      <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
        <circle cx="40" cy="40" r="36" fill="currentColor" opacity="0.08" />
        <circle cx="40" cy="40" r="24" fill="currentColor" opacity="0.12" />
        <circle cx="40" cy="30" r="8" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.5" />
        <path d="M28 54c0-6.627 5.373-12 12-12s12 5.373 12 12" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.5" />
        <circle cx="58" cy="22" r="10" fill="#8652FF" opacity="0.9" />
        <text x="58" y="27" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold">+</text>
      </svg>
    ),
    title: "No devices yet",
    description:
      "Connect your Traccar server to see your family members here. Add devices in your Traccar admin panel.",
  },
  noTrips: {
    icon: (
      <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
        <circle cx="40" cy="40" r="36" fill="currentColor" opacity="0.08" />
        <path d="M25 50L40 20L55 50" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.4" />
        <circle cx="25" cy="50" r="3" fill="currentColor" opacity="0.5" />
        <circle cx="55" cy="50" r="3" fill="currentColor" opacity="0.5" />
        <circle cx="40" cy="20" r="3" fill="#8652FF" />
      </svg>
    ),
    title: "No trips yet",
    description: "Once this device starts moving, trips will appear here.",
  },
  noPlaces: {
    icon: (
      <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
        <circle cx="40" cy="40" r="36" fill="currentColor" opacity="0.08" />
        <path d="M40 18c-8.837 0-16 7.163-16 16 0 12 16 28 16 28s16-16 16-28c0-8.837-7.163-16-16-16z" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.4" />
        <circle cx="40" cy="34" r="6" fill="#8652FF" opacity="0.7" />
      </svg>
    ),
    title: "No places defined",
    description:
      "Create geofences in your Traccar admin panel to see them here. Add places like Home, Work, or School.",
  },
  noEvents: {
    icon: (
      <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
        <circle cx="40" cy="40" r="36" fill="currentColor" opacity="0.08" />
        <rect x="24" y="22" width="32" height="36" rx="4" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.4" />
        <line x1="24" y1="32" x2="56" y2="32" stroke="currentColor" strokeWidth="2" opacity="0.3" />
        <line x1="32" y1="40" x2="48" y2="40" stroke="currentColor" strokeWidth="1.5" opacity="0.25" />
        <line x1="32" y1="46" x2="44" y2="46" stroke="currentColor" strokeWidth="1.5" opacity="0.25" />
      </svg>
    ),
    title: "No events yet",
    description:
      "Events like arrivals, departures, and speed alerts will show up here.",
  },
};

export default function EmptyState({ type }) {
  const config = ILLUSTRATIONS[type];
  if (!config) return null;

  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="text-gray-400 dark:text-gray-500 mb-4">{config.icon}</div>
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
        {config.title}
      </h3>
      <p className="text-xs text-gray-400 dark:text-gray-500 max-w-[220px] leading-relaxed">
        {config.description}
      </p>
    </div>
  );
}
