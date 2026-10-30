import type { ReplayDriver, SessionGap } from "./types";

/** Last index whose time is <= t (binary search). -1 when t precedes all. */
export function indexAt(times: number[], t: number): number {
  if (!times.length) return -1;
  if (t < times[0]) return -1;
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export interface Pos {
  x: number;
  y: number;
}

/**
 * Interpolated position of a driver at time t; null when there is no data.
 *
 * `maxStep` guards against telemetry gaps: if two samples are further apart
 * than any car could travel in one frame, we hold the earlier one instead of
 * sliding the dot across the circuit.
 */
export function posAt(d: ReplayDriver, t: number, maxStep = Infinity): Pos | null {
  if (!d.t.length) return null;
  const i = indexAt(d.t, t);
  if (i < 0) return { x: d.x[0], y: d.y[0] };
  if (i >= d.t.length - 1) return { x: d.x[i], y: d.y[i] };
  const jump = Math.hypot(d.x[i + 1] - d.x[i], d.y[i + 1] - d.y[i]);
  if (jump > maxStep) return { x: d.x[i], y: d.y[i] };
  const t0 = d.t[i];
  const t1 = d.t[i + 1];
  const f = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
  return { x: d.x[i] + (d.x[i + 1] - d.x[i]) * f, y: d.y[i] + (d.y[i + 1] - d.y[i]) * f };
}

/**
 * Trail points in [t - window, t], stopping at telemetry gaps.
 *
 * A trail must be one continuous run of samples: if the feed skips a couple of
 * seconds the next point can be a kilometre away, which used to draw a line
 * across the circuit.
 */
export function trailAt(d: ReplayDriver, t: number, window: number, maxStep = Infinity): Pos[] {
  const end = indexAt(d.t, t);
  if (end < 1) return [];
  let start = end;
  while (start > 0 && d.t[start - 1] >= t - window) {
    const jump = Math.hypot(d.x[start] - d.x[start - 1], d.y[start] - d.y[start - 1]);
    if (jump > maxStep) break;
    start -= 1;
  }
  const out: Pos[] = [];
  for (let i = start; i <= end; i += 1) out.push({ x: d.x[i], y: d.y[i] });
  const p = posAt(d, t, maxStep);
  if (p && end < d.t.length - 1) out.push(p);
  return out;
}

export type GapTable = Map<number, { t: number[]; gap: number[] }>;

/** Build per-driver sorted gap series from the /session/gaps payload. */
export function buildGapTable(points: SessionGap[]): GapTable {
  const table: GapTable = new Map();
  for (const p of points) {
    if (p.gap_to_leader == null || Number.isNaN(p.gap_to_leader)) continue;
    const entry = table.get(p.driver_number) ?? { t: [], gap: [] };
    entry.t.push(p.t);
    entry.gap.push(p.gap_to_leader);
    table.set(p.driver_number, entry);
  }
  return table;
}

/** Latest known gap for a driver at time t (interpolated between samples).
 *
 *  Before the first sample (lights out, timing not yet live) we use that first
 *  sample: it is the real initial state, not an invention. */
export function gapAt(table: GapTable, driver: number, t: number): number | null {
  const entry = table.get(driver);
  if (!entry || !entry.t.length) return null;
  const i = indexAt(entry.t, t);
  if (i < 0) return entry.gap[0];
  if (i >= entry.t.length - 1) return entry.gap[i];
  const t0 = entry.t[i];
  const t1 = entry.t[i + 1];
  const f = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
  return entry.gap[i] + (entry.gap[i + 1] - entry.gap[i]) * f;
}

export interface LapMarker {
  lap_number: number;
  index: number;
  t: number;
}

/** Current lap and total at time t from sequential lap markers. */
export function lapAt(markers: LapMarker[], t: number): { lap: number; total: number } {
  if (!markers.length) return { lap: 0, total: 0 };
  const total = markers[markers.length - 1].index ?? markers.length;
  let lap = 0;
  for (const m of markers) {
    if (m.t <= t) lap = m.index ?? m.lap_number;
    else break;
  }
  return { lap, total };
}

/** Format a session clock as H:MM:SS (or MM:SS under an hour). */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return `${h ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}
