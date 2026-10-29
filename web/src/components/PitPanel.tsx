import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { formatLapTime } from "../format";
import { recentPace, tyreSlope } from "../perf";
import type { IntervalPoint, Lap } from "../types";

interface Props {
  sessionKey: number;
  laps: Lap[];
  intervals: IntervalPoint[];
  driver: number;
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
    deg = Math.max(0, tyreSlope(mine));
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
      <p className="dim">
        <strong>TOY MODEL</strong> — linear deg, constant rivals, static pit loss. Not strategy advice.
      </p>
      <div className="row">
        <label className="dim">
          Driver{" "}
          <strong className="mono" style={{ color: "var(--ink)" }}>
            #{p.driver}
          </strong>
        </label>
        <label className="dim">
          Laps left{" "}
          <input type="number" min={1} value={lapsLeft} onChange={(e) => setLapsLeft(Number(e.target.value))} style={{ width: "70px" }} />
        </label>
        <label className="dim">
          Pit loss (s){" "}
          <input type="range" min={15} max={30} step={0.5} value={pitLoss} onChange={(e) => setPitLoss(Number(e.target.value))} />
          <span className="mono">{pitLoss.toFixed(1)}</span>
        </label>
      </div>
      {error && <p className="dim">Pit model unavailable.</p>}
      {call && (
        <>
          <div className="row mono">
            <span>Stay out: {call.stay_total_s.toFixed(1)}s</span>
            <span>Pit now: {call.pit_total_s.toFixed(1)}s</span>
            <span>Traffic on exit: {call.traffic_on_exit ? "YES" : "clear"}</span>
          </div>
          <h2>{call.recommendation}</h2>
        </>
      )}
      <p className="dim mono">
        Pace now {formatLapTime(base)} · fresh {formatLapTime(fresh)} · deg +{deg.toFixed(3)}s/lap
      </p>
    </div>
  );
}
