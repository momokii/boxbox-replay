/** Pit-stop distribution helpers. Descriptive only. */

export interface StopLike {
  driver_number: number;
  lap_number: number | null;
  stop_duration: number | null;
}

export interface PitStats {
  count: number;
  median: number | null;
  best: number | null;
  outliers: StopLike[];
}

export function pitStats(stops: StopLike[]): PitStats {
  const timed = stops
    .filter((stop): stop is StopLike & { stop_duration: number } => stop.stop_duration != null)
    .filter((stop) => stop.stop_duration > 0 && stop.stop_duration < 120);
  if (!timed.length) return { count: 0, median: null, best: null, outliers: [] };
  const durations = timed.map((stop) => stop.stop_duration).sort((a, b) => a - b);
  const middle = Math.floor(durations.length / 2);
  const median =
    durations.length % 2
      ? durations[middle]
      : (durations[middle - 1] + durations[middle]) / 2;
  return {
    count: timed.length,
    median,
    best: durations[0],
    outliers: timed.filter((stop) => stop.stop_duration > median * 1.5),
  };
}
