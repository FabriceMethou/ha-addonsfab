import { describe, it, expect, beforeEach, vi } from "vitest";
import { detectCrash, resetCrashHistory } from "../crashDetection.js";

beforeEach(() => {
  resetCrashHistory(1);
  resetCrashHistory(2);
  vi.spyOn(Date, "now").mockReturnValue(1000);
});

function makePos(deviceId, lat = 52.0, lon = 4.0) {
  return { deviceId, latitude: lat, longitude: lon };
}

describe("crashDetection", () => {
  it("returns null with insufficient data (fewer than 3 entries)", () => {
    expect(detectCrash(1, 80, makePos(1))).toBeNull();
    expect(detectCrash(1, 80, makePos(1))).toBeNull();
  });

  it("returns null when current speed is above low threshold", () => {
    detectCrash(1, 80, makePos(1));
    detectCrash(1, 80, makePos(1));
    expect(detectCrash(1, 10, makePos(1))).toBeNull(); // 10 >= 5
  });

  it("detects a crash: 2 high speeds then sudden stop", () => {
    detectCrash(1, 80, makePos(1));
    Date.now.mockReturnValue(5000);
    detectCrash(1, 70, makePos(1));
    Date.now.mockReturnValue(10000);
    const result = detectCrash(1, 2, makePos(1));
    expect(result).not.toBeNull();
    expect(result.crashed).toBe(true);
    expect(result.deviceId).toBe(1);
  });

  it("does not re-trigger after a crash (history cleared)", () => {
    detectCrash(1, 80, makePos(1));
    Date.now.mockReturnValue(5000);
    detectCrash(1, 70, makePos(1));
    Date.now.mockReturnValue(10000);
    detectCrash(1, 2, makePos(1)); // triggers crash
    // Next call should not trigger because history was cleared
    Date.now.mockReturnValue(15000);
    expect(detectCrash(1, 2, makePos(1))).toBeNull();
  });

  it("returns null when deceleration exceeds time window (>30s)", () => {
    Date.now.mockReturnValue(0);
    detectCrash(1, 80, makePos(1));
    Date.now.mockReturnValue(1000);
    detectCrash(1, 80, makePos(1));
    // 35 seconds later — outside the 30s window
    Date.now.mockReturnValue(35000);
    expect(detectCrash(1, 2, makePos(1))).toBeNull();
  });

  it("returns null without consecutive high speeds (interrupted by low)", () => {
    detectCrash(1, 80, makePos(1));
    Date.now.mockReturnValue(5000);
    detectCrash(1, 20, makePos(1)); // breaks consecutive
    Date.now.mockReturnValue(10000);
    detectCrash(1, 80, makePos(1));
    Date.now.mockReturnValue(15000);
    expect(detectCrash(1, 2, makePos(1))).toBeNull();
  });

  it("tracks devices independently", () => {
    detectCrash(1, 80, makePos(1));
    Date.now.mockReturnValue(5000);
    detectCrash(1, 80, makePos(1));

    // Device 2 has no high-speed history
    Date.now.mockReturnValue(10000);
    expect(detectCrash(2, 2, makePos(2))).toBeNull();

    // Device 1 still triggers
    const result = detectCrash(1, 2, makePos(1));
    expect(result).not.toBeNull();
    expect(result.crashed).toBe(true);
  });

  it("detects crash with exactly MIN_HIGH_SPEED_COUNT (2) consecutive", () => {
    detectCrash(1, 61, makePos(1));
    Date.now.mockReturnValue(5000);
    detectCrash(1, 60, makePos(1)); // exactly at threshold
    Date.now.mockReturnValue(10000);
    const result = detectCrash(1, 4, makePos(1));
    expect(result).not.toBeNull();
    expect(result.crashed).toBe(true);
  });

  it("sliding window keeps only last 5 entries", () => {
    // Fill with low speeds
    for (let i = 0; i < 4; i++) {
      Date.now.mockReturnValue(i * 1000);
      detectCrash(1, 10, makePos(1));
    }
    // Now add 2 high + 1 low — the old low entries get pushed out
    Date.now.mockReturnValue(5000);
    detectCrash(1, 80, makePos(1));
    Date.now.mockReturnValue(6000);
    detectCrash(1, 80, makePos(1)); // window: [10, 10, 80, 80] after shift
    Date.now.mockReturnValue(7000);
    // Window will be [10, 80, 80, crash] — 2 consecutive high before the low
    const result = detectCrash(1, 2, makePos(1));
    expect(result).not.toBeNull();
    expect(result.crashed).toBe(true);
  });
});
