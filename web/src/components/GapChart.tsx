import { useEffect, useRef } from "react";
import type { IntervalPoint } from "../types";

interface Props {
  intervals: IntervalPoint[];
  drivers: number[];
  labels: Map<number, string>;
  colors: Map<number, string>;
}

export default function GapChart(p: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = wrap.getBoundingClientRect();
    const w = Math.max(200, rect.width);
    const h = 200;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const rows = p.intervals.filter(
      (r) => p.drivers.includes(r.driver_number) && r.gap_to_leader != null,
    );
    const padL = 40;
    const padB = 20;
    const padT = 8;
    ctx.strokeStyle = "#2A3342";
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, h - padB);
    ctx.lineTo(w - 8, h - padB);
    ctx.stroke();
    if (!rows.length) {
      ctx.fillStyle = "#8A94A6";
      ctx.font = "12px monospace";
      ctx.fillText("No interval data", padL + 8, 40);
      return;
    }
    const ts = rows.map((r) => Date.parse(r.date));
    const t0 = Math.min(...ts);
    const t1 = Math.max(...ts);
    const span = Math.max(1, t1 - t0);
    const maxGap = Math.max(1, ...rows.map((r) => r.gap_to_leader as number));
    const X = (d: string) => padL + ((Date.parse(d) - t0) / span) * (w - padL - 8);
    const Y = (g: number) => padT + (1 - g / maxGap) * (h - padT - padB);

    ctx.fillStyle = "#8A94A6";
    ctx.font = "10px monospace";
    ctx.fillText(`+${maxGap.toFixed(1)}s`, 2, padT + 8);

    const byDriver = new Map<number, typeof rows>();
    for (const r of rows) {
      const g = byDriver.get(r.driver_number) ?? [];
      g.push(r);
      byDriver.set(r.driver_number, g);
    }
    byDriver.forEach((g, n) => {
      const sorted = [...g].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
      ctx.strokeStyle = p.colors.get(n) ?? "#8A94A6";
      ctx.lineWidth = 2;
      ctx.beginPath();
      sorted.forEach((r, i) =>
        i ? ctx.lineTo(X(r.date), Y(r.gap_to_leader as number)) : ctx.moveTo(X(r.date), Y(r.gap_to_leader as number)),
      );
      ctx.stroke();
      const last = sorted[sorted.length - 1];
      ctx.fillStyle = p.colors.get(n) ?? "#8A94A6";
      ctx.fillText(p.labels.get(n) ?? `#${n}`, X(last.date) + 4, Y(last.gap_to_leader as number));
    });
  });

  return (
    <div ref={wrapRef}>
      <canvas ref={canvasRef} />
    </div>
  );
}
