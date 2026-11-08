import { describe, expect, it } from "vitest";
import { formatGap, formatLapTime, surnameOf } from "./format";

describe("lap and gap formatting", () => {
  it("renders M:SS.mmm with three decimals and an em dash for missing", () => {
    expect(formatLapTime(88.197)).toBe("1:28.197");
    expect(formatLapTime(60)).toBe("1:00.000");
    expect(formatLapTime(null)).toBe("—");
    expect(formatLapTime(NaN)).toBe("—");
  });

  it("signs gaps", () => {
    expect(formatGap(0.184)).toBe("+0.184");
    expect(formatGap(-1.2)).toBe("−1.200");
    expect(formatGap(null)).toBe("—");
  });
});

describe("driver labels", () => {
  it("extracts a title-cased surname", () => {
    expect(surnameOf("Max VERSTAPPEN")).toBe("Verstappen");
    expect(surnameOf("Sergio PEREZ")).toBe("Perez");
    expect(surnameOf(null)).toBe("");
  });
});
