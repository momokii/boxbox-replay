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
  break_even_pit_loss_s: number;
  stay_advantage_s: number;
  deg_total_s: number;
  traffic_penalty_s: number;
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
  const [explain, setExplain] = useState<string | null>(null);
  const [explainBusy, setExplainBusy] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);

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
    setExplain(null);
    setExplainError(null);
  }, [base, fresh, deg, lapsLeft, pitLoss, p.gapBehind, p.driver]);

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
        Two scenarios, one sum each: keep the current {compound.toLowerCase()} tyres to the flag, or spend{" "}
        {pitLoss.toFixed(1)}s in the pit lane and finish on fresh ones. The lower total wins.
      </p>
      <details className="how-to" style={{ marginBottom: 10 }}>
        <summary>How to use this</summary>
        <ul>
          <li>
            <strong>1. Pick the driver</strong> in the timing tower (click a row). The model uses that car's
            measured pace and tyre wear.
          </li>
          <li>
            <strong>2. Set laps left</strong> to the laps you want to model — this is a snapshot, not a strategy
            plan.
          </li>
          <li>
            <strong>3. Drag pit loss</strong> to match the circuit (20–25s is typical). Watch how much the answer
            has to change before it flips.
          </li>
          <li>
            <strong>4. Read the verdict</strong>, then check the breakdown below: it shows exactly which pace and
            wear numbers were used, and what the model ignores.
          </li>
        </ul>
      </details>

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
          <p className="dim small" style={{ marginBottom: 4 }}>
            Total time over the next {lapsLeft} laps. Shorter bar is better.
          </p>
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
              ? `Staying out saves ${diff.toFixed(1)}s over the next ${lapsLeft} laps`
              : `Pitting saves ${diff.toFixed(1)}s over the next ${lapsLeft} laps`}
            {" — about "}
            {(diff / Math.max(1, lapsLeft)).toFixed(2)}s per lap. {call.traffic_on_exit ? "" : "The pit exit is clear."}
          </p>
          {call.traffic_on_exit && (
            <p className="small warn">
              Traffic on exit: the car behind is closer than the pit loss, so you would rejoin behind it.
            </p>
          )}

          <h3 style={{ marginTop: 18 }}>The arithmetic, step by step</h3>
          <p className="dim small" style={{ marginTop: -4 }}>
            Both scenarios are summed over {lapsLeft} laps. The wear term appears in both, so it
            cancels in the comparison — it moves the totals, not the decision.
          </p>
          <div className="pit-math">
            <div className="pit-math-row">
              <span>Stay out</span>
              <code>
                {lapsLeft} × {base.toFixed(2)} + {deg.toFixed(3)} × {Math.round((lapsLeft * (lapsLeft - 1)) / 2)} ={" "}
                {call.stay_total_s.toFixed(1)}s
              </code>
            </div>
            <div className="pit-math-row">
              <span>Pit now</span>
              <code>
                {pitLoss.toFixed(1)} + {lapsLeft} × {fresh.toFixed(2)} + {deg.toFixed(3)} ×{" "}
                {Math.round((lapsLeft * (lapsLeft - 1)) / 2)} = {call.pit_total_s.toFixed(1)}s
              </code>
            </div>
            <div className="pit-math-row verdict">
              <span>{call.recommendation === "PIT NOW" ? "Pitting wins" : "Staying out wins"}</span>
              <code>
                {Math.abs(call.stay_advantage_s).toFixed(1)}s over {lapsLeft} laps ·{" "}
                {(Math.abs(call.stay_advantage_s) / Math.max(1, lapsLeft)).toFixed(2)}s per lap
                {call.traffic_penalty_s > 0
                  ? ` (includes the ${call.traffic_penalty_s.toFixed(1)}s traffic penalty)`
                  : ""}
              </code>
            </div>
          </div>
          <p className="small">
            {call.break_even_pit_loss_s <= 0 ? (
              <>Break-even: even a free pit stop would not pay off at this pace.</>
            ) : (
              <>
                Break-even pit loss: <b>{call.break_even_pit_loss_s.toFixed(1)}s</b>. A stop that
                costs less than that favours pitting; this one is set to {pitLoss.toFixed(1)}s
                {call.traffic_penalty_s > 0
                  ? ` plus ${call.traffic_penalty_s.toFixed(1)}s of traffic penalty`
                  : ""}
                , so the model says <b>{call.recommendation.toLowerCase()}</b>.
              </>
            )}
          </p>
          <p className="dim small">
            Wear adds {call.deg_total_s.toFixed(1)}s to both scenarios over these {lapsLeft} laps.
          </p>

          <div className="pit-explain">
            <button
              type="button"
              className="pit-explain-btn"
              disabled={explainBusy}
              onClick={async () => {
                setExplainBusy(true);
                setExplainError(null);
                try {
                  const reply = await api.aiPitExplain({
                    session_key: p.sessionKey,
                    driver: p.driverCode(p.driver),
                    compound: currentStint?.compound ?? "",
                    base_pace_s: base,
                    fresh_pace_s: fresh,
                    deg_slope_s_per_lap: deg,
                    laps_remaining: lapsLeft,
                    pit_loss_s: pitLoss,
                    gap_behind_s: p.gapBehind,
                  });
                  setExplain(reply.answer);
                } catch (err: unknown) {
                  const message = err instanceof Error ? err.message : "";
                  setExplainError(
                    message.includes("503")
                      ? "The engineer is not configured on this deployment."
                      : "The engineer did not answer. The numbers above are unaffected.",
                  );
                } finally {
                  setExplainBusy(false);
                }
              }}
            >
              {explainBusy ? "Asking the engineer…" : "Explain this call"}
            </button>
            <div className="pit-ai-help">
              <p className="dim small">
                The engineer receives the driver, tyre and age, laps remaining, current and
                fresh-tyre pace, wear, the pit-loss slider, the gap behind and the two totals. It
                writes three sentences: which way the model leans, the main reason, and the single
                biggest assumption. It never recalculates or changes the numbers, and it cannot see
                anything outside this session.
              </p>
            </div>
            {explainError && <p className="small warn">{explainError}</p>}
            {explain && (
              <div className="pit-explain-note">
                <p>{explain}</p>
                <footer className="dim small">AI explanation · the arithmetic above is the source of truth</footer>
              </div>
            )}
          </div>

          <h3 style={{ marginTop: 18 }}>Where the numbers come from</h3>
          <table className="laps mono pit-source" style={{ fontSize: "0.82rem" }}>
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
