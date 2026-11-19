import type { PitStop, PitStopSummary, SessionResultRow } from "./api";
import type { Column } from "./export";
import { formatLapTime } from "./format";
import type { Lap, Stint } from "./types";

export interface DownloadDataset {
  key: string;
  label: string;
  description: string;
  rows: Record<string, unknown>[];
  columns: Column[];
}

interface Input {
  laps: Lap[];
  stints: Stint[];
  weather: Record<string, unknown>[];
  control: Record<string, unknown>[];
  radio: Record<string, unknown>[];
  pitStops: PitStop[];
  pitSummary?: PitStopSummary[];
  overtakeCounts: { driver_number: number; made: number; lost: number }[];
  result: SessionResultRow[];
}

const cols = (keys: string[]): Column[] => keys.map((key) => ({ key, label: key }));

/** One place for every session-wide export table. */
export function buildSessionDatasets(data: Input): DownloadDataset[] {
  const fastest = data.laps
    .filter((lap) => lap.lap_duration != null)
    .sort((a, b) => (a.lap_duration ?? 0) - (b.lap_duration ?? 0))
    .slice(0, 5)
    .map((lap, index) => ({
      rank: index + 1,
      driver_number: lap.driver_number,
      lap_number: lap.lap_number,
      time: formatLapTime(lap.lap_duration),
    }));
  return [
    {
      key: "classification",
      label: "Classification",
      description: "Official session order, status and points.",
      rows: data.result as unknown as Record<string, unknown>[],
      columns: cols(["position", "driver_number", "gap_text", "points", "dnf", "dns", "dsq"]),
    },
    {
      key: "fastest-laps",
      label: "Fastest laps",
      description: "The five quickest timed laps.",
      rows: fastest,
      columns: cols(["rank", "driver_number", "lap_number", "time"]),
    },
    {
      key: "laps",
      label: "Laps",
      description: "Every lap, sector time and pit-out flag.",
      rows: data.laps as unknown as Record<string, unknown>[],
      columns: cols(["driver_number", "lap_number", "lap_duration", "duration_sector_1", "duration_sector_2", "duration_sector_3", "is_pit_out_lap"]),
    },
    {
      key: "stints",
      label: "Stints",
      description: "Tyre runs, compounds and stint lap ranges.",
      rows: data.stints as unknown as Record<string, unknown>[],
      columns: cols(["driver_number", "stint_number", "lap_start", "lap_end", "compound", "tyre_age_at_start"]),
    },
    {
      key: "weather",
      label: "Weather",
      description: "Air/track temperature, humidity and rainfall samples.",
      rows: data.weather,
      columns: cols(["t", "air_temperature", "track_temperature", "humidity", "rainfall"]),
    },
    {
      key: "race-control",
      label: "Race control",
      description: "Flags, safety cars, penalties and messages.",
      rows: data.control,
      columns: cols(["t", "category", "flag", "message", "scope", "driver_number", "lap_number"]),
    },
    {
      key: "radio",
      label: "Team radio",
      description: "Radio metadata and recording links; no transcript is published.",
      rows: data.radio,
      columns: cols(["t", "driver_number", "recording_url"]),
    },
    {
      key: "pit-stops",
      label: "Pit stops",
      description: "Stationary and pit-lane duration per recorded stop.",
      rows: data.pitStops as unknown as Record<string, unknown>[],
      columns: cols(["driver_number", "lap_number", "stop_duration", "pit_duration"]),
    },
    {
      key: "overtakes",
      label: "Overtake counts",
      description: "Made/lost counts by driver; the feed may be incomplete.",
      rows: data.overtakeCounts as unknown as Record<string, unknown>[],
      columns: cols(["driver_number", "made", "lost"]),
    },
  ];
}
