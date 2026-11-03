import { describe, expect, it } from "vitest";
import { drsState, sampleIndex } from "./inputs";

describe("sampleIndex", () => {
  const times = [0, 1, 2, 3];

  it("finds the last sample at or before t", () => {
    expect(sampleIndex(times, 1.4)).toBe(1);
    expect(sampleIndex(times, 2)).toBe(2);
  });

  it("clamps outside the range", () => {
    expect(sampleIndex(times, -5)).toBe(0);
    expect(sampleIndex(times, 99)).toBe(3);
    expect(sampleIndex([], 1)).toBe(-1);
  });
});

describe("drsState", () => {
  it("treats null as unknown, never as closed", () => {
    expect(drsState(null)).toBe("unknown");
    expect(drsState(undefined)).toBe("unknown");
  });

  it("opens at 8 and above", () => {
    expect(drsState(0)).toBe("closed");
    expect(drsState(1)).toBe("closed");
    expect(drsState(8)).toBe("open");
    expect(drsState(14)).toBe("open");
  });
});
