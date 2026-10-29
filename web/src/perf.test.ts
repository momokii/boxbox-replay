import { describe, expect, it } from "vitest";
import { cleanLaps, recentPace, stintSlope, tyreSlope } from "./perf";

const laps = (times: (number | null)[]) =>
  times.map((t, i) => ({ lap_number: i + 1, lap_duration: t }));

describe("tyreSlope", () => {
  it("fits linear deg", () => {
    expect(tyreSlope(laps([90, 90.2, 90.4]))).toBeCloseTo(0.2, 6);
  });
  it("needs 2 timed laps", () => {
    expect(() => tyreSlope(laps([90]))).toThrow();
    expect(() => tyreSlope(laps([null, null]))).toThrow();
  });
});

describe("cleanLaps", () => {
  it("drops pit-out laps and 107% outliers", () => {
    const laps = [
      { lap_number: 1, lap_duration: 90, is_pit_out_lap: true },
      { lap_number: 2, lap_duration: 90, is_pit_out_lap: false },
      { lap_number: 3, lap_duration: 90.2, is_pit_out_lap: false },
      { lap_number: 4, lap_duration: 200, is_pit_out_lap: false },
    ];
    expect(cleanLaps(laps).map((l) => l.lap_number)).toEqual([2, 3]);
    expect(stintSlope(laps)).toBeCloseTo(0.2, 6);
    expect(() => stintSlope(laps.slice(0, 1))).toThrow();
  });
});

describe("recentPace", () => {
  it("takes the median of the last laps", () => {
    expect(recentPace(laps([90, 91, 92, 93, 94]), 3)).toBe(93);
    expect(recentPace([])).toBeNull();
  });
});
