/** Least-squares degradation slope (s/lap) over timed laps. Throws under 2 laps. */
export function tyreSlope(laps: { lap_number: number; lap_duration: number | null }[]): number {
  const timed = laps
    .filter((l) => l.lap_duration != null && !Number.isNaN(l.lap_duration))
    .sort((a, b) => a.lap_number - b.lap_number);
  if (timed.length < 2) throw new Error("need at least 2 timed laps");
  const xs = timed.map((l) => l.lap_number);
  const ys = timed.map((l) => l.lap_duration as number);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const den = xs.reduce((s, x) => s + (x - mx) * (x - mx), 0);
  return num / den;
}

/** Median of the last n timed laps (current pace). */
export function recentPace(
  laps: { lap_number: number; lap_duration: number | null }[],
  n = 3,
): number | null {
  const timed = laps
    .filter((l) => l.lap_duration != null && !Number.isNaN(l.lap_duration))
    .sort((a, b) => a.lap_number - b.lap_number)
    .slice(-n)
    .map((l) => l.lap_duration as number);
  if (!timed.length) return null;
  const sorted = [...timed].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
