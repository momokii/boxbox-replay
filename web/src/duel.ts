/**
 * Lap-duel maths: two laps share one 600-point progress grid from the API.
 * A trace point is [progress 0..1, x, y, seconds since lap start].
 *
 * Everything here is pure so the canvas and the readout agree by construction.
 */

import type { Lap } from "./types";

export type TracePoint = [number, number, number, number];
export type DeltaPoint = [number, number];

export interface DuelPayload {
  points: number;
  a: { driver_number: number; lap: number; lap_duration: number | null };
  b: { driver_number: number; lap: number; lap_duration: number | null };
  traces: { a: TracePoint[]; b: TracePoint[] };
  delta: DeltaPoint[];
}

export type Leader = "a" | "b" | "tie";

export interface DuelFrame {
  fa: number;
  fb: number;
  leader: Leader;
  /** Seconds the trailing car is behind the leader at the leader's position. */
  signed: number;
  gap: number;
}

/** Progress of a lap at wall-clock `t` seconds from its start, clamped. */
export function progressAt(trace: TracePoint[], t: number): number {
  if (!trace.length) return 0;
  if (t <= trace[0][3]) return trace[0][0];
  const last = trace[trace.length - 1];
  if (t >= last[3]) return last[0];

  let lo = 0;
  let hi = trace.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (trace[mid][3] <= t) lo = mid;
    else hi = mid;
  }
  const t0 = trace[lo][3];
  const span = trace[hi][3] - t0;
  if (span <= 0) return trace[hi][0];
  return trace[lo][0] + ((t - t0) / span) * (trace[hi][0] - trace[lo][0]);
}

/** Position on the circuit at a given progress fraction. */
export function pointAt(trace: TracePoint[], f: number): [number, number] {
  if (!trace.length) return [0, 0];
  if (f <= 0) return [trace[0][1], trace[0][2]];
  const last = trace[trace.length - 1];
  if (f >= 1) return [last[1], last[2]];

  let lo = 0;
  let hi = trace.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (trace[mid][0] <= f) lo = mid;
    else hi = mid;
  }
  const span = trace[hi][0] - trace[lo][0];
  const k = span <= 0 ? 1 : (f - trace[lo][0]) / span;
  return [
    trace[lo][1] + (trace[hi][1] - trace[lo][1]) * k,
    trace[lo][2] + (trace[hi][2] - trace[lo][2]) * k,
  ];
}

/** Delta in seconds at a progress fraction (positive means A is behind). */
export function deltaAt(delta: DeltaPoint[], f: number): number {
  if (!delta.length) return 0;
  const first = delta[0];
  const last = delta[delta.length - 1];
  if (f <= first[0]) return first[1];
  if (f >= last[0]) return last[1];

  let lo = 0;
  let hi = delta.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (delta[mid][0] <= f) lo = mid;
    else hi = mid;
  }
  const span = delta[hi][0] - delta[lo][0];
  if (span <= 0) return delta[hi][1];
  return delta[lo][1] + ((f - delta[lo][0]) / span) * (delta[hi][1] - delta[lo][1]);
}

/** Who leads at `t`, and by how much, at the leader's position on track. */
export function frameAt(payload: DuelPayload, t: number): DuelFrame {
  const fa = progressAt(payload.traces.a, t);
  const fb = progressAt(payload.traces.b, t);
  const leader: Leader = Math.abs(fa - fb) < 1e-9 ? "tie" : fa > fb ? "a" : "b";
  const signed = deltaAt(payload.delta, Math.max(fa, fb));
  return { fa, fb, leader, signed, gap: Math.abs(signed) };
}

/** A driver's fastest timed lap, or null when the session has no usable lap. */
export function fastestLap(laps: Lap[], driver: number): Lap | null {
  let best: Lap | null = null;
  for (const lap of laps) {
    if (lap.driver_number !== driver) continue;
    const time = lap.lap_duration;
    if (time == null || !Number.isFinite(time) || time <= 0) continue;
    if (!best || (best.lap_duration ?? Infinity) > time) best = lap;
  }
  return best;
}

/** Two drivers to open the duel with: followed ones first, then the front. */
export function defaultPair(
  driverNumbers: number[],
  laps: Lap[],
  preferred: number[],
): [number, number] {
  const eligible = driverNumbers.filter((n) => fastestLap(laps, n) != null);
  const pool = eligible.length ? eligible : driverNumbers;
  const first =
    preferred.find((n) => pool.includes(n)) ?? pool[0] ?? 0;
  const second =
    preferred.find((n) => n !== first && pool.includes(n)) ??
    pool.find((n) => n !== first) ??
    first;
  return [first, second];
}

/** Rotate a point the same way the session outline was rotated. */
export function rotatePoint(x: number, y: number, deg: number): [number, number] {
  if (!deg) return [x, y];
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
}
