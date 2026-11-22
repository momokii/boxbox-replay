import type { PitStop } from "./api";
import type { ReplayDriver } from "./types";

export interface PitPath {
  points: number[][];
  source: "recorded" | "schematic";
}

function rotate(x: number, y: number, deg: number): { x: number; y: number } {
  if (!deg) return { x, y };
  const a = (deg * Math.PI) / 180;
  return { x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) };
}

/**
 * A pit-lane guide for the map.
 *
 * Preference order:
 *  1. a representative car's recorded pit transit from /location, rotated
 *     into the circuit frame (the docs call location approximate);
 *  2. an explicitly marked schematic offset from the start/finish straight.
 *
 * This is never used as a measured racing line. Cars stay at their recorded
 * positions; the path is a guide.
 */
export function buildPitPath(
  replay: Map<number, ReplayDriver>,
  stops: PitStop[],
  angle: number,
  outline: number[][],
  schematicOffset = 0.9,
): PitPath | null {
  const outlineLength = outline.reduce((sum, point, i) => {
    const next = outline[(i + 1) % outline.length];
    return sum + Math.hypot(next[0] - point[0], next[1] - point[1]);
  }, 0);
  const candidates: { points: number[][]; length: number }[] = [];
  for (const stop of stops) {
    const driver = replay.get(stop.driver_number);
    if (!driver) continue;
    const lane = stop.pit_duration ?? 25;
    const from = stop.t;
    const to = stop.t + Math.max(8, lane) + 4;
    const raw: number[][] = [];
    for (let i = 0; i < driver.t.length; i += 1) {
      if (driver.t[i] < from || driver.t[i] > to) continue;
      const p = rotate(driver.x[i], driver.y[i], -angle);
      const prev = raw[raw.length - 1];
      if (prev && Math.hypot(p.x - prev[0], p.y - prev[1]) < 1e-6) continue;
      raw.push([p.x, p.y]);
    }
    if (raw.length < 6) continue;
    let length = 0;
    for (let i = 1; i < raw.length; i += 1) {
      length += Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]);
    }
    // A real pit transit is a short guide, not another lap. If the feed hands
    // us a lap-sized window, reject it instead of drawing a second racing line.
    if (length > 0 && (outlineLength === 0 || length < outlineLength * 0.11)) {
      candidates.push({ points: raw, length });
    }
  }
  if (candidates.length) {
    candidates.sort((a, b) => b.points.length - a.points.length || b.length - a.length);
    return { points: candidates[0].points, source: "recorded" };
  }

  if (outline.length < 10) return null;
  const n = Math.max(10, Math.round(outline.length * 0.12));
  const points: number[][] = [];
  for (let i = 0; i < n; i += 1) {
    const cur = outline[i];
    const prev = outline[(i - 1 + outline.length) % outline.length];
    const next = outline[(i + 1) % outline.length];
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    points.push([cur[0] + (-dy / len) * schematicOffset, cur[1] + (dx / len) * schematicOffset]);
  }
  return points.length >= 2 ? { points, source: "schematic" } : null;
}

/** Whether a recorded pit transit is active for the HUD/ring. */
export function inPitWindow(stop: PitStop, t: number): boolean {
  const lane = stop.pit_duration ?? 25;
  return t >= stop.t && t <= stop.t + Math.max(5, lane);
}
