import { describe, expect, it } from "vitest";
import {
  defaultPair,
  deltaAt,
  fastestLap,
  frameAt,
  pointAt,
  progressAt,
  rotatePoint,
  type DuelPayload,
  type TracePoint,
} from "./duel";
import type { Lap } from "./types";

function lap(driver: number, n: number, time: number | null): Lap {
  return {
    driver_number: driver,
    lap_number: n,
    lap_duration: time,
    duration_sector_1: null,
    duration_sector_2: null,
    duration_sector_3: null,
    is_pit_out_lap: null,
  };
}

// A quarter-lap trace: progress rises 0..1 while t rises 0..10s.
const trace: TracePoint[] = [
  [0, 0, 0, 0],
  [0.25, 10, 0, 2.5],
  [0.5, 10, 10, 5],
  [0.75, 0, 10, 7.5],
  [1, 0, 0, 10],
];

describe("progressAt", () => {
  it("interpolates, clamps and survives an empty trace", () => {
    expect(progressAt(trace, 1.25)).toBeCloseTo(0.125, 6);
    expect(progressAt(trace, 6.25)).toBeCloseTo(0.625, 6);
    expect(progressAt(trace, -1)).toBe(0);
    expect(progressAt(trace, 99)).toBe(1);
    expect(progressAt([], 3)).toBe(0);
  });
});

describe("pointAt", () => {
  it("returns the endpoints and interpolates between them", () => {
    expect(pointAt(trace, 0)).toEqual([0, 0]);
    expect(pointAt(trace, 1)).toEqual([0, 0]);
    expect(pointAt(trace, 0.5)).toEqual([10, 10]);
    expect(pointAt(trace, 0.125)[0]).toBeCloseTo(5, 6);
  });
});

describe("deltaAt", () => {
  const delta: [number, number][] = [
    [0, 0],
    [0.5, -1],
    [1, -2],
  ];

  it("interpolates and clamps", () => {
    expect(deltaAt(delta, 0.25)).toBeCloseTo(-0.5, 6);
    expect(deltaAt(delta, -1)).toBe(0);
    expect(deltaAt(delta, 2)).toBe(-2);
  });
});

describe("frameAt", () => {
  const payload: DuelPayload = {
    points: 5,
    a: { driver_number: 1, lap: 10, lap_duration: 10 },
    b: { driver_number: 2, lap: 10, lap_duration: 11 },
    traces: {
      a: trace,
      b: trace.map(([f, x, y, t]) => [f, x, y, t * 1.1] as TracePoint),
    },
    delta: [
      [0, 0],
      [0.5, 0.5],
      [1, 1],
    ],
  };

  it("identifies the leader, the gap, and a tie at the start", () => {
    const frame = frameAt(payload, 5);
    expect(frame.leader).toBe("a");
    expect(frame.fa).toBeGreaterThan(frame.fb);
    expect(frame.gap).toBeGreaterThan(0);
    expect(frame.signed).toBeGreaterThan(0);

    const start = frameAt(payload, 0);
    expect(start.leader).toBe("tie");
    expect(start.gap).toBe(0);
  });
});

describe("fastestLap and defaultPair", () => {
  const laps = [lap(1, 1, 92.5), lap(1, 2, 90), lap(1, 3, null), lap(2, 1, 91), lap(3, 1, null)];

  it("ignores untimed laps, ignores unknown drivers and picks the minimum", () => {
    expect(fastestLap(laps, 1)?.lap_number).toBe(2);
    expect(fastestLap(laps, 3)).toBeNull();
  });

  it("prefers followed drivers, falls back to the first two, never repeats", () => {
    expect(defaultPair([1, 2, 3], laps, [2, 1])).toEqual([2, 1]);
    expect(defaultPair([3, 1, 2], laps, [])).toEqual([1, 2]);
    expect(defaultPair([1, 2], laps, [1])).toEqual([1, 2]);
  });
});

describe("rotatePoint", () => {
  it("is a no-op at zero, a quarter turn at 90, and invertible", () => {
    expect(rotatePoint(3, 4, 0)).toEqual([3, 4]);
    const [qx, qy] = rotatePoint(1, 0, 90);
    expect(qx).toBeCloseTo(0, 9);
    expect(qy).toBeCloseTo(1, 9);
    const [x, y] = rotatePoint(...rotatePoint(7, -2, 37), -37);
    expect(x).toBeCloseTo(7, 9);
    expect(y).toBeCloseTo(-2, 9);
  });
});
