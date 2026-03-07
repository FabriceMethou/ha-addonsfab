import { describe, it, expect } from "vitest";
import { detectActivity, activityBadgeSvg } from "../activityDetection.js";

describe("detectActivity", () => {
  it("returns 'flying' for speed > 200", () => {
    expect(detectActivity(201, {}, [])).toBe("flying");
    expect(detectActivity(500, {}, [])).toBe("flying");
  });

  it("returns 'driving' for speed 16-200", () => {
    expect(detectActivity(16, {}, [])).toBe("driving");
    expect(detectActivity(120, {}, [])).toBe("driving");
    expect(detectActivity(200, {}, [])).toBe("driving");
  });

  it("returns 'cycling' for speed 6-15", () => {
    expect(detectActivity(6, {}, [])).toBe("cycling");
    expect(detectActivity(15, {}, [])).toBe("cycling");
  });

  it("returns 'walking' for speed 2-5", () => {
    expect(detectActivity(2, {}, [])).toBe("walking");
    expect(detectActivity(5, {}, [])).toBe("walking");
  });

  it("returns 'stationary' for speed 0-1 with no geofences", () => {
    expect(detectActivity(0, {}, [])).toBe("stationary");
    expect(detectActivity(1, {}, [])).toBe("stationary");
  });

  it("returns 'home' when at a home geofence", () => {
    const pos = { geofenceIds: [10] };
    const gf = [{ id: 10, name: "Home" }];
    expect(detectActivity(0, pos, gf)).toBe("home");
  });

  it("returns 'home' for multilingual home names", () => {
    const pos = { geofenceIds: [1] };
    expect(detectActivity(0, pos, [{ id: 1, name: "Thuis" }])).toBe("home");
    expect(detectActivity(0, pos, [{ id: 1, name: "Maison" }])).toBe("home");
    expect(detectActivity(0, pos, [{ id: 1, name: "Casa" }])).toBe("home");
  });

  it("returns 'work' when at a work geofence", () => {
    const pos = { geofenceIds: [20] };
    const gf = [{ id: 20, name: "Office" }];
    expect(detectActivity(0, pos, gf)).toBe("work");
  });

  it("returns 'work' for multilingual work names", () => {
    const pos = { geofenceIds: [1] };
    expect(detectActivity(0, pos, [{ id: 1, name: "Kantoor" }])).toBe("work");
    expect(detectActivity(0, pos, [{ id: 1, name: "Bureau" }])).toBe("work");
    expect(detectActivity(0, pos, [{ id: 1, name: "Werk" }])).toBe("work");
  });

  it("returns 'stationary' when geofence doesn't match home/work", () => {
    const pos = { geofenceIds: [30] };
    const gf = [{ id: 30, name: "Gym" }];
    expect(detectActivity(0, pos, gf)).toBe("stationary");
  });

  it("returns 'stationary' when geofenceIds is missing", () => {
    expect(detectActivity(0, {}, [{ id: 1, name: "Home" }])).toBe(
      "stationary",
    );
    expect(detectActivity(0, null, [{ id: 1, name: "Home" }])).toBe(
      "stationary",
    );
  });

  it("speed thresholds take priority over geofences", () => {
    const pos = { geofenceIds: [10] };
    const gf = [{ id: 10, name: "Home" }];
    expect(detectActivity(20, pos, gf)).toBe("driving");
  });
});

describe("activityBadgeSvg", () => {
  it("returns empty string for stationary", () => {
    expect(activityBadgeSvg("stationary", 38, 38)).toBe("");
  });

  it("returns SVG content for known activities", () => {
    for (const act of [
      "driving",
      "cycling",
      "walking",
      "home",
      "work",
      "flying",
    ]) {
      const svg = activityBadgeSvg(act, 38, 38);
      expect(svg).toContain("<g");
      expect(svg).toContain("translate(");
    }
  });

  it("returns empty string for unknown activity", () => {
    expect(activityBadgeSvg("swimming", 38, 38)).toBe("");
  });
});
