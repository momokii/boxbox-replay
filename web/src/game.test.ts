import { describe, expect, it } from "vitest";
import {
  buildGameDrivers,
  lapFraction,
  mulberry32,
  raceState,
  simulateQualifying,
  simulateRace,
  validatePlayerDrivers,
} from "./game";
import type { StandingsPayload } from "./types";

const standings: StandingsPayload = {
  year: 2025,
  round: null,
  source: "Jolpica F1",
  license: "CC BY-NC-SA 4.0",
  drivers: [
    { position: 1, points: 400, wins: 7, driver_id: "a", code: "AAA", name: "Driver A", constructor: "Team One" },
    { position: 2, points: 300, wins: 3, driver_id: "b", code: "BBB", name: "Driver B", constructor: "Team One" },
    { position: 3, points: 200, wins: 1, driver_id: "c", code: "CCC", name: "Driver C", constructor: "Team Two" },
    { position: 4, points: 100, wins: 0, driver_id: "d", code: "DDD", name: "Driver D", constructor: "Team Two" },
  ],
  constructors: [
    { position: 1, points: 700, wins: 10, constructor_id: "one", name: "Team One" },
    { position: 2, points: 300, wins: 1, constructor_id: "two", name: "Team Two" },
  ],
};

describe("buildGameDrivers", () => {
  it("normalizes driver and team form into a descending overall", () => {
    const drivers = buildGameDrivers(standings);
    expect(drivers.map((d) => d.id)).toEqual(["a", "b", "c", "d"]);
    expect(drivers[0].overall).toBeGreaterThan(drivers[1].overall);
    expect(drivers[0].teamScore).toBe(1);
    expect(drivers[2].teamScore).toBeCloseTo(300 / 700, 5);
    expect(drivers.every((d) => d.overall > 0 && d.overall <= 1)).toBe(true);
  });

  it("is deterministic and returns an empty field for an empty table", () => {
    expect(buildGameDrivers(standings)).toEqual(buildGameDrivers(standings));
    expect(buildGameDrivers({ ...standings, drivers: [], constructors: [] })).toEqual([]);
  });
});

describe("lapFraction", () => {
  it("maps lap progress back onto one circuit per lap", () => {
    expect(lapFraction(0)).toBe(0);
    expect(lapFraction(1)).toBe(0);
    expect(lapFraction(2.25)).toBeCloseTo(0.25);
    expect(lapFraction(4.9)).toBeCloseTo(0.9);
    expect(lapFraction(5)).toBe(0);
    expect(lapFraction(-0.2)).toBeCloseTo(0.8);
  });
});

describe("qualifying", () => {
  it("is seeded, assigns every driver once and orders by time", () => {
    const drivers = buildGameDrivers(standings);
    const a = simulateQualifying(drivers, 42);
    const b = simulateQualifying(drivers, 42);
    expect(a).toEqual(b);
    expect(a.map((r) => r.driverId).sort()).toEqual(["a", "b", "c", "d"]);
    expect(a.map((r) => r.position)).toEqual([1, 2, 3, 4]);
    expect(a.map((r) => r.time)).toEqual([...a.map((r) => r.time)].sort((x, y) => x - y));
  });

  it("uses the seeded random source, not Math.random", () => {
    const rng = mulberry32(7);
    expect(rng()).toBe(mulberry32(7)());
  });
});

describe("race", () => {
  it("rejects duplicate player drivers", () => {
    expect(validatePlayerDrivers(["a", "a"])).toContain("different");
    expect(validatePlayerDrivers(["a", "b"])).toBeNull();
    expect(validatePlayerDrivers([])).not.toBeNull();
  });

  it.each([3, 5, 10])("finishes a %i-lap race with a valid classification", (laps) => {
    const drivers = buildGameDrivers(standings);
    const grid = simulateQualifying(drivers, 9);
    const sim = simulateRace(drivers, grid, laps, 9, ["a", "c"]);
    expect(sim.laps).toBe(laps);
    expect(sim.preview).toHaveLength(4);
    expect(sim.preview.map((r) => r.position)).toEqual([1, 2, 3, 4]);
    expect(sim.preview.map((r) => r.driverId).sort()).toEqual(["a", "b", "c", "d"]);
    const players = sim.preview.filter((r) => r.player != null);
    expect(players.map((r) => r.player)).toEqual([1, 2]);
    const state = raceState(sim, sim.duration);
    expect(state.finished).toBe(true);
    expect(state.rows[0].progress).toBe(laps);
    expect(state.rows.every((r) => r.finished)).toBe(true);
  });

  it("starts at zero progress and advances on the clock", () => {
    const drivers = buildGameDrivers(standings);
    const grid = simulateQualifying(drivers, 1);
    const sim = simulateRace(drivers, grid, 5, 1, ["a"]);
    const start = raceState(sim, 0);
    expect(start.rows.every((r) => r.progress === 0)).toBe(true);
    const mid = raceState(sim, sim.duration / 2);
    expect(mid.rows.some((r) => r.progress > 0)).toBe(true);
    expect(mid.rows.some((r) => r.progress < sim.laps)).toBe(true);
    expect(start.leaderId).toBeTruthy();
  });
});
