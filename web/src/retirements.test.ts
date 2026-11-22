import { describe, expect, it } from "vitest";
import { buildDriverExits, isOffTrack } from "./retirements";
import type { SessionResultRow } from "./api";
import type { Lap } from "./types";

const start = "2026-05-24T20:00:00Z";
const result: SessionResultRow[] = [
  { position: 1, driver_number: 1, points: 25, dnf: false, dns: false, dsq: false, duration: 5400, gap_text: "0" },
  { position: null, driver_number: 2, points: null, dnf: true, dns: false, dsq: false, duration: null, gap_text: null },
  { position: null, driver_number: 3, points: null, dnf: false, dns: true, dsq: false, duration: null, gap_text: null },
  { position: null, driver_number: 4, points: null, dnf: false, dns: false, dsq: true, duration: null, gap_text: null },
];
const lap = (driver_number: number, lap_number: number, date_start: string, lap_duration: number | null): Lap => ({
  driver_number,
  lap_number,
  date_start,
  lap_duration,
  duration_sector_1: null,
  duration_sector_2: null,
  duration_sector_3: null,
  is_pit_out_lap: null,
});
const laps: Lap[] = [
  lap(1, 1, "2026-05-24T20:01:00Z", 90),
  lap(1, 2, "2026-05-24T20:02:30Z", 90),
  lap(2, 1, "2026-05-24T20:01:00Z", 90),
  lap(2, 2, "2026-05-24T20:02:30Z", null),
];

describe("buildDriverExits", () => {
  it("does not exit classified drivers", () => {
    const exits = buildDriverExits(result, laps, start);
    expect(exits.has(1)).toBe(false);
  });

  it("exits a DNF after its last recorded lap, not at lights out", () => {
    const exits = buildDriverExits(result, laps, start);
    const exit = exits.get(2);
    expect(exit?.status).toBe("DNF");
    expect(exit?.lastLap).toBe(2);
    // first lap is t=0; lap 2 starts at t=90; missing duration falls back to 90
    expect(exit?.outAt).toBe(180);
  });

  it("exits DNS at zero but keeps DSQ marked without inventing a time", () => {
    const exits = buildDriverExits(result, laps, start);
    expect(exits.get(3)).toEqual({ status: "DNS", outAt: 0, lastLap: null });
    expect(exits.get(4)).toEqual({ status: "DSQ", outAt: null, lastLap: null });
  });

  it("hides a driver only once the replay clock reaches outAt", () => {
    const exits = buildDriverExits(result, laps, start);
    expect(isOffTrack(exits.get(2), 179.9)).toBe(false);
    expect(isOffTrack(exits.get(2), 180)).toBe(true);
    expect(isOffTrack(exits.get(3), 0)).toBe(true);
    expect(isOffTrack(undefined, 999)).toBe(false);
  });

  it("returns no exits when the result has no retirement rows", () => {
    expect(buildDriverExits([result[0]], laps, start).size).toBe(0);
  });
});
