import { useEffect, useState } from "react";
import { formatLapTime } from "../format";
import { gapAt, type GapTable } from "../session";
import type { Driver, Lap } from "../types";

interface Props {
  playback: { state: { t: number; dur: number; rev: number } };
  sessionKey: number;
  table: GapTable;
  drivers: Driver[];
  laps: Lap[];
  onSeek: (t: number) => void;
}

/**
 * Battle view: two drivers, their relative gap over the WHOLE session and a
 * lap-by-lap pace comparison. Playhead is shared with the replay clock.
 */
export default function BattlePanel(p: Props) {
  const [a, setA] = useState<number | null>(null);
  const [b, setB] = useState<number | null>(null);
  const now = p.playback.state.t;

  const ordered = [...p.drivers].sort(
    (x, y) => (gapAt(p.table, x.driver_number, now) ?? 1e9) - (gapAt(p.table, y.driver_number, now) ?? 1e9),
  );
  const driverA = a ?? ordered[0]?.driver_number ?? 0;
  const driverB = b ?? ordered[1]?.driver_number ?? 0;

  const gapA = gapAt(p.table, driverA, now);
  const gapB = gapAt(p.table, driverB, now);
  const relative = gapA != null && gapB != null ? gapA - gapB : null;

  const lapsOf = (d: number) =>
    p.laps.filter((l) => l.driver_number === d && l.lap_duration != null).sort((x, y) => x.lap_number - y.lap_number);
  const lapsA = lapsOf(driverA);
  const lapsB = lapsOf(driverB);
  const best = (ls: Lap[]) => (ls.length ? Math.min(...ls.map((l) => l.lap_duration as number)) : null);
  const bestA = best(lapsA);
  const bestB = best(lapsB);

  // Lap-by-lap pace difference (B minus A) for laps both completed.
  const deltas = lapsA
    .map((la) => {
      const lb = lapsB.find((l) => l.lap_number === la.lap_number);
      if (!lb) return null;
      return { lap: la.lap_number, delta: (lb.lap_duration as number) - (la.lap_duration as number) };
    })
    .filter((x): x is { lap: number; delta: number } => x != null);
  const maxAbs = Math.max(0.3, ...deltas.map((d) => Math.abs(d.delta)));

  return (
    <div>
      <div className="row" style={{ marginBottom: 8 }}>
        {[0, 1].map((slot) => {
          const current = slot === 0 ? driverA : driverB;
          return (
            <label key={slot} className="dim small">
              {slot === 0 ? "Driver A" : "Driver B"}{" "}
              <select
                value={current}
                onChange={(e) => (slot === 0 ? setA(Number(e.target.value)) : setB(Number(e.target.value)))}
              >
                {p.drivers.map((d) => (
                  <option key={d.driver_number} value={d.driver_number}>
                    #{d.driver_number} {d.name_acronym}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>

      <p className="small">
        <strong>#{driverA}</strong> vs <strong>#{driverB}</strong> —{" "}
        {relative == null
          ? "relative gap unavailable at this moment."
          : relative <= 0
            ? `#${driverA} is ${Math.abs(relative).toFixed(3)}s ahead of #${driverB}.`
            : `#${driverB} is ${relative.toFixed(3)}s ahead of #${driverA}.`}
      </p>

      <div className="panel">
        <h3>Relative gap over the session</h3>
        <RelativeGap playback={p.playback} table={p.table} a={driverA} b={driverB} />
        <p className="dim small">
          Difference between their gaps to the leader across the whole session. Below the line = A ahead.
        </p>
      </div>

      <div className="panel">
        <h3>Lap pace, A vs B</h3>
        {deltas.length ? (
          <div className="delta-bars">
            {deltas.map((d) => {
              const width = (Math.abs(d.delta) / maxAbs) * 50;
              return (
                <button
                  key={d.lap}
                  className="delta-row"
                  title={`Lap ${d.lap}: ${d.delta >= 0 ? "B slower" : "B faster"} by ${Math.abs(d.delta).toFixed(3)}s`}
                  onClick={() => p.onSeek((d.lap / Math.max(1, lapsA.length)) * p.playback.state.dur)}
                >
                  <span className="dim">L{d.lap}</span>
                  <span className="delta-track">
                    <span
                      className={d.delta >= 0 ? "delta-b b-slower" : "delta-b b-faster"}
                      style={{ width: `${width}%` }}
                    />
                  </span>
                  <span className="mono small">{d.delta >= 0 ? "+" : "−"}{Math.abs(d.delta).toFixed(3)}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="dim small">No laps completed by both drivers in this session.</p>
        )}
      </div>

      <div className="panel">
        <h3>Head to head</h3>
        <table className="laps mono" style={{ fontSize: "0.82rem" }}>
          <tbody>
            <tr>
              <td>Best lap</td>
              <td>{bestA ? formatLapTime(bestA) : "—"}</td>
              <td>{bestB ? formatLapTime(bestB) : "—"}</td>
            </tr>
            <tr>
              <td>Laps measured</td>
              <td>{lapsA.length}</td>
              <td>{lapsB.length}</td>
            </tr>
            <tr>
              <td>Gap now</td>
              <td>{gapA == null ? "—" : `+${gapA.toFixed(3)}`}</td>
              <td>{gapB == null ? "—" : `+${gapB.toFixed(3)}`}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RelativeGap(p: {
  playback: { state: { t: number; dur: number; rev: number } };
  table: GapTable;
  a: number;
  b: number;
}) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvas) return;
    const style = getComputedStyle(document.documentElement);
    const line = style.getPropertyValue("--line").trim();
    const dim = style.getPropertyValue("--dim").trim();
    const amber = style.getPropertyValue("--amber").trim();
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(240, rect.width);
    const h = 150;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const entryA = p.table.get(p.a);
    const entryB = p.table.get(p.b);
    if (!entryA || !entryB) {
      ctx.fillStyle = dim;
      ctx.font = "12px 'Barlow', system-ui, sans-serif";
      ctx.fillText("Gap data unavailable for one of these drivers.", 12, 40);
      return;
    }
    const dur = Math.max(1, p.playback.state.dur);
    const padL = 8;
    const padB = 16;
    const mid = 60;
    const X = (t: number) => padL + (t / dur) * (w - padL - 8);
    let maxAbs = 1;
    const samples: { t: number; d: number }[] = [];
    for (let t = 0; t <= dur; t += Math.max(1, dur / 600)) {
      const ga = gapAt(p.table, p.a, t);
      const gb = gapAt(p.table, p.b, t);
      if (ga == null || gb == null) continue;
      samples.push({ t, d: ga - gb });
      maxAbs = Math.max(maxAbs, Math.abs(ga - gb));
    }
    ctx.strokeStyle = line;
    ctx.beginPath();
    ctx.moveTo(padL, mid);
    ctx.lineTo(w - 8, mid);
    ctx.stroke();
    ctx.strokeStyle = amber;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    samples.forEach((s, i) => {
      const y = mid - (s.d / maxAbs) * 45;
      i ? ctx.lineTo(X(s.t), y) : ctx.moveTo(X(s.t), y);
    });
    ctx.stroke();
    const px = X(Math.min(dur, p.playback.state.t));
    ctx.strokeStyle = dim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, 8);
    ctx.lineTo(px, h - padB);
    ctx.stroke();
    ctx.fillStyle = dim;
    ctx.font = "10px 'Barlow', system-ui, sans-serif";
    ctx.fillText(`±${maxAbs.toFixed(1)}s`, 10, 12);
    ctx.fillText("A ahead", 10, mid - 34);
    ctx.fillText("B ahead", 10, mid + 40);
  }, [canvas, p.table, p.a, p.b, p.playback.state.rev, p.playback.state.t, p.playback.state.dur]);

  return (
    <canvas
      ref={setCanvas}
      aria-label="Relative gap chart"
    />
  );
}
