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
  time: number;
  position: number;
}

export interface SimDriver {
  id: string;
  overall: number;
  player: number | null;
  grid: number;
  startDelay: number;
  lapTimes: number[];
  finishTime: number;
}

export interface RaceResult {
  driverId: string;
  position: number;
  player: number | null;
  time: number;
  gap: number;
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
  }[];
}

export interface RaceSim {
  grid: QualiRow[];
  drivers: SimDriver[];
  laps: number;
  baseLap: number;
  duration: number;
  preview: RaceResult[];
}

export const GAME_MODEL =
  "64% driver form + 36% team form · seeded variation · not a prediction";

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

export function simulateQualifying(drivers: GameDriver[], seed: number): QualiRow[] {
  const rng = mulberry32(seed ^ 0xa5a5a5a5);
  return drivers
    .map((driver) => ({
      driverId: driver.id,
      time: 90 + (1 - driver.overall) * 6 + gaussian(rng) * 0.42,
      position: 0,
    }))
    .sort((a, b) => a.time - b.time)
    .map((row, index) => ({ ...row, position: index + 1 }));
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
      finishTime: startDelay + lapTimes.reduce((sum, value) => sum + value, 0),
    };
  });
  const ordered = [...sims].sort((a, b) => a.finishTime - b.finishTime);
  const preview: RaceResult[] = ordered.map((sim, index) => ({
    driverId: sim.id,
    position: index + 1,
    player: sim.player,
    time: sim.finishTime,
    gap: sim.finishTime - ordered[0].finishTime,
  }));
  return {
    grid,
    drivers: sims,
    laps,
    baseLap,
    duration: Math.max(...sims.map((s) => s.finishTime)) + 0.5,
    preview,
  };
}

/**
 * Continuous race state at t seconds. Progress is measured in laps; a faster
 * car travels further by the same clock. There is no collision model in v1.
 */
export function raceState(sim: RaceSim, elapsed: number): RaceState {
  const t = Math.max(0, elapsed);
  const rows = sim.drivers.map((driver) => {
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
    const finished = lapProgress >= sim.laps;
    return {
      driverId: driver.id,
      position: 0,
      progress: finished ? sim.laps : Math.max(0, Math.min(sim.laps, lapProgress)),
      lap: Math.min(sim.laps, Math.floor(lapProgress) + 1),
      gap: 0,
      player: driver.player,
      finished,
    };
  });

  const finishById = new Map(sim.drivers.map((driver) => [driver.id, driver.finishTime]));
  rows.sort((a, b) => {
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
