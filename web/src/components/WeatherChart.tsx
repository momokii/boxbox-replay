import { useEffect, useRef } from "react";
import { formatClock } from "../session";
import type { SpeedPoint } from "../types";

export interface WeatherPoint {
  t: number;
  air_temperature: number | null;
  track_temperature: number | null;
  humidity: number | null;
  rainfall: number | null;
}

interface Props {
  points: WeatherPoint[];
  duration: number;
  onSeek?: (t: number) => void;
}

/** Air and track temperature across the whole session. */
export default function WeatherChart(p: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const data = p.points.filter((w) => w.t >= 0 && w.track_temperature != null);
  const latest = data[data.length - 1];

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
    const h = 130;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (!data.length) {
      ctx.fillStyle = dim;
      ctx.font = "12px 'Barlow', system-ui, sans-serif";
      ctx.fillText("No weather data for this session.", 10, 40);
      return;
    }

    const padL = 34;
    const padB = 18;
    const padT = 10;
    const dur = Math.max(1, p.duration);
    const temps = data.flatMap((d) => [d.air_temperature ?? 0, d.track_temperature ?? 0]).filter((v) => v > 0);
    const lo = Math.min(...temps) - 2;
    const hi = Math.max(...temps) + 2;
    const X = (t: number) => padL + (t / dur) * (w - padL - 8);
    const Y = (v: number) => padT + (1 - (v - lo) / Math.max(1, hi - lo)) * (h - padT - padB);

    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, h - padB);
    ctx.lineTo(w - 8, h - padB);
    ctx.stroke();

    const draw = (key: "air_temperature" | "track_temperature", colour: string) => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      let started = false;
      for (const d of data) {
        const v = d[key];
        if (v == null) continue;
        const x = X(d.t);
        const y = Y(v);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    };
    draw("track_temperature", amber);
    draw("air_temperature", dim);

    ctx.fillStyle = dim;
    ctx.font = "10px 'Barlow', system-ui, sans-serif";
    ctx.fillText(`${hi.toFixed(0)}°C`, 4, padT + 6);
    ctx.fillText(`${lo.toFixed(0)}°C`, 4, h - padB);
    ctx.fillText(formatClock(dur), w - 46, h - 3);
  }, [p.points, p.duration]);

  return (
    <div ref={wrapRef}>
      <canvas ref={canvasRef} aria-label="Weather over the session" />
      <div className="legend">
        <span>
          <i style={{ background: "var(--amber)" }} /> Track {latest?.track_temperature?.toFixed(1) ?? "—"}°C
        </span>
        <span>
          <i style={{ background: "var(--dim)" }} /> Air {latest?.air_temperature?.toFixed(1) ?? "—"}°C
        </span>
        <span className="dim">Humidity {latest?.humidity?.toFixed(0) ?? "—"}%</span>
        <span className="dim">Rain {latest?.rainfall?.toFixed(0) ?? "—"}mm</span>
      </div>
    </div>
  );
}

export type { SpeedPoint };
