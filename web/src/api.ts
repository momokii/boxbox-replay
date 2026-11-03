import type {
  CoachReply,
  CornerLoss,
  Driver,
  Geometry,
  IntervalPoint,
  Lap,
  LapPoint,
  LocPoint,
  Meeting,
  ReplayPayload,
  SessionGaps,
  SessionInfo,
  SessionInfoFull,
  SpeedPoint,
  Stint,
} from "./types";
import type { DuelPayload } from "./duel";

const BASE = "/api";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new ApiError(`${path} -> ${res.status}`, res.status);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  years: () => get<number[]>("/years"),
  meetings: (year: number) => get<Meeting[]>(`/meetings?year=${year}`),
  sessions: (year: number, meetingKey: number) =>
    get<SessionInfo[]>(`/sessions?year=${year}&meeting_key=${meetingKey}`),
  sessionStatus: (keys: number[]) =>
    get<Record<string, string>>(`/sessions/status?keys=${keys.join(",")}`),
  drivers: (sessionKey: number) => get<Driver[]>(`/drivers?session_key=${sessionKey}`),
  laps: (sessionKey: number, driver?: number) =>
    get<Lap[]>(`/laps?session_key=${sessionKey}${driver ? `&driver_number=${driver}` : ""}`),
  lapWindow: (sessionKey: number, driver: number, lap: number) =>
    get<{ start: string; end: string | null }>(
      `/lap-window?session_key=${sessionKey}&driver_number=${driver}&lap=${lap}`,
    ),
  car: (sessionKey: number, driver: number, lap?: number, start?: string, end?: string) =>
    get<LapPoint[]>(
      `/car?session_key=${sessionKey}&driver_number=${driver}` +
        (lap != null ? `&lap=${lap}` : start && end ? `&start=${start}&end=${end}` : ""),
    ),
  location: (sessionKey: number, driver: number, lap?: number, start?: string, end?: string) =>
    get<LocPoint[]>(
      `/location?session_key=${sessionKey}&driver_number=${driver}` +
        (lap != null ? `&lap=${lap}` : start && end ? `&start=${start}&end=${end}` : ""),
    ),
  geometry: (sessionKey: number, driver: number, lap: number) =>
    get<Geometry>(`/geometry?session_key=${sessionKey}&driver_number=${driver}&lap=${lap}`),
  intervals: (sessionKey: number) => get<IntervalPoint[]>(`/intervals?session_key=${sessionKey}`),
  stints: (sessionKey: number) => get<Stint[]>(`/stints?session_key=${sessionKey}`),
  weather: (sessionKey: number) => get<Record<string, unknown>[]>(`/weather?session_key=${sessionKey}`),
  radio: (sessionKey: number) => get<Record<string, unknown>[]>(`/radio?session_key=${sessionKey}`),
  raceControl: (sessionKey: number) =>
    get<Record<string, unknown>[]>(`/race-control?session_key=${sessionKey}`),
  sessionInfo: (sessionKey: number) => get<SessionInfoFull>(`/session/info?session_key=${sessionKey}`),
  sessionGeometry: (sessionKey: number) =>
    get<Geometry & { driver: number; lap: number }>(`/session/geometry?session_key=${sessionKey}`),
  sessionReplay: (sessionKey: number, refresh = false) =>
    get<ReplayPayload>(`/session/replay?session_key=${sessionKey}${refresh ? "&refresh=1" : ""}`),
  sessionGaps: (sessionKey: number) =>
    get<SessionGaps>(`/session/gaps?session_key=${sessionKey}`),
  sessionSpeed: (sessionKey: number, driver: number) =>
    get<SpeedPoint[]>(`/session/speed?session_key=${sessionKey}&driver_number=${driver}`),
  duel: (sessionKey: number, aDriver: number, aLap: number, bDriver: number, bLap: number) =>
    get<DuelPayload>(
      `/session/duel?session_key=${sessionKey}&a_driver=${aDriver}&a_lap=${aLap}` +
        `&b_driver=${bDriver}&b_lap=${bLap}`,
    ),
  sessionPit: (sessionKey: number) =>
    get<{ summary: PitStopSummary[]; stops: PitStop[] }>(`/session/pit?session_key=${sessionKey}`),
  sessionPositions: (sessionKey: number) =>
    get<PositionRow[]>(`/session/positions?session_key=${sessionKey}`),
  sessionOvertakes: (sessionKey: number) =>
    get<{ counts: { driver_number: number; made: number; lost: number }[]; events: OvertakeRow[] }>(
      `/session/overtakes?session_key=${sessionKey}`,
    ),
  sessionResult: (sessionKey: number) =>
    get<SessionResultRow[]>(`/session/result?session_key=${sessionKey}`),
  cornerLoss: (body: {
    session_key: number;
    ref: { driver: number; lap: number };
    chal: { driver: number; lap: number };
    corner: string;
  }) => post<CornerLoss>("/corner-loss", body),
  pitCall: (body: {
    base_pace_s: number;
    fresh_pace_s: number;
    deg_slope_s_per_lap: number;
    laps_remaining: number;
    pit_loss_s: number;
    gap_behind_s: number | null;
  }) =>
    post<{
      stay_total_s: number;
      pit_total_s: number;
      recommendation: string;
      traffic_on_exit: boolean;
      toy_model: boolean;
    }>("/pit-call", body),
  coachAsk: (body: {
    driver: string;
    lap: number;
    ref_driver: string;
    ref_lap: number;
    corner: string;
    loss_s: number | null;
    lap_delta_s: number | null;
  }) => post<CoachReply>("/coach/ask", body),
};

export const tyreAtLap = (
  stints: import("./types").Stint[],
  driver: number,
  lap: number,
): { compound: string | null; start: number; end: number | null } | null => {
  const mine = stints.filter((s) => s.driver_number === driver);
  for (const s of mine) {
    const start = s.lap_start ?? 1;
    const end = s.lap_end ?? Number.MAX_SAFE_INTEGER;
    if (lap >= start && lap <= end) return { compound: s.compound, start, end: s.lap_end };
  }
  return null;
};

export interface PitStopSummary {
  driver_number: number;
  stops: number;
  best_stop_s: number | null;
  total_stop_s: number | null;
  laps: number[];
}

export interface PitStop {
  driver_number: number;
  t: number;
  lap_number: number | null;
  stop_duration: number | null;
  pit_duration: number | null;
}

export interface PositionRow {
  driver_number: number;
  t: number;
  position: number;
}

export interface OvertakeRow {
  t: number;
  overtaking_driver_number: number;
  overtaken_driver_number: number;
  position: number | null;
}

export interface SessionResultRow {
  position: number | null;
  driver_number: number;
  points: number | null;
  dnf: boolean;
  dns: boolean;
  dsq: boolean;
  duration: number | null;
  gap_text: string | null;
}
