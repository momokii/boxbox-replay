import { describe, expect, it } from "vitest";
import { meaningfulSegments, segmentTone } from "./segments";
import type { Lap } from "./types";

const lap = (segments: number[]): Lap => ({
  driver_number: 1,
  lap_number: 1,
  lap_duration: 90,
  duration_sector_1: 30,
  duration_sector_2: 30,
  duration_sector_3: 30,
  is_pit_out_lap: false,
  segments_sector_1: segments,
});

describe("segmentTone", () => {
  it("maps the documented values and treats unknown as none", () => {
    expect(segmentTone(2051)).toBe("purple");
    expect(segmentTone(2049)).toBe("green");
    expect(segmentTone(2048)).toBe("yellow");
    expect(segmentTone(2064)).toBe("pit");
    expect(segmentTone(0)).toBe("none");
    expect(segmentTone(null)).toBe("none");
  });
});

describe("meaningfulSegments", () => {
  it("rejects race placeholders (almost all one value)", () => {
    const laps = Array.from({ length: 10 }, () => lap(Array(8).fill(2048)));
    expect(meaningfulSegments(laps)).toBe(false);
  });

  it("accepts a mixed session", () => {
    const mixed = Array.from({ length: 10 }, (_, i) =>
      lap(Array.from({ length: 8 }, (_, j) => (i + j) % 2 ? 2049 : 2051)),
    );
    expect(meaningfulSegments(mixed)).toBe(true);
  });

  it("rejects missing data", () => {
    expect(meaningfulSegments([lap([])])).toBe(false);
  });
});
