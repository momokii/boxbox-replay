import type { StandingsConstructor, StandingsDriver, StandingsPayload } from "./types";

export type GameLaps = 3 | 5 | 10;

export interface GameDriver {
  id: string;
  code: string;
  name: string;
  team: string;
  number: string | null;
  color: string;
  points: number;
  position: number;
  driverScore: number;
  teamScore: number;
  overall: number;
}

export interface GameSetup {
  laps: GameLaps;
  players: number;
  quali: boolean;
  seed: number;
}

export interface QualiRow {
  driverId: string;
  /** Best of the seeded flying laps; this is the grid time. */
  time: number;
  /** Two seeded attempts per driver, in run order. */
  attempts: number[];
  position: number;
}

export type RaceEventKind = "SC" | "VSC" | "CRASH";

export const RACE_EVENT_LOSS: Record<"SC" | "VSC", number> = { SC: 12, VSC: 4.5 };

export interface RaceEvent {
  id: string;
  t: number;
  lap: number;
  kind: RaceEventKind;
  label: string;
  driverId?: string;
}

export interface SimDriver {
  id: string;
  overall: number;
  player: number | null;
  grid: number;
  startDelay: number;
  lapTimes: number[];
  finishTime: number;
  retiredAt: number | null;
  retiredLap: number | null;
}

export interface RaceResult {
  driverId: string;
  position: number;
  player: number | null;
  time: number;
  gap: number;
  retired: boolean;
}

export interface RaceState {
  elapsed: number;
  leaderId: string | null;
  finished: boolean;
  rows: {
    driverId: string;
    position: number;
    progress: number;
    lap: number;
    gap: number;
    player: number | null;
    finished: boolean;
    retired: boolean;
  }[];
}

export interface RaceSim {
  grid: QualiRow[];
  drivers: SimDriver[];
  laps: number;
  baseLap: number;
  duration: number;
  preview: RaceResult[];
  events: RaceEvent[];
}

export interface DriverLapStat {
  lap: number;
  /** Null on the retirement lap: the lap was not completed. */
  time: number | null;
  /** Model time at the end of this lap, including the driver's start delay. */
  raceTime: number;
  position: number;
  gap: number;
  status: "completed" | "DNF";
  event: RaceEventKind | null;
}

export const GAME_MODEL =
  "64% driver form + 36% team form · seeded variation · not a prediction";

/** Wall-clock seconds per lap at 1×. A viewing pace, never a real-time claim. */
export const GAME_SECONDS_PER_LAP = 20;

/** Two seeded flying laps; the best one sets the grid. */
export const QUALI_ATTEMPTS = 2;

const TEAM_COLORS: Record<string, string> = {
  "red bull": "#4781D7",
  "red bull racing": "#4781D7",
  ferrari: "#E8002D",
  mercedes: "#00D7B6",
  mclaren: "#FF8000",
  "aston martin": "#229971",
  alpine: "#00A1E8",
  williams: "#64C4FF",
  rb: "#6692FF",
  "racing bulls": "#6692FF",
  sauber: "#52E252",
  audi: "#F50537",
  haas: "#B6BABD",
  cadillac: "#909090",
  "alfa romeo": "#C92D4B",
  alphatauri: "#5E8FAA",
  "toro rosso": "#5E8FAA",
};

