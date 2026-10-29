import { describe, expect, it } from "vitest";
import { buildGapTable, formatClock, gapAt, indexAt, lapAt, posAt, trailAt } from "./session";
import type { ReplayDriver } from "./types";

const drv: ReplayDriver = {
  driver_number: 1,
  t: [0, 10, 20, 30],
  x: [0, 100, 200, 300],
  y: [0, 0, 100, 100],
};

describe("indexAt", () => {
  it("finds the last sample at or before t", () => {
    expect(indexAt([0, 10, 20], 15)).toBe(1);
    expect(indexAt([0, 10, 20], 0)).toBe(0);
    expect(indexAt([0, 10, 20], 99)).toBe(2);
  });
  it("returns -1 before the first sample", () => {
    expect(indexAt([5, 10], 1)).toBe(-1);
  });
});

describe("posAt", () => {
  it("interpolates between samples", () => {
    expect(posAt(drv, 15)).toEqual({ x: 150, y: 50 });
  });
  it("clamps to the ends", () => {
    expect(posAt(drv, -1)).toEqual({ x: 0, y: 0 });
    expect(posAt(drv, 999)).toEqual({ x: 300, y: 100 });
  });
});

describe("trailAt", () => {
  it("returns only the trailing window", () => {
    const trail = trailAt(drv, 30, 12);
    expect(trail.length).toBeGreaterThanOrEqual(2);
    expect(trail[0].x).toBeGreaterThanOrEqual(100);
  });
});

describe("gaps", () => {
  const table = buildGapTable([
    { driver_number: 1, t: 0, gap_to_leader: 0 },
    { driver_number: 2, t: 0, gap_to_leader: 1.0 },
    { driver_number: 2, t: 20, gap_to_leader: 3.0 },
    { driver_number: 3, t: 0, gap_to_leader: null },
  ]);
  it("interpolates and skips nulls", () => {
    expect(gapAt(table, 2, 10)).toBeCloseTo(2.0, 6);
    expect(gapAt(table, 3, 10)).toBeNull();
  });
  it("uses the first sample before timing starts", () => {
    expect(gapAt(table, 1, -5)).toBe(0);
    expect(gapAt(table, 3, -5)).toBeNull();
  });
});

describe("lapAt", () => {
  const markers = [
    { lap_number: 1, index: 1, t: 0 },
    { lap_number: 2, index: 2, t: 90 },
    { lap_number: 3, index: 3, t: 180 },
  ];
  it("tracks progress", () => {
    expect(lapAt(markers, -1)).toEqual({ lap: 0, total: 3 });
    expect(lapAt(markers, 100)).toEqual({ lap: 2, total: 3 });
    expect(lapAt(markers, 500)).toEqual({ lap: 3, total: 3 });
  });
});

describe("formatClock", () => {
  it("formats h:mm:ss and mm:ss", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(95)).toBe("1:35");
    expect(formatClock(3725)).toBe("1:02:05");
  });
});
