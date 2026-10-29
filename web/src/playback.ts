import type { IntervalPoint, LapPoint, LocPoint } from "./types";

/** Linear interpolation of a driver's position at time t (seconds into lap). */
export function interpolateAt(points: LocPoint[], t: number): { x: number; y: number } | null {
  if (!points.length) return null;
  if (t <= points[0].t) return { x: points[0].x, y: points[0].y };
  const last = points[points.length - 1];
  if (t >= last.t) return { x: last.x, y: last.y };
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  const f = (t - a.t) / Math.max(1e-9, b.t - a.t);
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

/** Points within [t - window, t], for trails. */
export function trailBefore(points: LocPoint[], t: number, window: number): LocPoint[] {
  return points.filter((p) => p.t <= t && p.t >= t - window);
}

/** Duration covered by a window of points. */
export function windowDuration(points: LocPoint[]): number {
  if (points.length < 2) return 0;
  return points[points.length - 1].t - points[0].t;
}

/** Nearest telemetry sample at or before t (for hover readouts). */
export function sampleAt<T extends { t: number }>(points: T[], t: number): T | null {
  if (!points.length) return null;
  let best = points[0];
  for (const p of points) {
    if (p.t <= t) best = p;
    else break;
  }
  return best;
}

/** Latest gap_to_leader per driver at session time tMs (ms epoch). */
export function gapsAt(intervals: IntervalPoint[], tMs: number): Map<number, number | null> {
  const out = new Map<number, number | null>();
  const sorted = [...intervals].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  for (const row of sorted) {
    if (Date.parse(row.date) > tMs) break;
    out.set(row.driver_number, row.gap_to_leader);
  }
  return out;
}

/** Telemetry rows for one lap window lookup (shared by tooltips). */
export type CarSample = Pick<LapPoint, "speed" | "n_gear" | "throttle">;
