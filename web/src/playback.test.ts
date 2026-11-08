import { describe, expect, it } from "vitest";
import { gapsAt, interpolateAt, sampleAt, trailBefore, windowDuration } from "./playback";
import type { LocPoint } from "./types";

const pts = (ts: number[]): LocPoint[] =>
  ts.map((t) => ({ t, date: "", x: t * 10, y: t * 5, z: 0 }));

describe("interpolateAt", () => {
  it("lerps, clamps outside the range and returns null when empty", () => {
    expect(interpolateAt(pts([0, 10, 20]), 5)).toEqual({ x: 50, y: 25 });
    expect(interpolateAt(pts([0, 10]), -5)).toEqual({ x: 0, y: 0 });
    expect(interpolateAt(pts([0, 10]), 99)).toEqual({ x: 100, y: 50 });
    expect(interpolateAt([], 5)).toBeNull();
  });
});

describe("trailBefore", () => {
  it("keeps the last window seconds", () => {
    expect(trailBefore(pts([0, 1, 2, 3, 4, 5, 6]), 6, 2).map((p) => p.t)).toEqual([4, 5, 6]);
  });
});

describe("windowDuration", () => {
  it("spans first to last", () => {
    expect(windowDuration(pts([3, 7]))).toBe(4);
    expect(windowDuration([])).toBe(0);
  });
});

describe("sampleAt", () => {
  it("picks the last sample at or before t", () => {
    const rows = [
      { t: 0, speed: 100 },
      { t: 1, speed: 200 },
      { t: 2, speed: 300 },
    ];
    expect(sampleAt(rows, 1.5)!.speed).toBe(200);
    expect(sampleAt(rows, 9)!.speed).toBe(300);
    expect(sampleAt([], 1)).toBeNull();
  });
});

describe("gapsAt", () => {
  it("tracks the latest gap per driver up to t", () => {
    const rows = [
      { date: "2024-01-01T00:00:00+00:00", driver_number: 1, gap_to_leader: 0 },
      { date: "2024-01-01T00:00:05+00:00", driver_number: 2, gap_to_leader: 1.5 },
      { date: "2024-01-01T00:00:10+00:00", driver_number: 2, gap_to_leader: 2.5 },
    ];
    const g = gapsAt(rows, Date.parse("2024-01-01T00:00:07+00:00"));
    expect(g.get(1)).toBe(0);
    expect(g.get(2)).toBe(1.5);
  });
});
