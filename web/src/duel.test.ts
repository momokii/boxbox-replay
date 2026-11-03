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
  it("interpolates between samples", () => {
    expect(progressAt(trace, 1.25)).toBeCloseTo(0.125, 6);
    expect(progressAt(trace, 6.25)).toBeCloseTo(0.625, 6);
  });

  it("clamps before the start and after the finish", () => {
    expect(progressAt(trace, -1)).toBe(0);
    expect(progressAt(trace, 99)).toBe(1);
  });

  it("survives an empty trace", () => {
    expect(progressAt([], 3)).toBe(0);
  });
});

describe("pointAt", () => {
  it("returns the endpoints", () => {
    expect(pointAt(trace, 0)).toEqual([0, 0]);
    expect(pointAt(trace, 1)).toEqual([0, 0]);
  });

  it("interpolates a position", () => {
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

  it("identifies the leader and the gap", () => {
    const frame = frameAt(payload, 5);
    expect(frame.leader).toBe("a");
    expect(frame.fa).toBeGreaterThan(frame.fb);
    expect(frame.gap).toBeGreaterThan(0);
    expect(frame.signed).toBeGreaterThan(0);
  });

  it("is a tie at the start", () => {
    const frame = frameAt(payload, 0);
    expect(frame.leader).toBe("tie");
    expect(frame.gap).toBe(0);
  });
});

describe("fastestLap", () => {
  it("ignores untimed laps and picks the minimum", () => {
    const laps = [lap(1, 1, 95), lap(1, 2, 92.5), lap(1, 3, null), lap(2, 1, 90)];
    expect(fastestLap(laps, 1)?.lap_number).toBe(2);
    expect(fastestLap(laps, 3)).toBeNull();
  });
});

describe("defaultPair", () => {
  const laps = [lap(1, 1, 90), lap(2, 1, 91), lap(3, 1, null)];

  it("prefers the followed drivers", () => {
    expect(defaultPair([1, 2, 3], laps, [2, 1])).toEqual([2, 1]);
  });

  it("falls back to the first two drivers with timed laps", () => {
    expect(defaultPair([3, 1, 2], laps, [])).toEqual([1, 2]);
  });

  it("never picks the same driver twice when there is an alternative", () => {
    expect(defaultPair([1, 2], laps, [1])).toEqual([1, 2]);
  });
});

describe("rotatePoint", () => {
  it("leaves points alone at zero degrees", () => {
    expect(rotatePoint(3, 4, 0)).toEqual([3, 4]);
  });

  it("rotates a quarter turn", () => {
    const [x, y] = rotatePoint(1, 0, 90);
    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(1, 9);
  });

  it("is invertible", () => {
    const [x, y] = rotatePoint(...rotatePoint(7, -2, 37), -37);
    expect(x).toBeCloseTo(7, 9);
    expect(y).toBeCloseTo(-2, 9);
  });
});
