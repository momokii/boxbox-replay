import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { interpolateAt, sampleAt, trailBefore } from "../playback";
import type { Playback } from "../playbackStore";
import type { Corner, DrsZone, LapPoint, LocPoint } from "../types";

export interface DotDef {
  driver: number;
  label: string;
  color: string;
}

interface Props {
  playback: Playback;
  outline: number[][];
  corners: Corner[];
  zones: DrsZone[];
  locs: Map<number, LocPoint[]>;
  cars: Map<number, LapPoint[]>;
  dots: DotDef[];
  highlight: number[];
  selectedCorner: string | null;
  onCorner: (label: string) => void;
}

const AMBER = "#FFB224";

export default function TrackMap(p: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
  useSyncExternalStore(p.playback.subscribe, () => p.playback.state.rev);

  const geom = useRef({ scale: 1, ox: 0, oy: 0, w: 0, h: 0, span: 1 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !p.outline.length) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = wrap.getBoundingClientRect();
    const w = Math.max(200, rect.width);
    const h = Math.max(240, Math.min(560, w * 0.62));
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const xs = p.outline.map((pt) => pt[0]);
    const ys = p.outline.map((pt) => pt[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const pad = 30;
    const scale = Math.min((w - pad * 2) / Math.max(1, maxX - minX), (h - pad * 2) / Math.max(1, maxY - minY));
    const ox = pad + (w - pad * 2 - (maxX - minX) * scale) / 2 - minX * scale;
    const oy = pad + (h - pad * 2 - (maxY - minY) * scale) / 2 - minY * scale;
    geom.current = { scale, ox, oy, w, h, span: Math.max(1, maxX - minX, maxY - minY) };
    const X = (x: number) => ox + x * scale;
    const Y = (y: number) => oy + y * scale;

    const t = p.playback.state.t;
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = "#3A4556";
    ctx.lineWidth = 3;
    ctx.beginPath();
    p.outline.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
    ctx.stroke();

    ctx.strokeStyle = AMBER;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 6;
    for (const z of p.zones) {
      ctx.beginPath();
      ctx.moveTo(X(z.x0), Y(z.y0));
      ctx.lineTo(X(z.x1), Y(z.y1));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.font = "10px monospace";
    for (const c of p.corners) {
      const cx = X(c.x);
      const cy = Y(c.y);
      ctx.fillStyle = p.selectedCorner === c.label ? "#FFFFFF" : AMBER;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 6);
      ctx.lineTo(cx + 6, cy);
      ctx.lineTo(cx, cy + 6);
      ctx.lineTo(cx - 6, cy);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = AMBER;
      ctx.fillText(c.label, cx + 8, cy - 8);
    }

    for (const d of p.dots) {
      const pts = p.locs.get(d.driver) ?? [];
      if (!pts.length) continue;
      const dim = p.highlight.length > 0 && !p.highlight.includes(d.driver);
      const pos = interpolateAt(pts, t);
      if (!pos) continue;
      const tail = trailBefore(pts, t, 5);
      if (tail.length > 1) {
        ctx.strokeStyle = d.color;
        ctx.globalAlpha = dim ? 0.08 : 0.3;
        ctx.lineWidth = 4;
        ctx.beginPath();
        tail.forEach((pt, i) => (i ? ctx.lineTo(X(pt.x), Y(pt.y)) : ctx.moveTo(X(pt.x), Y(pt.y))));
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = d.color;
      ctx.globalAlpha = dim ? 0.35 : 1;
      ctx.beginPath();
      ctx.arc(X(pos.x), Y(pos.y), 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#0B0E13";
      ctx.font = "8px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(d.label.replace("#", ""), X(pos.x), Y(pos.y));
      ctx.globalAlpha = 1;
    }
  });

  const toWorld = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const { scale, ox, oy } = geom.current;
    return { x: (e.clientX - rect.left - ox) / scale, y: (e.clientY - rect.top - oy) / scale };
  };

  const onClick = (e: React.MouseEvent) => {
    const wpt = toWorld(e);
    if (!wpt || !p.corners.length) return;
    const span = geom.current.span;
    let best: Corner | null = null;
    let bestD = span * 0.03;
    for (const c of p.corners) {
      const d = Math.hypot(c.x - wpt.x, c.y - wpt.y);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (best) p.onCorner(best.label);
  };

  const onMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const { scale, ox, oy } = geom.current;
    const t = p.playback.state.t;
    let found: { x: number; y: number; text: string } | null = null;
    for (const d of p.dots) {
      const pos = interpolateAt(p.locs.get(d.driver) ?? [], t);
      if (!pos) continue;
      const sx = ox + pos.x * scale;
      const sy = oy + pos.y * scale;
      if (Math.hypot(sx - mx, sy - my) < 16) {
        const car = sampleAt(p.cars.get(d.driver) ?? [], t);
        const extra = car ? `${car.speed.toFixed(0)} km/h, gear ${car.n_gear}, thr ${car.throttle}` : "no telemetry";
        found = { x: mx + 12, y: my + 12, text: `${d.label} · ${extra}` };
        break;
      }
    }
    setHover(found);
    canvas.style.cursor = found ? "pointer" : "default";
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <canvas ref={canvasRef} onClick={onClick} onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      {hover && (
        <div
          style={{
            position: "absolute",
            left: hover.x,
            top: hover.y,
            background: "#0B0E13",
            border: "1px solid #2A3342",
            padding: "4px 8px",
            fontSize: "0.75rem",
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          {hover.text}
        </div>
      )}
    </div>
  );
}
