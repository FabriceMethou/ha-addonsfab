import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getDevicePhoto,
  getAllDevicePhotos,
  setDevicePhoto,
  removeDevicePhoto,
} from "../devicePhotos.js";

// Mock localStorage
const store = {};
beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k]);
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, val) => {
      store[key] = val;
    }),
    removeItem: vi.fn((key) => {
      delete store[key];
    }),
  });
});

describe("devicePhotos", () => {
  it("returns null for device with no photo", () => {
    expect(getDevicePhoto(1)).toBeNull();
  });

  it("stores and retrieves a photo", () => {
    setDevicePhoto(1, "data:image/jpeg;base64,abc");
    expect(getDevicePhoto(1)).toBe("data:image/jpeg;base64,abc");
  });

  it("returns all photos", () => {
    setDevicePhoto(1, "photo1");
    setDevicePhoto(2, "photo2");
    const all = getAllDevicePhotos();
    expect(all).toEqual({ "1": "photo1", "2": "photo2" });
  });

  it("removes a photo", () => {
    setDevicePhoto(1, "photo1");
    setDevicePhoto(2, "photo2");
    removeDevicePhoto(1);
    expect(getDevicePhoto(1)).toBeNull();
    expect(getDevicePhoto(2)).toBe("photo2");
  });

  it("handles corrupted localStorage gracefully", () => {
    store.devicePhotos = "not-json{{{";
    expect(getDevicePhoto(1)).toBeNull();
    expect(getAllDevicePhotos()).toEqual({});
  });

  it("converts deviceId to string key", () => {
    setDevicePhoto(42, "pic");
    const raw = JSON.parse(store.devicePhotos);
    expect(raw["42"]).toBe("pic");
  });

  it("overwrites existing photo for same device", () => {
    setDevicePhoto(1, "old");
    setDevicePhoto(1, "new");
    expect(getDevicePhoto(1)).toBe("new");
  });
});
