import { describe, it, expect, beforeEach } from "vitest";
import {
  detectFlight,
  getFlightState,
  resetFlightState,
} from "../flightDetection.js";

function makePos(deviceId) {
  return { deviceId, latitude: 52.0, longitude: 4.0 };
}

beforeEach(() => {
  resetFlightState(1);
  resetFlightState(2);
});

describe("flightDetection", () => {
  it("starts in ground state", () => {
    expect(getFlightState(1)).toBe("ground");
  });

  it("does not trigger takeoff on a single high-speed update", () => {
    const result = detectFlight(1, 250, makePos(1));
    expect(result).toBeNull();
    expect(getFlightState(1)).toBe("ground");
  });

  it("triggers takeoff after 2 consecutive high-speed updates", () => {
    detectFlight(1, 210, makePos(1));
    const result = detectFlight(1, 220, makePos(1));
    expect(result).not.toBeNull();
    expect(result.event).toBe("takeoff");
    expect(result.deviceId).toBe(1);
    expect(getFlightState(1)).toBe("airborne");
  });

  it("resets high count when interrupted by low speed", () => {
    detectFlight(1, 210, makePos(1));
    detectFlight(1, 100, makePos(1)); // resets count
    const result = detectFlight(1, 210, makePos(1));
    expect(result).toBeNull();
    expect(getFlightState(1)).toBe("ground");
  });

  it("triggers landing when airborne device drops below threshold", () => {
    // Get airborne
    detectFlight(1, 210, makePos(1));
    detectFlight(1, 220, makePos(1)); // takeoff

    // Stay airborne
    expect(detectFlight(1, 180, makePos(1))).toBeNull();
    expect(getFlightState(1)).toBe("airborne");

    // Land
    const result = detectFlight(1, 30, makePos(1));
    expect(result).not.toBeNull();
    expect(result.event).toBe("landing");
    expect(getFlightState(1)).toBe("ground");
  });

  it("does not trigger landing while still fast enough", () => {
    detectFlight(1, 210, makePos(1));
    detectFlight(1, 220, makePos(1)); // takeoff
    expect(detectFlight(1, 50, makePos(1))).toBeNull(); // exactly at threshold
    expect(getFlightState(1)).toBe("airborne");
  });

  it("tracks devices independently", () => {
    // Device 1 takes off
    detectFlight(1, 210, makePos(1));
    detectFlight(1, 220, makePos(1));
    expect(getFlightState(1)).toBe("airborne");

    // Device 2 stays on ground
    detectFlight(2, 100, makePos(2));
    expect(getFlightState(2)).toBe("ground");
  });

  it("allows a full takeoff→landing→takeoff cycle", () => {
    detectFlight(1, 210, makePos(1));
    const takeoff1 = detectFlight(1, 220, makePos(1));
    expect(takeoff1.event).toBe("takeoff");

    const landing = detectFlight(1, 30, makePos(1));
    expect(landing.event).toBe("landing");
    expect(getFlightState(1)).toBe("ground");

    // Second flight
    detectFlight(1, 250, makePos(1));
    const takeoff2 = detectFlight(1, 260, makePos(1));
    expect(takeoff2.event).toBe("takeoff");
    expect(getFlightState(1)).toBe("airborne");
  });

  it("speed exactly at 200 does not count as airborne", () => {
    detectFlight(1, 200, makePos(1));
    detectFlight(1, 200, makePos(1));
    expect(getFlightState(1)).toBe("ground");
  });
});