function colorFor(team: string): string {
  const key = team.toLowerCase().trim();
  if (TEAM_COLORS[key]) return TEAM_COLORS[key];
  const found = Object.entries(TEAM_COLORS).find(([name]) => key.includes(name) || name.includes(key));
  if (found) return found[1];
  let hash = 0;
  for (const char of team) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 62% 56%)`;
}

function clamp(value: number, lo = 0.05, hi = 1): number {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * Build the game field from the same championship table the app already shows.
 *
 * The weights are intentionally visible: driver form is 58% points + 42%
 * position, then overall is 64% driver + 36% team. This is a game model, not a
 * prediction, and the UI states that.
 */
export function buildGameDrivers(standings: StandingsPayload): GameDriver[] {
  const drivers = standings.drivers ?? [];
  const teams = standings.constructors ?? [];
  if (!drivers.length) return [];
  const maxPoints = Math.max(1, ...drivers.map((d) => d.points));
  const teamByKey = new Map<string, StandingsConstructor>();
  for (const team of teams) teamByKey.set(team.name.toLowerCase(), team);
  const maxTeamPoints = Math.max(1, ...teams.map((t) => t.points));
  const count = Math.max(2, drivers.length);

  return drivers
    .map((row: StandingsDriver) => {
      const positionScore = 1 - (Math.max(1, row.position) - 1) / (count - 1);
      const pointsScore = row.points / maxPoints;
      const driverScore = 0.58 * pointsScore + 0.42 * positionScore;
      const team =
        teamByKey.get(row.constructor.toLowerCase()) ??
        [...teamByKey.values()].find(
          (t) =>
            t.name.toLowerCase().includes(row.constructor.toLowerCase()) ||
            row.constructor.toLowerCase().includes(t.name.toLowerCase()),
        );
      const teamScore = team ? team.points / maxTeamPoints : 0.35;
      return {
        id: row.driver_id || row.code,
        code: row.code || row.name.slice(0, 3).toUpperCase(),
        name: row.name,
        team: row.constructor,
        number: row.number ?? null,
        color: colorFor(row.constructor),
        points: row.points,
        position: row.position,
        driverScore,
        teamScore,
        overall: clamp(0.64 * driverScore + 0.36 * teamScore),
      };
    })
    .sort((a, b) => b.overall - a.overall || a.position - b.position);
}

/** Small deterministic PRNG; no Math.random anywhere in the game engine. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number): number {
  // Box-Muller, bounded at 3σ; repeatable given the same rng sequence.
  const u = Math.max(1e-9, rng());
  const v = rng();
  return Math.max(-3, Math.min(3, Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)));
}

/** Fractional circuit position for a lap-based progress value (0…laps). */
export function lapFraction(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  const value = progress % 1;
  return value < 0 ? value + 1 : value;
}

export function simulateQualifying(drivers: GameDriver[], seed: number): QualiRow[] {
  const rng = mulberry32(seed ^ 0xa5a5a5a5);
  return drivers
    .map((driver) => {
      const base = 90 + (1 - driver.overall) * 6;
      const attempts = Array.from(
        { length: QUALI_ATTEMPTS },
        () => base + gaussian(rng) * 0.42,
      );
      return {
        driverId: driver.id,
        time: Math.min(...attempts),
        attempts,
        position: 0,
      };
    })
    .sort((a, b) => a.time - b.time)
    .map((row, index) => ({ ...row, position: index + 1 }));
}

/**
 * Convert model seconds into the wall-clock scale used by the Grid player.
 * At 1× a lap should take GAME_SECONDS_PER_LAP, regardless of incident losses.
 */
export function gameClockScale(duration: number, laps: number): number {
  const wallSeconds = Math.max(1, laps) * GAME_SECONDS_PER_LAP;
  return Math.max(1e-6, duration / wallSeconds);
}

/**
 * Per-lap model statistics for one driver. A retirement row stops at the
 * retirement lap and carries a null lap time rather than pretending the
 * partial lap was completed.
 */
export function driverLapHistory(sim: RaceSim, driverId: string): DriverLapStat[] {
  const driver = sim.drivers.find((item) => item.id === driverId);
  if (!driver) return [];
  const lastLap = driver.retiredLap ?? sim.laps;
  const rows: DriverLapStat[] = [];
  let raceTime = driver.startDelay;
  for (let lap = 1; lap <= lastLap; lap += 1) {
    const retirementLap = driver.retiredLap === lap;
    const lapTime = driver.lapTimes[lap - 1] ?? 0;
    raceTime += retirementLap ? lapTime * 0.9 : lapTime;
    const state = raceState(sim, raceTime);
    const row = state.rows.find((item) => item.driverId === driverId);
    const event = sim.events.find(
      (item) => item.lap === lap && (item.driverId == null || item.driverId === driverId),
    );
    rows.push({
      lap,
      time: retirementLap ? null : lapTime,
      raceTime,
      position: row?.position ?? 0,
      gap: row?.gap ?? 0,
      status: retirementLap ? "DNF" : "completed",
      event: event?.kind ?? null,
    });
  }
  return rows;
}

/** Visual playback factor after an incident; never changes model results. */
export function incidentPlaybackFactor(
  kind: RaceEventKind | null,
  since: number,
): number {
  if (!kind || since < 0) return 1;
  if (kind === "SC" && since <= 12) return 0.35;
  if (kind === "VSC" && since <= 8) return 0.45;
  return 1;
}

/** One person gets one driver; duplicate driver ids are rejected, not replaced. */
export function validatePlayerDrivers(playerDrivers: string[]): string | null {
  if (!playerDrivers.length) return "Pick at least one player driver.";
  if (playerDrivers.some((id) => !id)) return "Every player needs a driver.";
  if (new Set(playerDrivers).size !== playerDrivers.length) {
    return "Each player must have a different driver.";
  }
  return null;
}

export function simulateRace(
  drivers: GameDriver[],
  grid: QualiRow[],
  laps: number,
  seed: number,
  playerDrivers: string[] = [],
): RaceSim {
  const rng = mulberry32(seed ^ 0x5eed5eed);
  const gridPosition = new Map(grid.map((row) => [row.driverId, row.position]));
  const player = new Map(playerDrivers.map((id, index) => [id, index + 1]));
  const baseLap = 90;
  const sims: SimDriver[] = drivers.map((driver) => {
    const gridPos = gridPosition.get(driver.id) ?? drivers.length;
    const startDelay = Math.max(0, (gridPos - 1) * 0.22 + gaussian(rng) * 0.08);
    const lapTimes: number[] = [];
    for (let lap = 0; lap < laps; lap += 1) {
      const launch = lap === 0 ? gaussian(rng) * 1.3 : 0;
      lapTimes.push(baseLap + (1 - driver.overall) * 6 + launch + gaussian(rng) * 0.75);
    }
    return {
      id: driver.id,
      overall: driver.overall,
      player: player.get(driver.id) ?? null,
      grid: gridPos,
      startDelay,
      lapTimes,
      finishTime: 0,
      retiredAt: null,
      retiredLap: null,
    };
  });

  // Seeded race-control incidents. These are game events, not a claim about the
  // simulated source session.
  const eventRng = mulberry32(seed ^ 0x7f4a7c15);
  const events: RaceEvent[] = [];
  const lossByLap = new Map<number, number>();
  const retiredLap = new Map<string, number>();
  for (let lap = 2; lap <= laps; lap += 1) {
    const roll = eventRng();
    if (roll < 0.13) {
      const kind: RaceEventKind = eventRng() < 0.5 ? "SC" : "VSC";
      const loss = RACE_EVENT_LOSS[kind];
      lossByLap.set(lap, loss);
      events.push({
        id: `${kind.toLowerCase()}-${lap}`,
        t: (lap - 1) * baseLap,
        lap,
        kind,
        label: kind === "SC"
          ? `Safety car — ${RACE_EVENT_LOSS.SC}s added to the lap`
          : `Virtual safety car — ${RACE_EVENT_LOSS.VSC}s added to the lap`,
      });
    } else if (roll < 0.21) {
      const active = sims.filter((driver) => !retiredLap.has(driver.id));
      if (active.length) {
        const victim = active[Math.floor(eventRng() * active.length)];
        const driver = drivers.find((d) => d.id === victim.id);
        retiredLap.set(victim.id, lap);
        events.push({
          id: `crash-${lap}-${victim.id}`,
          t: (lap - 1) * baseLap + baseLap * 0.45,
          lap,
          kind: "CRASH",
          label: `Crash — ${driver?.code ?? victim.id} retires`,
          driverId: victim.id,
        });
      }
    }
  }

  for (const [lap, loss] of lossByLap) {
    for (const driver of sims) {
      if (lap <= (retiredLap.get(driver.id) ?? laps)) driver.lapTimes[lap - 1] += loss;
    }
  }

  for (const driver of sims) {
    const lastLap = retiredLap.get(driver.id);
    if (lastLap != null) {
      const completed = driver.lapTimes.slice(0, lastLap - 1).reduce((sum, value) => sum + value, 0);
      driver.retiredLap = lastLap;
      driver.retiredAt = driver.startDelay + completed + driver.lapTimes[lastLap - 1] * 0.9;
      driver.finishTime = driver.retiredAt;
    } else {
      driver.finishTime = driver.startDelay + driver.lapTimes.reduce((sum, value) => sum + value, 0);
    }
  }

  const active = sims.filter((driver) => driver.retiredAt == null).sort((a, b) => a.finishTime - b.finishTime);
  const retired = sims.filter((driver) => driver.retiredAt != null).sort((a, b) => (a.retiredAt ?? 0) - (b.retiredAt ?? 0));
  const ordered = [...active, ...retired];
  const preview: RaceResult[] = ordered.map((sim, index) => ({
    driverId: sim.id,
    position: index + 1,
    player: sim.player,
    time: sim.finishTime,
    gap: active.length ? Math.max(0, sim.finishTime - active[0].finishTime) : 0,
    retired: sim.retiredAt != null,
  }));
  return {
    grid,
    drivers: sims,
    laps,
    baseLap,
    duration: Math.max(...sims.map((s) => s.finishTime)) + 0.5,
    preview,
    events,
  };
}

/**
 * Continuous race state at t seconds. Progress is measured in laps; a faster
 * car travels further by the same clock. There is no collision model in v1.
 */
export function raceState(sim: RaceSim, elapsed: number): RaceState {
  const t = Math.max(0, elapsed);
  const rows = sim.drivers.map((driver) => {
    const retired = driver.retiredAt != null && t >= driver.retiredAt;
    const local = t - driver.startDelay;
    let lapProgress = 0;
    let consumed = 0;
    for (const lapTime of driver.lapTimes) {
      if (local <= consumed) break;
      const done = local - consumed;
      if (done >= lapTime) {
        lapProgress += 1;
        consumed += lapTime;
      } else {
        lapProgress += done / lapTime;
        consumed += lapTime;
      }
    }
    const finished = !retired && lapProgress >= sim.laps;
    return {
      driverId: driver.id,
      position: 0,
      progress: retired ? (driver.retiredLap ?? 0) - 0.05 : finished ? sim.laps : Math.max(0, Math.min(sim.laps, lapProgress)),
      lap: retired ? (driver.retiredLap ?? 1) : Math.min(sim.laps, Math.floor(lapProgress) + 1),
      gap: 0,
      player: driver.player,
      finished,
      retired,
    };
  });

  const finishById = new Map(sim.drivers.map((driver) => [driver.id, driver.finishTime]));
  rows.sort((a, b) => {
    if (a.retired !== b.retired) return a.retired ? 1 : -1;
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    if (a.finished && b.finished) {
      return (finishById.get(a.driverId) ?? 0) - (finishById.get(b.driverId) ?? 0);
    }
    return b.progress - a.progress;
  });
  const leader = rows[0];
  rows.forEach((row, index) => {
    row.position = index + 1;
    row.gap = Math.max(0, (leader.progress - row.progress) * sim.baseLap);
  });
  return {
    elapsed: t,
    leaderId: leader?.driverId ?? null,
    finished: rows.every((row) => row.finished),
    rows,
  };
}
