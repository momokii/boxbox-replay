import { describe, expect, it } from "vitest";
import { recentPace, tyreSlope } from "./perf";

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

describe("recentPace", () => {
  it("takes the median of the last laps", () => {
    expect(recentPace(laps([90, 91, 92, 93, 94]), 3)).toBe(93);
    expect(recentPace([])).toBeNull();
  });
});
