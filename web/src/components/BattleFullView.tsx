import { useEffect, useMemo, useState } from "react";
import { beginDraw, themeColors, useCanvasSize } from "../chart";
import { formatLapTime } from "../format";
import type { Lap } from "../types";

interface Props {
  laps: Lap[];
  a: number;
  b: number;
  labelA: string;
  labelB: string;
  colorA: string;
  colorB: string;
}

const H = 260;

/** Larger, readable lap-pace comparison: delta per lap plus both lap times. */
export default function BattleFullView(p: Props) {
  const { canvasRef, wrapRef, width, dpr } = useCanvasSize(H);
  const [hover, setHover] = useState<{ lap: number; x: number } | null>(null);

  const deltas = useMemo(() => {
    const of = (d: number) =>
      p.laps.filter((l) => l.driver_number === d && l.lap_duration != null).sort((x, y) => x.lap_number - y.lap_number);
    const a = of(p.a);
    const b = of(p.b);
    return a
      .map((la) => {
        const lb = b.find((l) => l.lap_number === la.lap_number);
        if (!lb) return null;
        return {
          lap: la.lap_number,
          ta: la.lap_duration as number,
          tb: lb.lap_duration as number,
          delta: (lb.lap_duration as number) - (la.lap_duration as number),
        };
      })
      .filter((x): x is { lap: number; ta: number; tb: number; delta: number } => x != null);
  }, [p.laps, p.a, p.b]);

  const maxLap = Math.max(1, ...deltas.map((d) => d.lap));
  // Scale to the 95th percentile so one pit-stop lap cannot flatten the rest.
  const sortedAbs = [...deltas.map((d) => Math.abs(d.delta))].sort((x, y) => x - y);
  const p95 = sortedAbs.length ? sortedAbs[Math.floor(sortedAbs.length * 0.95)] : 0.5;
  const maxAbs = Math.max(0.5, Math.min(Math.max(...deltas.map((d) => Math.abs(d.delta))), p95 * 1.1));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !width) return;
    const draw = beginDraw(canvas, width, H, dpr);
    if (!draw) return;
    const { ctx, w, h } = draw;
    const c = themeColors();
    const padL = 52;
    const padB = 22;
    const padT = 14;
    const mid = (h - padB + padT) / 2;
    const amp = (h - padB - padT) / 2 - 8;
    const X = (lap: number) => padL + (lap / maxLap) * (w - padL - 10);
    const Y = (d: number) => mid - (d / maxAbs) * amp;

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
    ctx.fillText(`${p.labelB} slower`, padL + 4, padT + 10);
    ctx.fillText(`scale ±${maxAbs.toFixed(1)}s`, w - 92, padT + 10);
    ctx.fillText(`${p.labelA} slower`, padL + 4, h - padB - 4);
    for (let lap = 10; lap <= maxLap; lap += 10) {
      ctx.fillText(String(lap), X(lap) - 5, h - 6);
    }

    if (!deltas.length) {
      ctx.fillText("No laps completed by both drivers.", padL + 8, mid - 10);
      return;
    }

    // Zero line bars: above = B slower, below = A slower.
    deltas.forEach((d) => {
      const x = X(d.lap);
      const clamped = Math.max(-maxAbs, Math.min(maxAbs, d.delta));
      const y = Y(clamped);
      ctx.strokeStyle = d.delta >= 0 ? c.amber : c.green;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, mid);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = d.delta >= 0 ? c.amber : c.green;
      ctx.beginPath();
      ctx.arc(x, y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    });

    if (hover) {
      const d = deltas.find((x) => x.lap === hover.lap);
      if (d) {
        ctx.strokeStyle = c.ink;
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(X(d.lap), padT);
        ctx.lineTo(X(d.lap), h - padB);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = c.amber;
        ctx.beginPath();
        ctx.arc(X(d.lap), Y(d.delta), 3.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [canvasRef, width, dpr, deltas, hover, maxLap, maxAbs, p.labelA, p.labelB, p.a, p.b]);

  const hovered = hover ? deltas.find((d) => d.lap === hover.lap) : null;

  return (
    <div>
      <div className="row" style={{ gap: 16, marginBottom: 8 }}>
        <span className="small">
          <i className="tower-chip" style={{ background: p.colorA, display: "inline-block", marginRight: 6 }} />
          {p.labelA}
        </span>
        <span className="small">
          <i className="tower-chip" style={{ background: p.colorB, display: "inline-block", marginRight: 6 }} />
          {p.labelB}
        </span>
        <span className="dim small">
          Bars above the line mean {p.labelB} was slower on that lap; below means {p.labelA} was.
        </span>
      </div>

      <div ref={wrapRef} style={{ position: "relative" }}>
        <canvas
          ref={canvasRef}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const lap = Math.round(((e.clientX - rect.left - 52) / Math.max(1, rect.width - 62)) * maxLap);
            setHover({ lap, x: e.clientX - rect.left });
          }}
          onMouseLeave={() => setHover(null)}
        />
        {hovered && (
          <div className="chart-tip" style={{ left: Math.min(Math.max(hover!.x + 10, 8), Math.max(8, width - 190)) }}>
            <strong>Lap {hovered.lap}</strong>
            <div>
              <i style={{ background: p.colorA }} /> {p.labelA} {formatLapTime(hovered.ta)}
            </div>
            <div>
              <i style={{ background: p.colorB }} /> {p.labelB} {formatLapTime(hovered.tb)}
            </div>
            <div className="dim">
              {hovered.delta >= 0 ? p.labelB : p.labelA} slower by {Math.abs(hovered.delta).toFixed(3)}s
            </div>
          </div>
        )}
      </div>

      <div className="laps-wrap" style={{ maxHeight: "34vh", marginTop: 10 }}>
        <table className="laps mono" style={{ fontSize: "0.8rem" }}>
          <thead>
            <tr>
              <th>Lap</th>
              <th>{p.labelA}</th>
              <th>{p.labelB}</th>
              <th>Delta</th>
            </tr>
          </thead>
          <tbody>
            {deltas.map((d) => (
              <tr key={d.lap}>
                <td>{d.lap}</td>
                <td>{formatLapTime(d.ta)}</td>
                <td>{formatLapTime(d.tb)}</td>
                <td className={d.delta >= 0 ? "" : "sector-personal"}>
                  {d.delta >= 0 ? "+" : "−"}
                  {Math.abs(d.delta).toFixed(3)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
