import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { beginDraw, themeColors, useCanvasSize } from "../chart";
import { formatLapTime } from "../format";
import { formatClock } from "../session";
import type { Playback } from "../playbackStore";
import type { SpeedPoint } from "../types";

export interface SpeedSeries {
  driver: number;
  label: string;
  color: string;
  points: SpeedPoint[];
}

interface Props {
  playback: Playback;
  series: SpeedSeries[];
  /** Session-time window to draw (one lap under the playhead). */
  windowStart: number;
  windowEnd: number;
  lapLabel: string;
}

const H = 190;

function sample(points: SpeedPoint[], t: number): SpeedPoint | null {
  if (!points.length) return null;
  let lo = 0;
  let hi = points.length - 1;
  if (t <= points[0].t) return points[0];
  if (t >= points[hi].t) return points[hi];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t <= t) lo = mid;
    else hi = mid;
  }
  return points[lo];
}

/** Speed telemetry for the lap under the playhead, one line per chosen driver. */
export default function SpeedChart(p: Props) {
  const { canvasRef, wrapRef, width, dpr } = useCanvasSize(H);
  const [hoverT, setHoverT] = useState<number | null>(null);
  useSyncExternalStore(p.playback.subscribe, () => p.playback.state.rev);

  const span = Math.max(1, p.windowEnd - p.windowStart);
  const padL = 36;
  const padB = 20;
  const padT = 10;

  const xOf = (t: number, w: number) => padL + ((t - p.windowStart) / span) * (w - padL - 8);
  const tOf = (px: number, w: number) =>
    p.windowStart + ((px - padL) / Math.max(1, w - padL - 8)) * span;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !width) return;
    const draw = beginDraw(canvas, width, H, dpr);
    if (!draw) return;
    const { ctx, w, h } = draw;
    const c = themeColors();
    const X = (t: number) => xOf(t, w);
    const Y = (v: number) => padT + (1 - v / 340) * (h - padT - padB);

    ctx.strokeStyle = c.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, h - padB);
    ctx.lineTo(w - 8, h - padB);
    ctx.stroke();

    ctx.fillStyle = c.dim;
    ctx.font = "10px 'Barlow', system-ui, sans-serif";
    ctx.fillText("340", 4, padT + 6);
    ctx.fillText("0", 4, h - padB);
    ctx.fillText("km/h", 4, padT + 20);
    for (let s = 0; s <= span; s += 20) {
      const x = X(p.windowStart + s);
      if (x > w - 10) break;
      ctx.fillText(`${Math.round(s)}s`, x, h - 6);
    }

    // Grid at 100 km/h helps read values without hovering.
    ctx.strokeStyle = c.line;
    ctx.globalAlpha = 0.5;
    for (const v of [100, 200, 300]) {
      ctx.beginPath();
      ctx.moveTo(padL, Y(v));
      ctx.lineTo(w - 8, Y(v));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const dashes = [[], [6, 4], [2, 3], [10, 3, 2, 3]];
    let any = false;
    p.series.forEach((s, idx) => {
      const pts = s.points.filter((pt) => pt.t >= p.windowStart && pt.t <= p.windowEnd);
      if (pts.length < 2) return;
      any = true;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.8;
      ctx.setLineDash(dashes[idx % dashes.length]);
      ctx.beginPath();
      pts.forEach((pt, i) => (i ? ctx.lineTo(X(pt.t), Y(pt.v)) : ctx.moveTo(X(pt.t), Y(pt.v))));
      ctx.stroke();
      ctx.setLineDash([]);
    });

    if (hoverT != null) {
      ctx.strokeStyle = c.ink;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X(hoverT), padT);
      ctx.lineTo(X(hoverT), h - padB);
      ctx.stroke();
      ctx.globalAlpha = 1;
      for (const s of p.series) {
        const pt = sample(s.points, hoverT);
        if (!pt) continue;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(X(pt.t), Y(pt.v), 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (p.playback.state.t >= p.windowStart && p.playback.state.t <= p.windowEnd) {
      const px = X(p.playback.state.t);
      ctx.strokeStyle = c.amber;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(px, padT);
      ctx.lineTo(px, h - padB);
      ctx.stroke();
    }

    if (!any) {
      ctx.fillStyle = c.dim;
      ctx.font = "12px 'Barlow', system-ui, sans-serif";
      ctx.fillText("No telemetry in this lap for the chosen drivers.", padL + 8, 40);
    }
  }, [canvasRef, width, dpr, p.series, p.playback, p.windowStart, p.windowEnd, hoverT, span]);

  const hoverRows = useMemo(() => {
    if (hoverT == null) return [];
    return p.series.flatMap((s) => {
      const pt = sample(s.points, hoverT);
      return pt ? [{ label: s.label, color: s.color, v: Math.round(pt.v) }] : [];
    });
  }, [hoverT, p.series]);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <canvas
        ref={canvasRef}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setHoverT(tOf(e.clientX - rect.left, rect.width));
        }}
        onMouseLeave={() => setHoverT(null)}
      />
      {hoverT != null && (
        <div
          className="chart-tip"
          style={{ left: Math.min(Math.max(xOf(hoverT, width) + 10, 8), Math.max(8, width - 150)) }}
        >
          <strong>{formatClock(hoverT - p.windowStart)}</strong>
          {hoverRows.map((r) => (
            <div key={r.label}>
              <i style={{ background: r.color }} />
              {r.label} · {r.v} km/h
            </div>
          ))}
        </div>
      )}
      <div className="legend">
        <span className="dim">
          {p.lapLabel} · {formatLapTime(span)}
        </span>
        {p.series.map((s) => (
          <span key={s.driver}>
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
