import { compoundColor } from "../format";
import Info from "./Info";
import type { Driver, Lap, Stint } from "../types";

interface Props {
  driver: Driver;
  position: number | null;
  gap: number | null;
  lap: number;
  stint: Stint | null;
  laps: Lap[];
  bestLap: Lap | null;
  onClear: () => void;
}

/** Everything needed to understand who this driver is and what they're doing. */
export default function DriverCard(p: Props) {
  const own = p.laps.filter((l) => l.driver_number === p.driver.driver_number && l.lap_duration != null);
  const last = own.length ? own[own.length - 1] : null;
  const tyreAge = p.stint?.lap_start != null ? Math.max(1, p.lap - p.stint.lap_start + 1) : null;

  return (
    <div className="driver-card">
      <div className="driver-head">
        <span className="driver-chip" style={{ background: `#${(p.driver.team_colour ?? "").replace("#", "")}` }} />
        <div>
          <p className="driver-name">
            #{p.driver.driver_number} {p.driver.full_name ?? p.driver.name_acronym}
          </p>
          <p className="dim small">
            {p.driver.team_name}
            {p.driver.country_code ? ` · ${p.driver.country_code}` : ""}
          </p>
        </div>
        <button className="ghost" onClick={p.onClear} aria-label="Close driver card">
          ✕
        </button>
      </div>

      <dl className="facts">
        <div>
          <dt>
            <Info
              label="Position"
              tip="Race position at the moment shown on the replay clock, taken from live timing gaps."
            />
          </dt>
          <dd>{p.position ?? "—"}</dd>
        </div>
        <div>
          <dt>
            <Info
              label="Gap to leader"
              tip="Seconds behind the leader at this moment. '—' means timing has no value for this driver yet."
            />
          </dt>
          <dd>{p.gap == null ? "—" : `+${p.gap.toFixed(3)}s`}</dd>
        </div>
        <div>
          <dt>
            <Info
              label="Tyre"
              tip="Compound fitted for the current stint and how many laps it has run. Colours follow F1: red soft, yellow medium, white hard."
            />
          </dt>
          <dd>
            {p.stint ? (
              <span className="row" style={{ justifyContent: "flex-end" }}>
                <i className="tower-chip" style={{ background: compoundColor(p.stint.compound) }} />
                {p.stint.compound ?? "?"}
                {tyreAge != null ? ` · ${tyreAge} laps` : ""}
              </span>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div>
          <dt>
            <Info label="Last lap" tip="The driver's most recent completed lap in the session data." />
          </dt>
          <dd>
            {last
              ? `${last.lap_duration?.toFixed(3)}s (L${last.lap_number})`
              : "—"}
          </dd>
        </div>
        <div>
          <dt>
            <Info label="Best lap" tip="The driver's fastest lap of the session." />
          </dt>
          <dd>{p.bestLap?.lap_duration != null ? `${p.bestLap.lap_duration.toFixed(3)}s` : "—"}</dd>
        </div>
        <div>
          <dt>
            <Info label="Laps run" tip="Number of laps with a measured time for this driver." />
          </dt>
          <dd>{own.length}</dd>
        </div>
      </dl>

      <p className="dim small">
        {p.driver.name_acronym} is the three-letter timing abbreviation for {p.driver.full_name ?? "this driver"}.
        Click the car again to deselect.
      </p>
    </div>
  );
}
