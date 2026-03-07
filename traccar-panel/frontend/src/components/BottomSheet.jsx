import React, { useState, useRef, useCallback, useEffect } from "react";

const COLLAPSED = 64;
const HALF_RATIO = 0.5;
const FULL_OFFSET = 48;
const SNAP_VELOCITY = 0.4;

export default function BottomSheet({ children }) {
  const sheetRef = useRef(null);
  const touchRef = useRef({
    startY: 0,
    startTranslate: 0,
    startTime: 0,
    prevY: 0,
    prevTime: 0,
    lastY: 0,
    lastTime: 0,
  });
  const [snap, setSnap] = useState("collapsed");
  const [dragging, setDragging] = useState(false);
  const [translate, setTranslate] = useState(0);

  const getSnapY = useCallback((snapName) => {
    const vh = window.innerHeight;
    if (snapName === "collapsed") return vh - COLLAPSED;
    if (snapName === "half") return vh * (1 - HALF_RATIO);
    return FULL_OFFSET;
  }, []);

  useEffect(() => {
    setTranslate(getSnapY(snap));
  }, [snap, getSnapY]);

  const onTouchStart = useCallback(
    (e) => {
      const y = e.touches[0].clientY;
      const now = performance.now();
      touchRef.current = {
        startY: y,
        startTranslate: getSnapY(snap),
        startTime: now,
        prevY: y,
        prevTime: now,
        lastY: y,
        lastTime: now,
      };
      setDragging(true);
    },
    [snap, getSnapY],
  );

  const onTouchMove = useCallback(
    (e) => {
      if (!dragging) return;
      const y = e.touches[0].clientY;
      const now = performance.now();
      const delta = y - touchRef.current.startY;
      const newY = Math.max(
        FULL_OFFSET,
        Math.min(window.innerHeight - COLLAPSED, touchRef.current.startTranslate + delta),
      );
      setTranslate(newY);
      // Track previous frame for velocity calculation
      touchRef.current.prevY = touchRef.current.lastY;
      touchRef.current.prevTime = touchRef.current.lastTime;
      touchRef.current.lastY = y;
      touchRef.current.lastTime = now;
    },
    [dragging],
  );

  const onTouchEnd = useCallback(() => {
    if (!dragging) return;
    setDragging(false);

    // Velocity based on last two touch-move samples (px/ms)
    const dt = touchRef.current.lastTime - touchRef.current.prevTime;
    const dy = touchRef.current.lastY - touchRef.current.prevY;
    const velocity = dt > 0 ? dy / dt : 0;

    const snaps = [
      { name: "full", y: getSnapY("full") },
      { name: "half", y: getSnapY("half") },
      { name: "collapsed", y: getSnapY("collapsed") },
    ];

    if (Math.abs(velocity) > SNAP_VELOCITY) {
      const direction = velocity > 0 ? "down" : "up";
      const current = snaps.findIndex((s) => s.name === snap);
      const target =
        direction === "up"
          ? snaps[Math.max(0, current - 1)]
          : snaps[Math.min(snaps.length - 1, current + 1)];
      setSnap(target.name);
      return;
    }

    // Snap to closest
    let closest = snaps[0];
    let minDist = Math.abs(translate - snaps[0].y);
    for (const s of snaps) {
      const d = Math.abs(translate - s.y);
      if (d < minDist) {
        minDist = d;
        closest = s;
      }
    }
    setSnap(closest.name);
  }, [dragging, snap, translate, getSnapY]);

  return (
    <div
      ref={sheetRef}
      className="fixed inset-x-0 bottom-0 z-[500] md:hidden"
      style={{
        transform: `translateY(${dragging ? translate : getSnapY(snap)}px)`,
        transition: dragging ? "none" : "transform 300ms cubic-bezier(0.4, 0, 0.2, 1)",
        height: `calc(100vh - ${FULL_OFFSET}px)`,
      }}
    >
      <div className="h-full bg-white dark:bg-gray-800 rounded-t-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Drag handle */}
        <div
          className="flex-shrink-0 flex justify-center py-2.5 cursor-grab active:cursor-grabbing touch-none"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
        </div>
        {/* Content */}
        <div className="flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
