import { describe, expect, it } from "vitest";
import { compoundColor, formatGap, formatLapTime, teamColor } from "./format";

describe("formatLapTime", () => {
  it("renders M:SS.mmm with 3 decimals", () => {
    expect(formatLapTime(88.197)).toBe("1:28.197");
    expect(formatLapTime(60)).toBe("1:00.000");
  });
  it("renders em dash for missing", () => {
    expect(formatLapTime(null)).toBe("—");
    expect(formatLapTime(NaN)).toBe("—");
  });
});

describe("formatGap", () => {
  it("signs gaps", () => {
    expect(formatGap(0.184)).toBe("+0.184");
    expect(formatGap(-1.2)).toBe("−1.200");
    expect(formatGap(null)).toBe("—");
  });
});

describe("colors", () => {
  it("maps compounds, falls back on unknown", () => {
    expect(compoundColor("SOFT")).toBe("#E80020");
    expect(compoundColor("mystery")).toBe("#8A94A6");
  });
  it("normalizes team colors", () => {
    expect(teamColor("3671C6")).toBe("#3671C6");
    expect(teamColor("")).toBe("#8A94A6");
  });
});
