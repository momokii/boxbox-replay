import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { formatLapTime } from "../format";
import { recentPace, stintSlope } from "../perf";
import Info from "./Info";
import type { IntervalPoint, Lap } from "../types";

interface Props {
  sessionKey: number;
  laps: Lap[];
  intervals: IntervalPoint[];
  driver: number;
  driverCode: (n: number) => string;
}

export default function PitPanel(p: Props) {
  const [lapsLeft, setLapsLeft] = useState(10);
  const [pitLoss, setPitLoss] = useState(22);
  const [call, setCall] = useState<{
    stay_total_s: number;
    pit_total_s: number;
    recommendation: string;
    traffic_on_exit: boolean;
  } | null>(null);
  const [error, setError] = useState(false);

  const mine = useMemo(() => p.laps.filter((l) => l.driver_number === p.driver).sort((a, b) => a.lap_number - b.lap_number), [p.laps, p.driver]);
  const base = recentPace(mine) ?? 0;
  const fresh = useMemo(() => {
    const t = mine.map((l) => l.lap_duration).filter((v): v is number => v != null);
    return t.length ? Math.min(...t) : 0;
  }, [mine]);
  let deg = 0;
  try {
    deg = Math.max(0, stintSlope(mine));
  } catch {
    deg = 0;
  }
  const gapBehind = useMemo(() => {
    if (!p.intervals.length) return null;
    const latest = [...p.intervals].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    const byDriver = new Map<number, number>();
    for (const r of latest) if (r.gap_to_leader != null) byDriver.set(r.driver_number, r.gap_to_leader);
    const mine_ = byDriver.get(p.driver);
    if (mine_ == null) return null;
    const behind = [...byDriver.values()].filter((g) => g > mine_);
    return behind.length ? Math.min(...behind) - mine_ : null;
  }, [p.intervals, p.driver]);

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
        gap_behind_s: gapBehind,
      })
      .then((c) => live && setCall(c))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [p.sessionKey, base, fresh, deg, lapsLeft, pitLoss, gapBehind]);

  if (!mine.length) return <p className="dim">Pick a driver with timed laps first.</p>;

  return (
    <div>
      <p className="dim small">
        <strong>What this is:</strong> a deliberately simple what-if. It compares staying out against pitting
        now using your car's measured pace and tyre wear, a fixed pit-loss estimate, and the gap behind.
        It ignores rival strategy, safety cars and traffic beyond that one check.
      </p>
      <div className="row">
        <span className="small">
          <Info label="Driver" tip="Whose measured pace and tyre wear the model uses. Pick another driver in the tower to change it." />
          {" "}
          <strong className="mono">{p.driverCode(p.driver)}</strong>
        </span>
        <label className="dim small">
          <Info label="Laps left" tip="How many laps are still to run. Defaults to 10 — change it to your scenario." />
          {" "}
          <input type="number" min={1} value={lapsLeft} onChange={(e) => setLapsLeft(Number(e.target.value))} style={{ width: "70px" }} />
        </label>
        <label className="dim small">
          <Info label="Pit loss" tip="Time lost in the pit lane compared with staying on track. About 20-25 s on most circuits." />
          {" "}
          <input type="range" min={15} max={30} step={0.5} value={pitLoss} onChange={(e) => setPitLoss(Number(e.target.value))} />
          <span className="mono">{pitLoss.toFixed(1)}</span>
        </label>
      </div>
      {error && <p className="dim">Pit model unavailable.</p>}
      {call && (
        <>
          <dl className="facts">
            <div>
              <dt><Info label="Stay out" tip="Total time over the remaining laps on the current tyres, including the measured wear." /></dt>
              <dd>{call.stay_total_s.toFixed(1)}s total</dd>
            </div>
            <div>
              <dt><Info label="Pit now" tip="Pit loss plus the remaining laps on fresh tyres." /></dt>
              <dd>{call.pit_total_s.toFixed(1)}s total</dd>
            </div>
            <div>
              <dt><Info label="Traffic on exit" tip="Whether the car behind is closer than the pit loss, meaning you would rejoin behind them." /></dt>
              <dd>{call.traffic_on_exit ? "yes" : "clear"}</dd>
            </div>
          </dl>
          <p className="pit-answer">{call.recommendation}</p>
          <p className="dim small">
            Lower total wins. Difference: {Math.abs(call.pit_total_s - call.stay_total_s).toFixed(1)}s.
          </p>
        </>
      )}
      <p className="dim small mono">
        From measured data: pace now {formatLapTime(base)} · best lap {formatLapTime(fresh)} · wear +{deg.toFixed(3)}s/lap
      </p>
    </div>
  );
}
