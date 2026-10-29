import { useEffect, useRef, useSyncExternalStore } from "react";
import { formatLapTime } from "../format";
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

/** Speed telemetry for the lap under the playhead, one line per chosen driver. */
export default function SpeedChart(p: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  useSyncExternalStore(p.playback.subscribe, () => p.playback.state.rev);

  const span = Math.max(1, p.windowEnd - p.windowStart);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const style = getComputedStyle(document.documentElement);
    const line = style.getPropertyValue("--line").trim();
    const dim = style.getPropertyValue("--dim").trim();
    const amber = style.getPropertyValue("--amber").trim();
    const dpr = window.devicePixelRatio || 1;
    const rect = wrap.getBoundingClientRect();
    const w = Math.max(240, rect.width);
    const h = 170;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const padL = 36;
    const padB = 20;
    const padT = 10;
    const span2 = Math.max(1, p.windowEnd - p.windowStart);
    const X = (t: number) => padL + ((t - p.windowStart) / span2) * (w - padL - 8);
    const Y = (v: number) => padT + (1 - v / 340) * (h - padT - padB);

    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, h - padB);
    ctx.lineTo(w - 8, h - padB);
    ctx.stroke();

    ctx.fillStyle = dim;
    ctx.font = "10px 'Barlow', system-ui, sans-serif";
    ctx.fillText("340", 4, padT + 6);
    ctx.fillText("0", 4, h - padB);
    ctx.fillText("km/h", 4, padT + 20);
    for (let s = 0; s <= span2; s += 20) {
      const x = X(p.windowStart + s);
      if (x > w - 10) break;
      ctx.fillText(`${Math.round(s)}s`, x, h - 6);
    }

    let any = false;
    const dashes = [[], [6, 4], [2, 3], [10, 3, 2, 3]];
    let idx = 0;
    for (const s of p.series) {
      const dash = dashes[idx % dashes.length];
      idx += 1;
      const pts = s.points.filter((pt) => pt.t >= p.windowStart && pt.t <= p.windowEnd);
      if (pts.length < 2) continue;
      any = true;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.8;
      ctx.setLineDash(dash);
      ctx.beginPath();
      pts.forEach((pt, i) => (i ? ctx.lineTo(X(pt.t), Y(pt.v)) : ctx.moveTo(X(pt.t), Y(pt.v))));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (p.playback.state.t >= p.windowStart && p.playback.state.t <= p.windowEnd) {
      const px = X(p.playback.state.t);
      ctx.strokeStyle = amber;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(px, padT);
      ctx.lineTo(px, h - padB);
      ctx.stroke();
    }

    if (!any) {
      ctx.fillStyle = dim;
      ctx.font = "12px 'Barlow', system-ui, sans-serif";
      ctx.fillText("No telemetry in this lap for the chosen drivers.", padL + 8, 40);
    }
  });

  return (
    <div ref={wrapRef}>
      <canvas ref={canvasRef} />
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
