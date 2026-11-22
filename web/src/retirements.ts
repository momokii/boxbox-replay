import type { SessionResultRow } from "./api";
import type { Lap } from "./types";

export type ExitStatus = "DNF" | "DNS" | "DSQ";

export interface DriverExit {
  status: ExitStatus;
  /** Replay-clock second after which the car must not be drawn. null = keep to the end. */
  outAt: number | null;
  lastLap: number | null;
}

const FALLBACK_LAP_S = 90;

function lapStartSeconds(lap: Lap, sessionStartMs: number, firstLapMs: number): number | null {
  if (!lap.date_start) return null;
  const ms = Date.parse(lap.date_start);
  if (Number.isNaN(ms)) return null;
  return (ms - sessionStartMs) / 1000 - (firstLapMs - sessionStartMs) / 1000;
}

/**
 * Turn the final classification into replay-clock exits.
 *
 * OpenF1 keeps returning parked positions for retired cars long after they
 * stopped. A DNF is not "out since lights out": hide the car after its last
 * recorded lap, not at t=0. DNS is the only status that exits at the start.
 *
 * The result feed is the source of the status; the lap feed supplies the
 * clock. If no lap timestamp exists, hide at 0 rather than guessing a later
 * time.
 */
export function buildDriverExits(
  result: SessionResultRow[],
  laps: Lap[],
  sessionStart: string | null | undefined,
): Map<number, DriverExit> {
  const startMs = sessionStart ? Date.parse(sessionStart) : NaN;
  const validStarts = laps
    .map((l) => (l.date_start ? Date.parse(l.date_start) : NaN))
    .filter((n) => Number.isFinite(n));
  const firstLapMs = validStarts.length ? Math.min(...validStarts) : NaN;

  const timed = laps
    .map((l) => l.lap_duration)
    .filter((n): n is number => n != null && Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  const medianLap = timed.length ? timed[Math.floor(timed.length / 2)] : FALLBACK_LAP_S;

  const out = new Map<number, DriverExit>();
  for (const row of result) {
    if (!row.dns && !row.dnf && !row.dsq) continue;
    if (row.dns) {
      out.set(row.driver_number, { status: "DNS", outAt: 0, lastLap: null });
      continue;
    }
    if (row.dsq) {
      // The feed does not say when a disqualification is applied. Keep the car
      // until the end and mark the final classification; never invent a clock.
      out.set(row.driver_number, { status: "DSQ", outAt: null, lastLap: null });
      continue;
    }

    const mine = laps
      .filter((l) => l.driver_number === row.driver_number)
      .sort((a, b) => {
        const at = a.date_start ? Date.parse(a.date_start) : Infinity;
        const bt = b.date_start ? Date.parse(b.date_start) : Infinity;
        return at - bt;
      });
    const last = mine[mine.length - 1];
    if (!last || !Number.isFinite(startMs) || !Number.isFinite(firstLapMs)) {
      out.set(row.driver_number, { status: "DNF", outAt: 0, lastLap: null });
      continue;
    }
    const lastT = lapStartSeconds(last, startMs, firstLapMs);
    if (lastT == null) {
      out.set(row.driver_number, { status: "DNF", outAt: 0, lastLap: last.lap_number });
      continue;
    }
    const duration =
      last.lap_duration != null && Number.isFinite(last.lap_duration) && last.lap_duration > 0
        ? last.lap_duration
        : medianLap;
    out.set(row.driver_number, {
      status: "DNF",
      outAt: lastT + Math.max(5, duration),
      lastLap: last.lap_number,
    });
  }
  return out;
}

/** True when a driver must be hidden at replay time t. */
export function isOffTrack(exit: DriverExit | undefined, t: number): boolean {
  if (!exit) return false;
  return exit.outAt != null && t >= exit.outAt;
}
