import React, { useRef, useEffect, useState } from "react";
import useTraccarStore from "./store/useTraccarStore.js";
import { useTraccar } from "./hooks/useTraccar.js";
import { useWebSocket } from "./hooks/useWebSocket.js";
import Map from "./components/Map.jsx";
import Sidebar from "./components/Sidebar.jsx";
import { SidebarContent } from "./components/Sidebar.jsx";
import BottomSheet from "./components/BottomSheet.jsx";
import ToastAlerts from "./components/ToastAlerts.jsx";
import SOSOverlay from "./components/SOSOverlay.jsx";
import CrashOverlay from "./components/CrashOverlay.jsx";
import SkeletonLoader from "./components/SkeletonLoader.jsx";
import { useArrivalRuleChecker } from "./hooks/useArrivalRuleChecker.js";
import OnboardingWizard from "./components/OnboardingWizard.jsx";

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= 768,
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

export default function App() {
  const loading = useTraccarStore((s) => s.loading);
  const error = useTraccarStore((s) => s.error);
  const darkMode = useTraccarStore((s) => s.darkMode);
  const mapTile = useTraccarStore((s) => s.mapTile);
  const setMapTile = useTraccarStore((s) => s.setMapTile);
  const mapRef = useRef(null);
  const isDesktop = useIsDesktop();
  const [showOnboarding, setShowOnboarding] = useState(
    () => localStorage.getItem("onboardingDone") !== "true",
  );

  // Apply dark mode class on root element
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add("dark");
    else root.classList.remove("dark");
  }, [darkMode]);

  // Auto-switch map tiles with dark mode (only for light/dark pairs, not satellite)
  useEffect(() => {
    if (darkMode && (mapTile === "osm" || mapTile === "cartoLight")) {
      setMapTile("cartoDark");
    } else if (!darkMode && mapTile === "cartoDark") {
      setMapTile("osm");
    }
  }, [darkMode]); // eslint-disable-line

  useTraccar();
  useWebSocket();
  useArrivalRuleChecker();

  if (showOnboarding) {
    return <OnboardingWizard onComplete={() => setShowOnboarding(false)} />;
  }

  if (loading) {
    return <SkeletonLoader />;
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-white dark:bg-gray-900">
        <div className="text-center max-w-sm px-4">
          <p className="text-red-500 font-medium mb-2">Failed to load</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-brand-500 text-white rounded hover:bg-brand-600 text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-screen flex overflow-hidden ${darkMode ? "dark" : ""}`}>
      {/* Map — takes remaining space */}
      <div className="flex-1 relative">
        <Map mapRef={mapRef} />
      </div>

      {/* Desktop: right sidebar */}
      {isDesktop && (
        <div className="flex-shrink-0 flex flex-col w-72">
          <Sidebar mapRef={mapRef} />
        </div>
      )}

      {/* Mobile: bottom sheet */}
      {!isDesktop && (
        <BottomSheet>
          <SidebarContent mapRef={mapRef} />
        </BottomSheet>
      )}

      <ToastAlerts />
      <SOSOverlay />
      <CrashOverlay />
    </div>
  );
}
