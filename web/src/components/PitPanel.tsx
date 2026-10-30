import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { formatLapTime } from "../format";
import { freshTyrePace, greenLaps, median, stintSlope } from "../perf";
import Info from "./Info";
import type { Lap, Stint } from "../types";
import type { PitStopSummary } from "../api";

interface Props {
  sessionKey: number;
  laps: Lap[];
  stints: Stint[];
  driver: number;
  driverCode: (n: number) => string;
  gapBehind: number | null;
  lap: number;
  onSeek: (t: number) => void;
  pitStops: PitStopSummary | null;
}

interface Call {
  stay_total_s: number;
  pit_total_s: number;
  recommendation: string;
  traffic_on_exit: boolean;
}

/**
 * Pit-strategy what-if, written as: question → evidence → verdict → arithmetic
 * → assumptions. Every number shown comes from measured laps; the only chosen
 * inputs are laps remaining and pit loss.
 */
export default function PitPanel(p: Props) {
  const [lapsLeft, setLapsLeft] = useState(10);
  const [pitLoss, setPitLoss] = useState(22);
  const [call, setCall] = useState<Call | null>(null);
  const [error, setError] = useState(false);

  const mine = useMemo(
    () => p.laps.filter((l) => l.driver_number === p.driver).sort((a, b) => a.lap_number - b.lap_number),
    [p.laps, p.driver],
  );
  const timed = mine.filter((l) => l.lap_duration != null);

  // Current stint = the one covering the replay lap; wear is measured on it
  // only, because mixing compounds and fuel loads makes a slope meaningless.
  const currentStint = useMemo(() => {
    const rows = p.stints
      .filter((s) => s.driver_number === p.driver)
      .sort((a, b) => (a.lap_start ?? 0) - (b.lap_start ?? 0));
    return (
      rows.find(
        (s) => p.lap >= (s.lap_start ?? 1) && p.lap <= (s.lap_end ?? Number.MAX_SAFE_INTEGER),
      ) ??
      rows[rows.length - 1] ??
      null
    );
  }, [p.stints, p.driver, p.lap]);

  const stintLaps = useMemo(() => {
    if (!currentStint) return timed.slice(-5);
    const start = currentStint.lap_start ?? 1;
    const end = currentStint.lap_end ?? Number.MAX_SAFE_INTEGER;
    return timed.filter((l) => l.lap_number >= start && l.lap_number <= end);
  }, [currentStint, timed]);

  // Current pace: the last green laps of the stint, so red flags, in-laps and
  // out-laps cannot poison it.
  const base = useMemo(() => {
    const clean = greenLaps(stintLaps);
    const recent = clean.slice(-4).map((l) => l.lap_duration as number);
    if (recent.length >= 2) return median(recent) ?? 0;
    const overall = greenLaps(timed).slice(-5).map((l) => l.lap_duration as number);
    return median(overall) ?? 0;
  }, [stintLaps, timed]);

  // "Fresh tyre" pace is measured from the first flying laps of each stint.
  const fresh = useMemo(
    () => freshTyrePace(p.stints, p.laps, p.driver) ?? base,
    [p.stints, p.laps, p.driver, base],
  );

  let deg = 0;
  let degMeasured = false;
  try {
    deg = Math.max(0, stintSlope(stintLaps));
    degMeasured = stintLaps.length >= 4;
  } catch {
    deg = 0;
    degMeasured = false;
  }

  useEffect(() => {
    if (!base || !fresh) return;
    let live = true;
    setError(false);
    api
      .pitCall({
        base_pace_s: base,
        fresh_pace_s: fresh,
        deg_slope_s_per_lap: deg,
        laps_remaining: lapsLeft,
        pit_loss_s: pitLoss,
        gap_behind_s: p.gapBehind,
      })
      .then((c) => live && setCall(c))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [p.sessionKey, base, fresh, deg, lapsLeft, pitLoss, p.gapBehind]);

  if (!mine.length) {
    return <p className="dim">Pick a driver in the timing tower (click a row) to run the pit model.</p>;
  }

  const stayPerLap = call ? call.stay_total_s / lapsLeft : 0;
  const pitPerLap = call ? (call.pit_total_s - pitLoss) / lapsLeft : 0;
  const diff = call ? Math.abs(call.stay_total_s - call.pit_total_s) : 0;
  const maxTotal = call ? Math.max(call.stay_total_s, call.pit_total_s) : 1;
  const compound = currentStint?.compound ?? "tyres";

  return (
    <div>
      <p className="pit-question">
        Should <strong>{p.driverCode(p.driver)}</strong> pit now, or stay out for the last{" "}
        <strong>{lapsLeft}</strong> laps?
      </p>
      <p className="dim small" style={{ marginTop: -4 }}>
        This compares two totals over those laps: staying out on the current {compound.toLowerCase()} tyres versus
        stopping for fresh ones. Lower total is better.
      </p>

      <div className="pit-inputs">
        <div className="pit-field">
          <Info
            label="Laps left"
            tip="How many laps are still to run. The model sums only these laps, so it is a snapshot of this moment."
          />
          <input
            type="number"
            min={1}
            max={60}
            value={lapsLeft}
            onChange={(e) => setLapsLeft(Math.max(1, Number(e.target.value)))}
          />
        </div>
        <div className="pit-field">
          <Info
            label="Pit loss"
            tip="Time lost driving through the pit lane compared with staying on track. 20-25s is typical; drag it to test how sensitive the answer is."
          />
          <input
            type="range"
            min={15}
            max={30}
            step={0.5}
            value={pitLoss}
            onChange={(e) => setPitLoss(Number(e.target.value))}
          />
          <span className="mono">{pitLoss.toFixed(1)}s</span>
        </div>
      </div>

      {error && <p className="dim">The model could not run for this driver.</p>}

      {call && (
        <>
          <div className="pit-bars">
            <div className="pit-bar-row">
              <span className="pit-bar-label">Stay out</span>
              <div className="pit-bar-track">
                <span className="pit-bar stay" style={{ width: `${(call.stay_total_s / maxTotal) * 100}%` }} />
              </div>
              <span className="mono">{call.stay_total_s.toFixed(1)}s</span>
            </div>
            <div className="pit-bar-row">
              <span className="pit-bar-label">Pit now</span>
              <div className="pit-bar-track">
                <span className="pit-bar pit" style={{ width: `${(call.pit_total_s / maxTotal) * 100}%` }} />
              </div>
              <span className="mono">{call.pit_total_s.toFixed(1)}s</span>
            </div>
          </div>

          <p className="pit-answer">{call.recommendation}</p>
          <p className="small">
            {call.recommendation === "STAY OUT"
              ? `Staying out saves ${diff.toFixed(1)}s over the next ${lapsLeft} laps.`
              : `Pitting saves ${diff.toFixed(1)}s over the next ${lapsLeft} laps.`}
          </p>
          {call.traffic_on_exit && (
            <p className="small warn">
              Traffic on exit: the car behind is closer than the pit loss, so you would rejoin behind it.
            </p>
          )}

          <h3 style={{ marginTop: 18 }}>Where the numbers come from</h3>
          <table className="laps mono" style={{ fontSize: "0.82rem" }}>
            <tbody>
              <tr>
                <td>
                  <Info label="Current pace" tip="Median of this driver's timed laps in the current stint. This is what staying out looks like if nothing changes." />
                </td>
                <td>{formatLapTime(base)}</td>
                <td className="dim small">median of the current stint</td>
              </tr>
              <tr>
                <td>
                  <Info label="Fresh-tyre pace" tip="Median of the first three laps of each stint — measured, not a guess." />
                </td>
                <td>{formatLapTime(fresh)}</td>
                <td className="dim small">first laps of each stint</td>
              </tr>
              <tr>
                <td>
                  <Info label="Wear" tip="Seconds lost per lap as the current tyres age. Only shown when the current stint has at least four timed laps." />
                </td>
                <td>{degMeasured ? `+${deg.toFixed(3)}s/lap` : "not measurable"}</td>
                <td className="dim small">
                  {degMeasured ? `over ${stintLaps.length} laps` : "stint too short — treated as 0"}
                </td>
              </tr>
              <tr>
                <td>Stay out, per lap</td>
                <td>{formatLapTime(stayPerLap)}</td>
                <td className="dim small">{lapsLeft} laps</td>
              </tr>
              <tr>
                <td>Pit now, per lap</td>
                <td>{formatLapTime(pitPerLap)}</td>
                <td className="dim small">after the {pitLoss.toFixed(1)}s stop</td>
              </tr>
            </tbody>
          </table>

          {p.pitStops && p.pitStops.stops > 0 && (
        <p className="dim small">
          Measured this race: {p.pitStops.stops} stop{p.pitStops.stops > 1 ? "s" : ""}
          {p.pitStops.best_stop_s != null ? `, fastest ${p.pitStops.best_stop_s.toFixed(1)}s` : ""}
          {p.pitStops.total_stop_s != null ? `, ${p.pitStops.total_stop_s.toFixed(1)}s in total` : ""}
          {" — "}use that to sanity-check the pit-loss slider.
        </p>
      )}

      <h3 style={{ marginTop: 16 }}>What this model ignores</h3>
          <ul className="pit-assumptions">
            <li>Rivals: everyone keeps their current pace. No safety car, no overtakes, no weather change.</li>
            <li>Tyres: wear is linear; a fresh set is assumed to return to the measured fresh-tyre pace.</li>
            <li>Stops: pit loss is a number you choose, not a measured pit stop. Two stops are not modelled.</li>
            <li>Track position: only the car directly behind is checked, for traffic on exit.</li>
          </ul>
        </>
      )}
    </div>
  );
}
