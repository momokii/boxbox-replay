import { useEffect, useMemo, useState } from "react";
import { beginDraw, themeColors, useCanvasSize } from "../chart";
import { formatLapTime } from "../format";
import type { Lap } from "../types";

interface Props {
  laps: Lap[];
  anchor: number;
  challengers: number[];
  labels: Map<number, string>;
  colors: Map<number, string>;
}

const H = 260;

/** Larger lap-pace comparison: deltas to the anchor, plus every lap time. */
export default function BattleFullView(p: Props) {
  const { canvasRef, wrapRef, width, dpr } = useCanvasSize(H);
  const [hover, setHover] = useState<{ lap: number; x: number } | null>(null);

  const rows = useMemo(() => {
    const anchorLaps = p.laps
      .filter((l) => l.driver_number === p.anchor && l.lap_duration != null)
      .sort((x, y) => x.lap_number - y.lap_number);
    return anchorLaps.map((la) => {
      const values = p.challengers.map((d) => {
        const lb = p.laps.find(
          (l) => l.driver_number === d && l.lap_number === la.lap_number && l.lap_duration != null,
        );
        return {
          driver: d,
          time: lb ? (lb.lap_duration as number) : null,
          delta: lb ? (lb.lap_duration as number) - (la.lap_duration as number) : null,
        };
      });
      return { lap: la.lap_number, ta: la.lap_duration as number, values };
    });
  }, [p.laps, p.anchor, p.challengers]);

  const maxLap = Math.max(1, ...rows.map((r) => r.lap));
  const flat = rows.flatMap((r) => r.values.map((v) => v.delta)).filter((v): v is number => v != null).map(Math.abs);
  const sortedAbs = [...flat].sort((x, y) => x - y);
  const p95 = sortedAbs.length ? sortedAbs[Math.floor(sortedAbs.length * 0.95)] : 0.5;
  const maxAbs = Math.max(0.5, Math.min(Math.max(...flat, 0.5), p95 * 1.1));

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
    ctx.fillText("challenger slower", padL + 4, padT + 10);
    ctx.fillText("challenger faster", padL + 4, h - padB - 4);
    for (let lap = 10; lap <= maxLap; lap += 10) ctx.fillText(String(lap), X(lap) - 5, h - 6);

    if (!rows.length) {
      ctx.fillText("No laps completed by the anchor.", padL + 8, mid - 10);
      return;
    }

    rows.forEach((r) => {
      r.values.forEach((v) => {
        if (v.delta == null) return;
        const clamped = Math.max(-maxAbs, Math.min(maxAbs, v.delta));
        const x = X(r.lap);
        const y = Y(clamped);
        ctx.strokeStyle = p.colors.get(v.driver) ?? c.amber;
        ctx.globalAlpha = 0.75;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, mid);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = p.colors.get(v.driver) ?? c.amber;
        ctx.beginPath();
        ctx.arc(x, y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      });
    });

    if (hover) {
      const r = rows.find((x) => x.lap === hover.lap);
      if (r) {
        ctx.strokeStyle = c.ink;
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(X(r.lap), padT);
        ctx.lineTo(X(r.lap), h - padB);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }, [canvasRef, width, dpr, rows, hover, maxLap, maxAbs, p.colors]);

  const hovered = hover ? rows.find((r) => r.lap === hover.lap) : null;

  return (
    <div>
      <div className="row" style={{ gap: 16, marginBottom: 8 }}>
        {[p.anchor, ...p.challengers].map((d) => (
          <span key={d} className="small">
            <i className="tower-chip" style={{ background: p.colors.get(d), display: "inline-block", marginRight: 6 }} />
            {p.labels.get(d) ?? `#${d}`}
            {d === p.anchor ? " (anchor)" : ""}
          </span>
        ))}
        <span className="dim small">Bars above the line: that challenger was slower than the anchor on the lap.</span>
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
          <div className="chart-tip" style={{ left: Math.min(Math.max(hover!.x + 10, 8), Math.max(8, width - 200)) }}>
            <strong>Lap {hovered.lap}</strong>
            <div>
              <i style={{ background: p.colors.get(p.anchor) }} /> {p.labels.get(p.anchor) ?? `#${p.anchor}`}{" "}
              {formatLapTime(hovered.ta)}
            </div>
            {hovered.values.map((v) => (
              <div key={v.driver}>
                <i style={{ background: p.colors.get(v.driver) }} /> {p.labels.get(v.driver) ?? `#${v.driver}`}{" "}
                {v.time == null ? "no lap" : formatLapTime(v.time)}
                {v.delta != null ? ` (${v.delta >= 0 ? "+" : "−"}${Math.abs(v.delta).toFixed(3)})` : ""}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="laps-wrap" style={{ maxHeight: "34vh", marginTop: 10 }}>
        <table className="laps mono" style={{ fontSize: "0.8rem" }}>
          <thead>
            <tr>
              <th>Lap</th>
              <th>{p.labels.get(p.anchor) ?? `#${p.anchor}`}</th>
              {p.challengers.map((d) => (
                <th key={d}>{p.labels.get(d) ?? `#${d}`}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.lap}>
                <td>{r.lap}</td>
                <td>{formatLapTime(r.ta)}</td>
                {r.values.map((v) => (
                  <td key={v.driver} className={v.delta != null && v.delta < 0 ? "sector-personal" : ""}>
                    {v.time == null ? "—" : formatLapTime(v.time)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
