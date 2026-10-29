import { describe, expect, it } from "vitest";
import { sectorFlags } from "./sectors";
import type { Lap } from "./types";

const lap = (driver: number, n: number, s1: number | null, s2: number | null, s3: number | null): Lap => ({
  driver_number: driver,
  lap_number: n,
  lap_duration: null,
  duration_sector_1: s1,
  duration_sector_2: s2,
  duration_sector_3: s3,
  is_pit_out_lap: false,
});

describe("sectorFlags", () => {
  it("marks session bests and personal bests", () => {
    const out = sectorFlags([
      lap(1, 1, 30.0, 40.0, 20.0),
      lap(1, 2, 29.5, 40.1, 20.0),
      lap(2, 1, 29.5, 39.9, 20.1),
    ]);
    const by = new Map(out.map((l) => [`${l.driver_number}-${l.lap_number}`, l]));
    expect(by.get("1-2")!.s1).toBe("session");
    expect(by.get("2-1")!.s1).toBe("session");
    expect(by.get("2-1")!.s2).toBe("session");
    expect(by.get("1-1")!.s2).toBe("personal");
    expect(by.get("1-1")!.s3).toBe("session");
  });
  it("leaves nulls blank", () => {
    const out = sectorFlags([lap(1, 1, null, null, null)]);
    expect([out[0].s1, out[0].s2, out[0].s3]).toEqual(["", "", ""]);
  });
});
