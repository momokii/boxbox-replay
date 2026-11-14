import { describe, expect, it } from "vitest";
import { pitStats, type StopLike } from "./pitstats";

const stop = (driver: number, duration: number): StopLike => ({
  driver_number: driver,
  lap_number: 10,
  stop_duration: duration,
});

describe("pitStats", () => {
  it("computes median, best and outliers", () => {
    const stats = pitStats([stop(1, 2.2), stop(2, 2.4), stop(3, 2.6), stop(4, 12.0)]);
    expect(stats.count).toBe(4);
    expect(stats.best).toBe(2.2);
    expect(stats.median).toBeCloseTo(2.5, 6);
    expect(stats.outliers.map((s) => s.driver_number)).toEqual([4]);
  });

  it("ignores null and absurd durations", () => {
    const stats = pitStats([
      { driver_number: 1, lap_number: 1, stop_duration: null },
      stop(2, 0),
      stop(3, 500),
      stop(4, 2.5),
    ]);
    expect(stats.count).toBe(1);
    expect(stats.median).toBe(2.5);
  });

  it("handles an empty field", () => {
    expect(pitStats([])).toEqual({ count: 0, median: null, best: null, outliers: [] });
  });
});
