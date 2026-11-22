import type { PitStop } from "./api";

export interface PitPath {
  points: number[][];
  source: "schematic";
}

/**
 * A short, explicitly schematic pit-lane guide.
 *
 * v4.0 tried to use a recorded `/location` transit. OpenF1 documents no lateral
 * placement, and the recorded path could read as a second circuit. The honest
 * v4.1 guide is a short solid offset beside the start/finish section; it is
 * never described as measured geometry.
 */
export function buildPitPath(
  outline: number[][],
  offsetFraction = 0.009,
): PitPath | null {
  if (outline.length < 10) return null;
  const xs = outline.map((p) => p[0]);
  const ys = outline.map((p) => p[1]);
  const span = Math.max(1, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const offset = span * offsetFraction;
  const n = Math.min(40, Math.max(8, Math.round(outline.length * 0.05)));
  const points: number[][] = [];
  for (let i = 0; i < n; i += 1) {
    const cur = outline[i];
    const prev = outline[(i - 1 + outline.length) % outline.length];
    const next = outline[(i + 1) % outline.length];
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    points.push([cur[0] + (-dy / len) * offset, cur[1] + (dx / len) * offset]);
  }
  return points.length >= 2 ? { points, source: "schematic" } : null;
}

/** Whether a recorded pit transit is active for the HUD/ring. */
export function inPitWindow(stop: PitStop, t: number): boolean {
  const lane = stop.pit_duration ?? 25;
  return t >= stop.t && t <= stop.t + Math.max(5, lane);
}
