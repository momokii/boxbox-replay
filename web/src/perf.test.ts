import { describe, expect, it } from "vitest";
import {
  cleanLaps,
  freshTyrePace,
  greenLaps,
  median,
  recentPace,
  stintSlope,
  tyreSlope,
} from "./perf";

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


describe("greenLaps / freshTyrePace", () => {
  const laps = [
    { driver_number: 1, lap_number: 1, lap_duration: 131.0, is_pit_out_lap: false },
    { driver_number: 1, lap_number: 2, lap_duration: 93.5, is_pit_out_lap: true },
    { driver_number: 1, lap_number: 3, lap_duration: 93.2, is_pit_out_lap: false },
    { driver_number: 1, lap_number: 4, lap_duration: 93.4, is_pit_out_lap: false },
    { driver_number: 1, lap_number: 5, lap_duration: 93.3, is_pit_out_lap: false },
    { driver_number: 1, lap_number: 20, lap_duration: 112.0, is_pit_out_lap: false },
  ];
  const stints = [{ driver_number: 1, lap_start: 1, lap_end: 20 }];

  it("drops pit-out laps and outliers", () => {
    const kept = greenLaps(laps).map((l) => l.lap_number);
    expect(kept).not.toContain(2); // pit out
    expect(kept).not.toContain(1); // 131s outlier
  });

  it("measures fresh pace from laps 2-4 of a stint, ignoring the out-lap", () => {
    const fresh = freshTyrePace(stints, laps, 1);
    expect(fresh).toBeGreaterThan(92);
    expect(fresh).toBeLessThan(94);
  });

  it("median handles even and empty lists", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2])).toBe(1.5);
    expect(median([])).toBeNull();
  });
});
