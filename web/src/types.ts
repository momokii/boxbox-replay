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
}

export interface Lap {
  driver_number: number;
  lap_number: number;
  lap_duration: number | null;
  duration_sector_1: number | null;
  duration_sector_2: number | null;
  duration_sector_3: number | null;
  is_pit_out_lap: boolean | null;
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
}

export interface CoachReply {
  answer: string | null;
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
