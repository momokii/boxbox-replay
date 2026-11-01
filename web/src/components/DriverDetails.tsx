import { useMemo } from "react";
import { compoundColor } from "../format";
import { stintSlope } from "../perf";
import type { Lap, Stint } from "../types";
import type { OvertakeRow, PitStop } from "../api";
import Modal from "./Modal";
import LapTimesModal from "./LapTimesModal";
import type { Driver, Playback } from "../types";

export type DetailKind = "stints" | "laps" | "overtakes" | "pits" | null;

interface Props {
  kind: DetailKind;
  onClose: () => void;
  driver: Driver;
  label: string;
  lap: number;
  laps: Lap[];
  stints: Stint[];
  overtakeEvents: OvertakeRow[];
  overtakeCounts: { made: number; lost: number } | null;
  pitStops: PitStop[];
  pitSummary: { stops: number; best_stop_s: number | null; total_stop_s: number | null } | null;
  color: string;
  colors: Map<number, string>;
  playback: Playback;
  totalLaps: number;
  onSeek: (t: number) => void;
  codes: Map<number, string>;
}

/** The four drill-down views reachable from the driver card. */
export default function DriverDetails(p: Props) {
  const mine = useMemo(
    () => p.laps.filter((l) => l.driver_number === p.driver.driver_number),
    [p.laps, p.driver.driver_number],
  );
  const myStints = useMemo(
    () =>
      p.stints
        .filter((s) => s.driver_number === p.driver.driver_number)
        .sort((a, b) => (a.lap_start ?? 0) - (b.lap_start ?? 0)),
    [p.stints, p.driver.driver_number],
  );
  const maxLap = Math.max(1, ...myStints.map((s) => s.lap_end ?? 0));

  const myOvertakes = useMemo(
    () =>
      p.overtakeEvents
        .filter(
          (o) =>
            o.overtaking_driver_number === p.driver.driver_number ||
            o.overtaken_driver_number === p.driver.driver_number,
        )
        .sort((a, b) => a.t - b.t),
    [p.overtakeEvents, p.driver.driver_number],
  );

  const myStops = useMemo(
    () => p.pitStops.filter((s) => s.driver_number === p.driver.driver_number).sort((a, b) => a.t - b.t),
    [p.pitStops, p.driver.driver_number],
  );

  const title =
    p.kind === "stints"
      ? `${p.label} — stints and wear`
      : p.kind === "laps"
        ? `${p.label} — every lap`
        : p.kind === "overtakes"
          ? `${p.label} — overtakes`
          : `${p.label} — pit stops`;

  return (
    <Modal open={p.kind != null} onClose={p.onClose} title={title} size="wide">
      {p.kind === "stints" && (
        <div>
          <div className="stint-list" style={{ maxHeight: "46vh" }}>
            {myStints.map((s) => {
              const start = s.lap_start ?? 1;
              const end = s.lap_end ?? maxLap;
              const seg = mine.filter((l) => l.lap_number >= start && l.lap_number <= end);
              let slope: number | null = null;
              try {
                slope = stintSlope(seg);
              } catch {
                slope = null;
              }
              return (
                <div key={`${start}-${end}`} className="row" style={{ fontSize: "0.82rem", marginBottom: 4 }}>
                  <span className="mono" style={{ minWidth: 40 }}>
                    {s.compound ?? "?"}
                  </span>
                  <span className="dim" style={{ minWidth: 90 }}>
                    laps {start}–{s.lap_end ?? "end"}
                  </span>
                  <div className="stint-track" style={{ maxWidth: 260 }}>
                    <div
                      className="stint-block"
                      style={{
                        left: `${((start - 1) / maxLap) * 100}%`,
                        width: `${Math.max(1, ((end - start + 1) / maxLap) * 100)}%`,
                        background: compoundColor(s.compound),
                      }}
                    />
                  </div>
                  <span className="mono small" style={{ marginLeft: "auto" }}>
                    {slope == null ? "too few laps" : `+${slope.toFixed(3)}s/lap`}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="dim small">
            Each bar is one stint, positioned by its laps. Wear is fitted only on that stint's timed laps.
          </p>
        </div>
      )}

      {p.kind === "laps" && (
        <LapTimesModal
          laps={mine as never}
          drivers={[p.driver]}
          totalLaps={p.totalLaps}
          colors={p.colors}
          playback={p.playback}
        />
      )}

      {p.kind === "overtakes" && (
        <div>
          <p className="small">
            {p.overtakeCounts
              ? `${p.overtakeCounts.made} made · ${p.overtakeCounts.lost} lost across the session`
              : "No overtake totals available."}
          </p>
          {myOvertakes.length ? (
            <div className="event-list" style={{ maxHeight: "46vh" }}>
              {myOvertakes.map((o, i) => {
                const made = o.overtaking_driver_number === p.driver.driver_number;
                const other = made ? o.overtaken_driver_number : o.overtaking_driver_number;
                return (
                  <button key={i} className="event-row rc" onClick={() => p.onSeek(o.t)}>
                    <span className="mono dim">{formatTime(o.t)}</span>
                    <span className="small">
                      {made ? "passed" : "was passed by"} {p.codes.get(other) ?? `#${other}`}
                      {o.position != null ? ` for P${o.position}` : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="dim small">No overtakes recorded for this driver.</p>
          )}
          <p className="dim small">Click a row to jump the replay to that moment.</p>
        </div>
      )}

      {p.kind === "pits" && (
        <div>
          <p className="small">
            {p.pitSummary
              ? `${p.pitSummary.stops} stop${p.pitSummary.stops === 1 ? "" : "s"}${
                  p.pitSummary.best_stop_s != null ? ` · fastest ${p.pitSummary.best_stop_s.toFixed(1)}s` : ""
                }${p.pitSummary.total_stop_s != null ? ` · ${p.pitSummary.total_stop_s.toFixed(1)}s in total` : ""}`
              : "No pit-stop summary available."}
          </p>
          {myStops.length ? (
            <table className="laps mono" style={{ fontSize: "0.82rem" }}>
              <thead>
                <tr>
                  <th>Lap</th>
                  <th>Stop time</th>
                  <th>In pit lane</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {myStops.map((s, i) => (
                  <tr key={i}>
                    <td>{s.lap_number ?? "—"}</td>
                    <td>{s.stop_duration != null ? `${s.stop_duration.toFixed(1)}s` : "—"}</td>
                    <td>{s.pit_duration != null ? `${s.pit_duration.toFixed(1)}s` : "—"}</td>
                    <td>
                      <button className="ghost small" onClick={() => p.onSeek(s.t)}>
                        {formatTime(s.t)}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="dim small">No pit stops recorded for this driver.</p>
          )}
          <p className="dim small">
            Stop time is the stationary time; "in pit lane" includes the drive-through and can be much longer.
          </p>
        </div>
      )}
    </Modal>
  );
}

function formatTime(t: number): string {
  const s = Math.max(0, Math.floor(t));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export { formatTime };
