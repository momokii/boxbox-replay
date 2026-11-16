import { describe, expect, it } from "vitest";
import { battleTime, telemetryWindow, type LapMarker } from "./windows";

const laps: LapMarker[] = [
  { lap_number: 1, t: 10 },
  { lap_number: 2, t: 100 },
  { lap_number: 3, t: 190 },
];

describe("telemetryWindow", () => {
  it("follows the replay window", () => {
    expect(telemetryWindow("replay", 40, 80, laps, 2, 300)).toEqual({ start: 40, end: 80 });
  });
  it("uses an exact fixed lap and stops at the next lap", () => {
    expect(telemetryWindow("lap", 40, 80, laps, 2, 300)).toEqual({ start: 100, end: 190 });
  });
  it("uses the session duration for the full window", () => {
    expect(telemetryWindow("session", 40, 80, laps, 2, 300)).toEqual({ start: 0, end: 300 });
  });
  it("falls back to the replay if the lap is missing", () => {
    expect(telemetryWindow("lap", 40, 80, [], 2, 300)).toEqual({ start: 40, end: 80 });
  });
});

describe("battleTime", () => {
  it("follows replay or freezes on a lap marker", () => {
    expect(battleTime("replay", 42, laps, 2)).toBe(42);
    expect(battleTime("lap", 42, laps, 3)).toBe(190);
    expect(battleTime("lap", 42, [], 3)).toBe(42);
  });
});
