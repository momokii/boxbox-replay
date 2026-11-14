/** Mini-sector status decoding. Only meaningful outside races. */

import type { Lap } from "./types";

export type SegmentTone = "purple" | "green" | "yellow" | "pit" | "none";

export function segmentTone(value: number | null | undefined): SegmentTone {
  switch (value) {
    case 2051:
      return "purple";
    case 2049:
      return "green";
    case 2048:
      return "yellow";
    case 2064:
      return "pit";
    default:
      return "none";
  }
}

/** True only when the session carries real mini-sector data, not placeholders. */
export function meaningfulSegments(laps: Lap[]): boolean {
  const values: number[] = [];
  for (const lap of laps) {
    for (const sector of [lap.segments_sector_1, lap.segments_sector_2, lap.segments_sector_3]) {
      if (!Array.isArray(sector)) continue;
      for (const value of sector) if (typeof value === "number") values.push(value);
    }
  }
  if (values.length < 30) return false;
  const counts = new Map<number, number>();
  let max = 0;
  for (const value of values) {
    const next = (counts.get(value) ?? 0) + 1;
    counts.set(value, next);
    if (next > max) max = next;
  }
  return max / values.length < 0.95;
}
