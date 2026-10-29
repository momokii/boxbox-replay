import { useEffect, useRef, useSyncExternalStore } from "react";
import type { Playback } from "../playbackStore";

export interface TraceSeries {
  label: string;
  color: string;
  t: number[];
  speed: number[];
}

interface Props {
  playback: Playback;
  series: TraceSeries[];
}

const AMBER = "#FFB224";

export default function SpeedStrip(p: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  useSyncExternalStore(p.playback.subscribe, () => p.playback.state.rev);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !p.series.length) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = wrap.getBoundingClientRect();
    const w = Math.max(200, rect.width);
    const h = 180;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const padL = 40;
    const padB = 20;
    const padT = 8;
    const allT = p.series.flatMap((s) => s.t);
    const allS = p.series.flatMap((s) => s.speed);
    const tMax = Math.max(1, ...allT);
    const sMax = Math.max(50, ...allS);
    const X = (t: number) => padL + (t / tMax) * (w - padL - 8);
    const Y = (s: number) => padT + (1 - s / sMax) * (h - padT - padB);

    ctx.strokeStyle = "#2A3342";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, h - padB);
    ctx.lineTo(w - 8, h - padB);
    ctx.stroke();

    ctx.fillStyle = "#8A94A6";
    ctx.font = "10px monospace";
    ctx.fillText(`${Math.round(sMax)}`, 4, padT + 8);
    ctx.fillText("km/h", 4, h - padB - 14);
    ctx.fillText(`${tMax.toFixed(0)}s`, w - 30, h - 6);

    for (const s of p.series) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      s.t.forEach((t, i) => (i ? ctx.lineTo(X(t), Y(s.speed[i])) : ctx.moveTo(X(t), Y(s.speed[i]))));
      ctx.stroke();
    }

    const px = X(p.playback.state.t);
    ctx.strokeStyle = AMBER;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, padT);
    ctx.lineTo(px, h - padB);
    ctx.stroke();
  });

  return (
    <div ref={wrapRef}>
      <canvas ref={canvasRef} />
      <div className="row dim" style={{ fontSize: "0.75rem" }}>
        {p.series.map((s) => (
          <span key={s.label} style={{ color: s.color }}>
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
