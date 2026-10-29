import { useEffect, useState } from "react";
import { api } from "../api";
import { formatLapTime } from "../format";
import { recentPace, stintSlope } from "../perf";
import Info from "./Info";
import type { Lap } from "../types";

interface Props {
  sessionKey: number;
  laps: Lap[];
  driver: number;
  driverCode: (n: number) => string;
  gapBehind: number | null;
  onSeek: (t: number) => void;
}

interface Call {
  stay_total_s: number;
  pit_total_s: number;
  recommendation: string;
  traffic_on_exit: boolean;
}

/**
 * Pit-strategy what-if. The interface states the question, the three inputs,
 * the two totals and the assumptions — in that order.
 */
export default function PitPanel(p: Props) {
  const [lapsLeft, setLapsLeft] = useState(10);
  const [pitLoss, setPitLoss] = useState(22);
  const [call, setCall] = useState<Call | null>(null);
  const [error, setError] = useState(false);

  const mine = p.laps
    .filter((l) => l.driver_number === p.driver)
    .sort((a, b) => a.lap_number - b.lap_number);
  const base = recentPace(mine) ?? 0;
  const fresh = (() => {
    const t = mine.map((l) => l.lap_duration).filter((v): v is number => v != null);
    return t.length ? Math.min(...t) : 0;
  })();
  let deg = 0;
  try {
    deg = Math.max(0, stintSlope(mine));
  } catch {
    deg = 0;
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

  const diff = call ? Math.abs(call.stay_total_s - call.pit_total_s) : 0;
  const maxTotal = call ? Math.max(call.stay_total_s, call.pit_total_s) : 1;

  return (
    <div>
      <p className="pit-question">
        Should <strong>{p.driverCode(p.driver)}</strong> pit now, or stay out for the last{" "}
        <strong>{lapsLeft}</strong> laps?
      </p>

      <div className="pit-inputs">
        <div className="pit-field">
          <Info
            label="Laps left"
            tip="How many laps remain in the race. The model only sums these laps, so it is a snapshot, not a plan."
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
            tip="Time lost driving through the pit lane at this circuit. 20-25 s is typical; drag it to see how sensitive the answer is."
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
            <p className="small warn">Traffic on exit: the car behind is closer than the pit loss, so you would rejoin behind it.</p>
          )}
        </>
      )}

      <h3 style={{ marginTop: 18 }}>What this model assumes</h3>
      <ul className="pit-assumptions">
        <li>Tyre wear stays linear at the rate measured on this driver's laps ({deg.toFixed(3)}s per lap).</li>
        <li>Every rival keeps their current pace; no safety cars, no overtakes, no weather change.</li>
        <li>Pit loss is a fixed number you choose ({pitLoss.toFixed(1)}s), not a measured pit stop.</li>
      </ul>

      <p className="dim small mono">
        Inputs are measured: current pace {formatLapTime(base)} · best lap {formatLapTime(fresh)} · average wear{" "}
        {deg.toFixed(3)}s/lap over {mine.filter((l) => l.lap_duration != null).length} timed laps.
      </p>
    </div>
  );
}
