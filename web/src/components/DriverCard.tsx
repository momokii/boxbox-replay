import { compoundColor } from "../format";
import { formatLapTime } from "../format";
import Info from "./Info";
import type { Driver, Lap, Stint } from "../types";
import type { PitStopSummary, SessionResultRow } from "../api";

interface Props {
  driver: Driver;
  position: number | null;
  gap: number | null;
  lap: number;
  stint: Stint | null;
  laps: Lap[];
  bestLap: Lap | null;
  onClear: () => void;
  pit: PitStopSummary | null;
  overtakes: { made: number; lost: number } | null;
  result: SessionResultRow | null;
  onOpen: (kind: "stints" | "laps" | "overtakes" | "pits") => void;
}

/** Everything needed to understand who this driver is and what they're doing. */
export default function DriverCard(p: Props) {
  const own = p.laps
    .filter((l) => l.driver_number === p.driver.driver_number && l.lap_duration != null)
    .sort((a, b) => a.lap_number - b.lap_number);
  // "Most recent" means most recent at the replay clock, not at the end of the
  // session: scrub back and these follow.
  const upToNow = own.filter((l) => l.lap_number <= p.lap);
  const last = upToNow.length ? upToNow[upToNow.length - 1] : null;
  const recent = upToNow.slice(-5);
  const fastestRecent = recent.length ? Math.min(...recent.map((l) => l.lap_duration as number)) : null;
  const slowestRecent = recent.length ? Math.max(...recent.map((l) => l.lap_duration as number)) : null;
  const tyreAge = p.stint?.lap_start != null ? Math.max(1, p.lap - p.stint.lap_start + 1) : null;
  const color = `#${(p.driver.team_colour ?? "").replace("#", "")}`;

  return (
    <div className="driver-card">
      <div className="driver-band" style={{ background: color }} />
      <div className="driver-head">
        <span className="driver-number" style={{ borderColor: color }}>
          {p.driver.driver_number}
        </span>
        <div style={{ minWidth: 0 }}>
          <p className="driver-name">{p.driver.full_name ?? p.driver.name_acronym}</p>
          <p className="dim small">
            {p.driver.team_name}
            {p.driver.country_code ? ` · ${p.driver.country_code}` : ""}
          </p>
        </div>
        <button className="ghost" onClick={p.onClear} aria-label="Close driver card">
          ✕
        </button>
      </div>

      <div className="badge-row">
        <span className="badge">
          <Info label="Position" tip="Classification position at the replay clock, from live timing gaps." />
          <strong>P{p.position ?? "—"}</strong>
        </span>
        <span className="badge">
          <Info label="Gap" tip="Seconds behind the leader at this moment. '—' means timing has no value yet." />
          <strong>{p.gap == null ? "—" : `+${p.gap.toFixed(3)}`}</strong>
        </span>
        {p.stint && (
          <button className="badge" onClick={() => p.onOpen("stints")} title="Open stints and wear">
            <i className="tower-chip" style={{ background: compoundColor(p.stint.compound) }} />
            <Info
              label="Tyre"
              tip="Compound on the car at the replay clock, and how many laps it has run at that point. Scrubbing the replay changes it."
            />
            <strong>
              {p.stint.compound ?? "?"}
              {tyreAge != null ? ` · ${tyreAge}L` : ""}
            </strong>
          </button>
        )}
        {p.result && (
          <span className="badge">
            <Info label="Result" tip="Official final classification for this session." />
            <strong>
              {p.result.dnf
                ? "DNF"
                : `P${p.result.position ?? "—"}${p.result.points ? ` · ${p.result.points} pts` : ""}`}
            </strong>
          </span>
        )}
      </div>

      {recent.length > 1 && fastestRecent != null && slowestRecent != null && (
        <div className="lap-strip">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
            <span className="dim small">
              <Info
                label="Last laps"
                tip="The driver's five most recent timed laps. Shorter bar = faster lap; the number is the lap time."
              />
            </span>
            <span className="dim small">L{recent[0].lap_number}–L{recent[recent.length - 1].lap_number}</span>
          </div>
          {recent.map((l) => {
            const t = l.lap_duration as number;
            const span = Math.max(0.001, slowestRecent - fastestRecent);
            const pct = 30 + (1 - (t - fastestRecent) / span) * 70;
            return (
              <div key={l.lap_number} className="lap-strip-row">
                <span className="dim small mono">L{l.lap_number}</span>
                <span className="lap-strip-track">
                  <span
                    className="lap-strip-bar"
                    style={{ width: `${pct}%`, background: t === fastestRecent ? "var(--green)" : color }}
                  />
                </span>
                <span className="mono small">{formatLapTime(t)}</span>
              </div>
            );
          })}
        </div>
      )}

      <dl className="facts">
        <div>
          <dt>
            <Info label="Last lap" tip="The most recent lap completed at the replay clock, not at the end of the session." />
          </dt>
          <dd>{last ? `${formatLapTime(last.lap_duration)} (L${last.lap_number})` : "—"}</dd>
        </div>
        <div>
          <dt>
            <Info label="Best lap" tip="The driver's fastest lap of the whole session, with the lap it happened on." />
          </dt>
          <dd>{p.bestLap ? `${formatLapTime(p.bestLap.lap_duration)} (L${p.bestLap.lap_number})` : "—"}</dd>
        </div>
        <div>
          <dt>
            <Info label="Laps run" tip="Number of laps with a measured time for this driver." />
          </dt>
          <dd>{own.length}</dd>
        </div>
        <div>
          <dt>
            <Info
              label="Pit stops"
              tip="Stops recorded in the pit feed, with the fastest stationary time in seconds."
            />
          </dt>
          <dd>
            {p.pit
              ? `${p.pit.stops}${p.pit.best_stop_s != null ? ` · best ${p.pit.best_stop_s.toFixed(1)}s` : ""}`
              : "—"}
          </dd>
        </div>
        <div>
          <dt>
            <Info label="Overtakes" tip="On-track passes recorded by the timing feed: made and lost." />
          </dt>
          <dd>{p.overtakes ? `${p.overtakes.made} made · ${p.overtakes.lost} lost` : "—"}</dd>
        </div>
      </dl>

      <div className="detail-actions">
        <button className="chip" onClick={() => p.onOpen("stints")}>Stints &amp; wear</button>
        <button className="chip" onClick={() => p.onOpen("laps")}>All laps</button>
        <button className="chip" onClick={() => p.onOpen("overtakes")}>Overtakes</button>
        <button className="chip" onClick={() => p.onOpen("pits")}>Pit stops</button>
      </div>

      <p className="dim small">
        {p.driver.name_acronym} is the three-letter timing abbreviation for{" "}
        {p.driver.full_name ?? "this driver"}. Click the car again to deselect.
      </p>
    </div>
  );
}
