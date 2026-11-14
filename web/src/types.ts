export interface Meeting {
  meeting_key: number;
  meeting_name: string;
  location: string;
  sessions: number;
  date_start: string;
}

export interface SessionInfo {
  session_key: number;
  session_name: string;
  date_start: string;
}

export interface Driver {
  driver_number: number;
  name_acronym: string;
  team_name: string;
  team_colour: string;
  full_name?: string | null;
  country_code?: string | null;
}

export interface Lap {
  date_start?: string | null;
  driver_number: number;
  lap_number: number;
  lap_duration: number | null;
  duration_sector_1: number | null;
  duration_sector_2: number | null;
  duration_sector_3: number | null;
  is_pit_out_lap: boolean | null;
  segments_sector_1?: number[] | null;
  segments_sector_2?: number[] | null;
  segments_sector_3?: number[] | null;
}

export interface SectorFlags {
  driver_number: number;
  lap_number: number;
  s1_flag: string;
  s2_flag: string;
  s3_flag: string;
}

export interface LapPoint {
  t: number;
  date: string;
  speed: number;
  n_gear: number;
  throttle: number;
  brake: number;
  drs: number;
}

export interface LocPoint {
  t: number;
  date: string;
  x: number;
  y: number;
  z: number;
}

export interface Corner {
  label: string;
  x: number;
  y: number;
  idx: number;
}

export interface DrsZone {
  label: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Geometry {
  ax: string;
  ay: string;
  angle?: number;
  outline: number[][];
  corners: Corner[];
  zones: DrsZone[];
}

export interface IntervalPoint {
  date: string;
  driver_number: number;
  gap_to_leader: number | null;
}

export interface Stint {
  driver_number: number;
  stint_number: number;
  lap_start: number | null;
  lap_end: number | null;
  compound: string | null;
  tyre_age_at_start: number | null;
}

export interface CoachReply {
  answer: string;
  confidence: string;
  basis: string;
  llm: boolean;
}

export interface CornerLoss {
  corner: string;
  loss_s: number | null;
  flagged: boolean;
  confidence: string;
}

export interface SessionInfoFull {
  session_key: number;
  session_name: string | null;
  date_start: string;
  date_end: string;
  duration_s: number;
  total_laps: number;
  drivers: number;
}

export interface ReplayDriver {
  driver_number: number;
  t: number[];
  x: number[];
  y: number[];
}

export interface ReplayPayload {
  start: string;
  end: string;
  duration_s: number;
  hz: number;
  laps: { lap_number: number; index: number; t: number }[];
  drivers: ReplayDriver[];
  drivers_included: number;
  drivers_expected: number;
  positions_end_s: number;
}

export interface SessionGap {
  driver_number: number;
  t: number;
  gap_to_leader: number | null;
}

export interface SessionGaps {
  source: "intervals" | "lap_times" | "none";
  points: SessionGap[];
}

export interface SpeedPoint {
  t: number;
  v: number;
}

export interface DriverInfo {
  driver_number: number;
  name_acronym: string;
  full_name: string | null;
  team_name: string | null;
  team_colour: string | null;
  country_code: string | null;
}

export type { Playback } from "./playbackStore";

/** One lap of driver inputs from /session/inputs. */
export interface InputsPayload {
  driver_number: number;
  lap: number;
  lap_duration: number | null;
  t: number[];
  speed: number[];
  throttle: number[];
  brake: number[];
  gear: number[];
  drs: (number | null)[];
}

export interface StrategyOption {
  id: string;
  label: string;
  stops: number;
  compound_plan: string[];
  total_s: number;
  delta_to_best_s: number;
  rank: number;
}

export interface StrategyResult {
  measurable: boolean;
  reason?: string;
  driver?: number;
  from_lap?: number;
  laps_remaining?: number;
  pit_loss_s?: number;
  pit_loss_source?: string;
  traffic_on_exit?: boolean;
  traffic_penalty_s?: number;
  options: StrategyOption[];
  break_even_pit_loss_s?: number | null;
  undercut?: { laps_needed: number; note: string } | null;
  assumptions: string[];
  coverage: Record<string, unknown>;
  inputs_echo: Record<string, unknown>;
  model?: string;
  toy?: boolean;
}

export interface TelemetrySeries {
  driver_number: number;
  speed: (number | null)[];
  throttle: (number | null)[];
  brake: (number | null)[];
  drs: (number | null)[];
  gear: (number | null)[];
}

export interface TelemetryResult {
  axis: "time" | "distance";
  t: number[];
  series: TelemetrySeries[];
  window: { t0: number; t1: number };
  coverage: Record<string, unknown>;
}

export interface TimelineWeatherPoint {
  t: number;
  track: number | null;
  air: number | null;
  rain: number | null;
}

export interface TimelineEvent {
  t: number;
  category: string;
  message: string;
  flag: string | null;
}

export interface SessionTimeline {
  duration_s: number;
  weather: TimelineWeatherPoint[];
  events: TimelineEvent[];
  counts: { safety_car: number; vsc: number; red_flag: number; yellow: number };
}
