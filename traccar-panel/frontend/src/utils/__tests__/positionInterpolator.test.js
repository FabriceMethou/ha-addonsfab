import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  interpolatePosition,
  removeInterpolation,
  getInterpolatedPosition,
  resetAll,
} from "../positionInterpolator.js";

let rafCallbacks = [];
let mockNow = 0;

beforeEach(() => {
  rafCallbacks = [];
  mockNow = 0;

  // Reset module-level state (animations Map + rafId)
  resetAll();

  vi.stubGlobal("performance", { now: () => mockNow });
  vi.stubGlobal("requestAnimationFrame", (cb) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

function flushRAF() {
  const cbs = [...rafCallbacks];
  rafCallbacks = [];
  cbs.forEach((cb) => cb(mockNow));
}

describe("positionInterpolator", () => {
  it("snaps to initial position immediately (no animation)", () => {
    const cb = vi.fn();
    interpolatePosition(1, 52.0, 4.0, cb);
    expect(cb).toHaveBeenCalledWith({ lat: 52.0, lng: 4.0 });
    expect(getInterpolatedPosition(1)).toEqual({ lat: 52.0, lng: 4.0 });
  });

  it("starts animation when target changes", () => {
    const cb = vi.fn();
    interpolatePosition(1, 52.0, 4.0, cb);
    cb.mockClear();

    mockNow = 100;
    interpolatePosition(1, 54.0, 6.0, cb);

    expect(rafCallbacks.length).toBeGreaterThan(0);
  });

  it("interpolates between positions over time", () => {
    const cb = vi.fn();
    mockNow = 0;
    interpolatePosition(1, 52.0, 4.0, cb);
    cb.mockClear();

    mockNow = 100;
    interpolatePosition(1, 54.0, 6.0, cb);

    // Advance to 1100ms (1000ms into the 2000ms animation)
    mockNow = 1100;
    flushRAF();

    const pos = getInterpolatedPosition(1);
    // t = 1000/2000 = 0.5, easeOutCubic(0.5) = 0.875
    // lat = 52 + 2 * 0.875 = 53.75
    expect(pos.lat).toBeCloseTo(53.75, 2);
    expect(pos.lng).toBeCloseTo(5.75, 2);
  });

  it("completes animation at duration end", () => {
    const cb = vi.fn();
    mockNow = 0;
    interpolatePosition(1, 52.0, 4.0, cb);
    cb.mockClear();

    mockNow = 100;
    interpolatePosition(1, 54.0, 6.0, cb);

    // Advance past animation duration (100 + 2000 = 2100)
    mockNow = 2200;
    flushRAF();

    const pos = getInterpolatedPosition(1);
    expect(pos.lat).toBeCloseTo(54.0, 5);
    expect(pos.lng).toBeCloseTo(6.0, 5);
  });

  it("skips animation when position change is < 0.00001", () => {
    const cb = vi.fn();
    mockNow = 0;
    interpolatePosition(1, 52.0, 4.0, cb);
    cb.mockClear();
    rafCallbacks = [];

    mockNow = 100;
    interpolatePosition(1, 52.000005, 4.000005, cb);

    expect(rafCallbacks.length).toBe(0);
  });

  it("updates callback even when position unchanged", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    mockNow = 0;
    interpolatePosition(1, 52.0, 4.0, cb1);

    // Same position, new callback — should store cb2
    mockNow = 50;
    interpolatePosition(1, 52.000005, 4.000005, cb2);

    // Now trigger animation to a new target using cb2
    mockNow = 100;
    interpolatePosition(1, 54.0, 6.0, cb2);

    mockNow = 2200;
    flushRAF();

    expect(cb2).toHaveBeenCalled();
  });

  it("removeInterpolation cleans up device state", () => {
    interpolatePosition(1, 52.0, 4.0, vi.fn());
    expect(getInterpolatedPosition(1)).not.toBeNull();
    removeInterpolation(1);
    expect(getInterpolatedPosition(1)).toBeNull();
  });

  it("getInterpolatedPosition returns null for unknown device", () => {
    expect(getInterpolatedPosition(999)).toBeNull();
  });

  it("handles mid-animation target updates", () => {
    const cb = vi.fn();
    mockNow = 0;
    interpolatePosition(1, 52.0, 4.0, cb);
    cb.mockClear();

    // Start animation to (54, 6)
    mockNow = 100;
    interpolatePosition(1, 54.0, 6.0, cb);

    // Advance partially (500ms into 2000ms)
    mockNow = 600;
    flushRAF();
    const midPos = getInterpolatedPosition(1);
    expect(midPos.lat).toBeGreaterThan(52.0);
    expect(midPos.lat).toBeLessThan(54.0);

    // Update target mid-flight to (56, 8)
    mockNow = 700;
    interpolatePosition(1, 56.0, 8.0, cb);

    // Complete the second animation
    mockNow = 2800;
    flushRAF();

    const finalPos = getInterpolatedPosition(1);
    expect(finalPos.lat).toBeCloseTo(56.0, 5);
    expect(finalPos.lng).toBeCloseTo(8.0, 5);
  });
});
