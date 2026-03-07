import React from "react";

function Bone({ className = "" }) {
  return (
    <div
      className={`bg-gray-200 dark:bg-gray-700 rounded animate-pulse ${className}`}
    />
  );
}

function SkeletonCard() {
  return (
    <div className="flex gap-2.5 p-2.5 rounded-xl">
      <Bone className="w-10 h-10 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2 py-0.5">
        <Bone className="h-3.5 w-3/4 rounded" />
        <Bone className="h-3 w-1/2 rounded" />
      </div>
    </div>
  );
}

export default function SkeletonLoader() {
  return (
    <div className="h-screen flex overflow-hidden bg-gray-100 dark:bg-gray-900">
      {/* Map placeholder */}
      <div className="flex-1 relative bg-gray-200 dark:bg-gray-800 skeleton-shimmer" />

      {/* Sidebar skeleton — hidden on mobile */}
      <div className="hidden md:flex flex-col w-72 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="px-3 py-2.5 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
          <Bone className="h-4 w-24 rounded" />
          <div className="flex-1" />
          <Bone className="h-4 w-4 rounded-full" />
          <Bone className="h-4 w-4 rounded-full" />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-2 py-2 border-b border-gray-200 dark:border-gray-700">
          {[48, 40, 48, 44, 44, 48].map((w, i) => (
            <Bone key={i} className="h-5 rounded" style={{ width: w }} />
          ))}
        </div>

        {/* Device cards */}
        <div className="flex-1 overflow-hidden px-2 py-2 space-y-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>

      {/* Mobile: centered loading indicator */}
      <div className="absolute inset-0 flex items-center justify-center md:hidden pointer-events-none">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
            Loading Family Map...
          </p>
        </div>
      </div>
    </div>
  );
}
