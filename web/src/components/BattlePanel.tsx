import { useEffect, useMemo, useState } from "react";
import { beginDraw, themeColors, useCanvasSize } from "../chart";
import { formatClock, gapAt, type GapTable } from "../session";
import Info from "./Info";
import { formatLapTime } from "../format";
import type { Driver, Lap } from "../types";

interface Props {
  playback: { state: { t: number; dur: number; rev: number } };
  sessionKey: number;
  table: GapTable;
  drivers: Driver[];
  laps: Lap[];
  onSeek: (t: number) => void;
  overtakes: { t: number; overtaking_driver_number: number; overtaken_driver_number: number; position: number | null }[];
  codes: Map<number, string>;
  labels: Map<number, string>;
}

const H = 190;

/**
 * Battle view: two drivers, their relative gap across the WHOLE session and a
 * lap-by-lap pace comparison. The playhead is shared with the replay clock.
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

  const deltas = useMemo(
    () =>
      lapsA
        .map((la) => {
          const lb = lapsB.find((l) => l.lap_number === la.lap_number);
          if (!lb) return null;
          return { lap: la.lap_number, delta: (lb.lap_duration as number) - (la.lap_duration as number) };
        })
        .filter((x): x is { lap: number; delta: number } => x != null),
    [lapsA, lapsB],
  );
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
        <strong>{p.labels.get(driverA) ?? `#${driverA}`}</strong> vs{" "}
        <strong>{p.labels.get(driverB) ?? `#${driverB}`}</strong> —{" "}
        {relative == null
          ? "relative gap unavailable at this moment."
          : relative <= 0
            ? `${p.labels.get(driverA) ?? `#${driverA}`} is ${Math.abs(relative).toFixed(3)}s ahead of ${p.labels.get(driverB) ?? `#${driverB}`}.`
            : `${p.labels.get(driverB) ?? `#${driverB}`} is ${relative.toFixed(3)}s ahead of ${p.labels.get(driverA) ?? `#${driverA}`}.`}
      </p>

      <div className="panel">
        <h3>
          <Info
            label="Relative gap over the session"
            tip="For each moment, A's gap to the leader minus B's. Above the line means A is behind; below the line means A is ahead. Hover the chart for exact values."
          />
        </h3>
        <RelativeGap playback={p.playback} table={p.table} a={driverA} b={driverB} />
        <p className="dim small">
          Difference between their gaps to the leader across the whole session. The dashed line is zero — the
          moment they are side by side.
        </p>
      </div>

      <div className="panel">
        <h3>
          <Info
            label="Lap pace, A vs B"
            tip="Each row is one lap both drivers completed. The bar shows how much slower B was than A on that lap (right = B slower, left = B faster). Click a row to move the replay to that lap."
          />
        </h3>
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
                  <span className="mono small">
                    {d.delta >= 0 ? "+" : "−"}
                    {Math.abs(d.delta).toFixed(3)}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="dim small">No laps completed by both drivers in this session.</p>
        )}
      </div>

      <div className="panel">
        <h3>
          <Info
            label="Overtakes involving these two"
            tip="Passes recorded by the timing feed where either driver was the passer or the passed. Click a row to jump the replay there."
          />
        </h3>
        {(() => {
          const rel = p.overtakes
            .filter(
              (o) =>
                o.overtaking_driver_number === driverA ||
                o.overtaken_driver_number === driverA ||
                o.overtaking_driver_number === driverB ||
                o.overtaken_driver_number === driverB,
            )
            .sort((x, y) => x.t - y.t)
            .slice(0, 8);
          if (!rel.length) return <p className="dim small">None recorded between these two drivers.</p>;
          return (
            <div className="event-list">
              {rel.map((o, i) => (
                <button key={i} className="event-row rc" onClick={() => p.onSeek(o.t)}>
                  <span className="mono dim">{formatClock(o.t)}</span>
                  <span className="small">
                    {p.codes.get(o.overtaking_driver_number) ?? `#${o.overtaking_driver_number}`} passed{" "}
                    {p.codes.get(o.overtaken_driver_number) ?? `#${o.overtaken_driver_number}`}
                    {o.position != null ? ` for P${o.position}` : ""}
                  </span>
                </button>
              ))}
            </div>
          );
        })()}
      </div>

      <div className="panel">
        <h3>Head to head</h3>
        <table className="laps mono" style={{ fontSize: "0.82rem" }}>
          <thead>
            <tr>
              <th>&nbsp;</th>
              <th>{p.labels.get(driverA) ?? `#${driverA}`}</th>
              <th>{p.labels.get(driverB) ?? `#${driverB}`}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <Info label="Best lap" tip="Each driver's fastest measured lap of the session." />
              </td>
              <td>{bestA ? formatLapTime(bestA) : "—"}</td>
              <td>{bestB ? formatLapTime(bestB) : "—"}</td>
            </tr>
            <tr>
              <td>
                <Info label="Laps measured" tip="Laps with a timing value. Missing laps mean the feed has no time for them." />
              </td>
              <td>{lapsA.length}</td>
              <td>{lapsB.length}</td>
            </tr>
            <tr>
              <td>
                <Info
                  label="Gap now"
                  tip="Seconds behind the RACE LEADER at the replay clock — not the gap between these two drivers. The line above the chart gives their gap to each other."
                />
              </td>
              <td>{gapA == null ? "—" : `+${gapA.toFixed(3)}`}</td>
              <td>{gapB == null ? "—" : `+${gapB.toFixed(3)}`}</td>
            </tr>
            <tr>
              <td>
                <Info label="Between them" tip="The gap from one driver to the other at the replay clock." />
              </td>
              <td colSpan={2}>{relative == null ? "—" : `${Math.abs(relative).toFixed(3)}s`}</td>
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
  const { canvasRef, wrapRef, width, dpr } = useCanvasSize(H);
  const [hoverT, setHoverT] = useState<number | null>(null);
  const dur = Math.max(1, p.playback.state.dur);

  const samples = useMemo(() => {
    const out: { t: number; d: number; ga: number; gb: number }[] = [];
    const step = Math.max(1, dur / 900);
    for (let t = 0; t <= dur; t += step) {
      const ga = gapAt(p.table, p.a, t);
      const gb = gapAt(p.table, p.b, t);
      if (ga == null || gb == null) continue;
      out.push({ t, d: ga - gb, ga, gb });
    }
    return out;
  }, [p.table, p.a, p.b, dur]);

  const maxAbs = Math.max(1, ...samples.map((s) => Math.abs(s.d)));
  const padL = 44;
  const padB = 18;
  const padT = 12;
  const mid = (H - padB + padT) / 2;
  const amp = (H - padB - padT) / 2 - 6;
  const X = (t: number, w: number) => padL + (t / dur) * (w - padL - 8);
  const Y = (d: number) => mid - (d / maxAbs) * amp;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !width) return;
    const draw = beginDraw(canvas, width, H, dpr);
    if (!draw) return;
    const { ctx, w, h } = draw;
    const c = themeColors();

    ctx.strokeStyle = c.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, h - padB);
    ctx.lineTo(w - 8, h - padB);
    ctx.stroke();

    ctx.strokeStyle = c.dim;
    ctx.globalAlpha = 0.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padL, mid);
    ctx.lineTo(w - 8, mid);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    ctx.fillStyle = c.dim;
    ctx.font = "10px 'Barlow', system-ui, sans-serif";
    ctx.fillText(`+${maxAbs.toFixed(1)}s`, 2, padT + 6);
    ctx.fillText("0", 2, mid + 3);
    ctx.fillText(`−${maxAbs.toFixed(1)}s`, 2, h - padB);
    ctx.fillText("B ahead", padL + 4, padT + 10);
    ctx.fillText("A ahead", padL + 4, h - padB - 4);
    ctx.fillText(formatClock(dur), w - 46, h - 3);

    if (!samples.length) {
      ctx.fillText("Gap data unavailable for one of these drivers.", padL + 8, 40);
      return;
    }

    ctx.strokeStyle = c.amber;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    samples.forEach((s, i) => (i ? ctx.lineTo(X(s.t, w), Y(s.d)) : ctx.moveTo(X(s.t, w), Y(s.d))));
    ctx.stroke();

    if (hoverT != null) {
      ctx.strokeStyle = c.ink;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X(hoverT, w), padT);
      ctx.lineTo(X(hoverT, w), h - padB);
      ctx.stroke();
      ctx.globalAlpha = 1;
      const near = samples.reduce((best, s) => (Math.abs(s.t - hoverT) < Math.abs(best.t - hoverT) ? s : best), samples[0]);
      ctx.fillStyle = c.amber;
      ctx.beginPath();
      ctx.arc(X(near.t, w), Y(near.d), 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    const px = X(Math.min(dur, p.playback.state.t), w);
    ctx.strokeStyle = c.amber;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(px, padT);
    ctx.lineTo(px, h - padB);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }, [canvasRef, width, dpr, samples, hoverT, dur, maxAbs, mid, amp, padB, padT, p.playback.state.t]);

  const hover = hoverT == null
    ? null
    : samples.reduce((best, s) => (Math.abs(s.t - hoverT) < Math.abs(best.t - hoverT) ? s : best), samples[0]);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <canvas
        ref={canvasRef}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setHoverT(((e.clientX - rect.left - padL) / Math.max(1, rect.width - padL - 8)) * dur);
        }}
        onMouseLeave={() => setHoverT(null)}
      />
      {hover && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(X(hover.t, width) + 10, 8), Math.max(8, width - 160)) }}>
          <strong>{formatClock(hover.t)}</strong>
          <div>#{p.a} ahead by {Math.abs(hover.d).toFixed(3)}s</div>
          <div className="dim">#{p.a} +{hover.ga.toFixed(3)} · #{p.b} +{hover.gb.toFixed(3)} to leader</div>
        </div>
      )}
    </div>
  );
}
