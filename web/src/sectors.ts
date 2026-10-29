import type { Lap } from "./types";

export type SectorFlag = "session" | "personal" | "";

export interface FlaggedLap extends Lap {
  s1: SectorFlag;
  s2: SectorFlag;
  s3: SectorFlag;
}

/** F1-standard sector coloring inputs: session best (purple) vs personal best (green). */
export function sectorFlags(laps: Lap[]): FlaggedLap[] {
  const best = (key: "duration_sector_1" | "duration_sector_2" | "duration_sector_3"): number => {
    const vals = laps.map((l) => l[key]).filter((v): v is number => v != null && !Number.isNaN(v));
    return vals.length ? Math.min(...vals) : NaN;
  };
  const session = [best("duration_sector_1"), best("duration_sector_2"), best("duration_sector_3")];
  const personal = new Map<number, number[]>();
  for (const l of laps) {
    const cur = personal.get(l.driver_number) ?? [NaN, NaN, NaN];
    const keys = ["duration_sector_1", "duration_sector_2", "duration_sector_3"] as const;
    keys.forEach((k, i) => {
      const v = l[k];
      if (v != null && !Number.isNaN(v) && (Number.isNaN(cur[i]) || v < cur[i])) cur[i] = v;
    });
    personal.set(l.driver_number, cur);
  }
  return laps.map((l) => {
    const keys = ["duration_sector_1", "duration_sector_2", "duration_sector_3"] as const;
    const out = { ...l, s1: "" as SectorFlag, s2: "" as SectorFlag, s3: "" as SectorFlag };
    (["s1", "s2", "s3"] as const).forEach((s, i) => {
      const v = l[keys[i]];
      if (v == null || Number.isNaN(v)) return;
      if (v === session[i]) out[s] = "session";
      else if (v === (personal.get(l.driver_number) ?? [])[i]) out[s] = "personal";
    });
    return out;
  });
}
