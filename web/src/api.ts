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
  SessionInfo,
  Stint,
} from "./types";

const BASE = "/api";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
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
