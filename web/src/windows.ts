/** Pure time-window helpers shared by Telemetry and Battle. */

export interface LapMarker {
  lap_number: number;
  t: number;
}

export function sortedLaps(laps: LapMarker[]): LapMarker[] {
  return [...laps].sort((a, b) => a.lap_number - b.lap_number);
}

export function markerIndex(laps: LapMarker[], fixedLap: number | null): number {
  const index = laps.findIndex((lap) => lap.lap_number === fixedLap);
  return index >= 0 ? index : 0;
}

export function telemetryWindow(
  scope: "replay" | "lap" | "session",
  replayStart: number,
  replayEnd: number,
  lapMarkers: LapMarker[],
  fixedLap: number | null,
  duration: number,
): { start: number; end: number } {
  if (scope === "session") return { start: 0, end: Math.max(1, duration) };
  const laps = sortedLaps(lapMarkers);
  if (scope === "lap" && laps.length) {
    const index = markerIndex(laps, fixedLap);
    const start = laps[index].t;
    const end = laps[index + 1]?.t ?? Math.max(start + 1, duration);
    return { start, end };
  }
  return { start: replayStart, end: replayEnd };
}

export function battleTime(
  scope: "replay" | "lap",
  replayNow: number,
  lapMarkers: LapMarker[],
  fixedLap: number | null,
): number {
  if (scope === "replay") return replayNow;
  const laps = sortedLaps(lapMarkers);
  if (!laps.length) return replayNow;
  return laps[markerIndex(laps, fixedLap)]?.t ?? replayNow;
}
