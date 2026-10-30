import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { posAt, trailAt } from "../session";
import type { Playback } from "../playbackStore";
import type { Corner, DrsZone, ReplayDriver } from "../types";

export interface DotMeta {
  driver: number;
  code: string;
  color: string;
}

interface Props {
  playback: Playback;
  outline: number[][];
  corners: Corner[];
  zones: DrsZone[];
  replay: Map<number, ReplayDriver>;
  dots: DotMeta[];
  highlight: number[];
  angle: number;
  selectedCorner: string | null;
  selectedDriver: number | null;
  onCorner: (label: string) => void;
  onDriver: (driver: number) => void;
  hoverInfo: (driver: number) => { pos: number | null; gap: number | null; tyre: string | null; speed: number | null };
}

const TRAIL_S = 6;

function rotate(x: number, y: number, deg: number): { x: number; y: number } {
  if (!deg) return { x, y };
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: x * c - y * s, y: x * s + y * c };
}

function HoverCard(p: {
  hover: { x: number; y: number; driver: number };
  dots: DotMeta[];
  info: { pos: number | null; gap: number | null; tyre: string | null; speed: number | null };
}) {
  const meta = p.dots.find((d) => d.driver === p.hover.driver);
  return (
    <div className="driver-hover" style={{ left: p.hover.x, top: p.hover.y }}>
      <strong style={{ color: meta?.color }}>
        #{p.hover.driver} {meta?.code ?? ""}
      </strong>
      <div>
        P{p.info.pos ?? "—"} · gap {p.info.gap == null ? "—" : `+${p.info.gap.toFixed(3)}`}
      </div>
      <div>{p.info.tyre ?? "tyre unknown"}</div>
      <div>{p.info.speed == null ? "speed loading…" : `${p.info.speed} km/h`}</div>
    </div>
  );
}

export default function SessionMap(p: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; driver: number } | null>(null);
  useSyncExternalStore(p.playback.subscribe, () => p.playback.state.rev);
  const geom = useRef({ scale: 1, ox: 0, oy: 0, span: 1 });
  const screen = useRef(new Map<number, { x: number; y: number }>());

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || p.outline.length === 0) return;
    const style = getComputedStyle(document.documentElement);
    const ink = style.getPropertyValue("--ink").trim() || "#E8EDF3";
    const line = style.getPropertyValue("--line").trim() || "#2A3342";
    const amber = style.getPropertyValue("--amber").trim() || "#FFB224";
    const isDay = document.documentElement.dataset.theme === "day";

    const dpr = window.devicePixelRatio || 1;
    const rect = wrap.getBoundingClientRect();
    const w = Math.max(240, rect.width);
    const h = Math.max(320, Math.min(620, w * 0.6));
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const xs = p.outline.map((pt) => pt[0]);
    const ys = p.outline.map((pt) => pt[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const pad = 34;
    const scale = Math.min((w - pad * 2) / Math.max(1, maxX - minX), (h - pad * 2) / Math.max(1, maxY - minY));
    const ox = pad + (w - pad * 2 - (maxX - minX) * scale) / 2 - minX * scale;
    // World y grows up, canvas y grows down: negate so the map is not mirrored.
    const oy = pad + (h - pad * 2 - (maxY - minY) * scale) / 2 + maxY * scale;
    const span = Math.max(1, maxX - minX, maxY - minY);
    geom.current = { scale, ox, oy, span };
    const maxStep = span * 0.05; // ~5% of the circuit per sample is impossible
    const X = (x: number) => ox + x * scale;
    const Y = (y: number) => oy - y * scale;

    const t = p.playback.state.t;

    ctx.lineJoin = "round";
    ctx.strokeStyle = line;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    p.outline.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
    ctx.closePath();
    ctx.stroke();

    ctx.strokeStyle = amber;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 5;
    for (const z of p.zones) {
      ctx.beginPath();
      ctx.moveTo(X(z.x0), Y(z.y0));
      ctx.lineTo(X(z.x1), Y(z.y1));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.font = "600 10px 'Barlow Condensed', system-ui, sans-serif";
    for (const c of p.corners) {
      const cx = X(c.x);
      const cy = Y(c.y);
      const on = p.selectedCorner === c.label;
      ctx.fillStyle = on ? amber : ink;
      ctx.globalAlpha = on ? 1 : 0.75;
      ctx.beginPath();
      ctx.arc(cx, cy, on ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = on ? 1 : 0.65;
      ctx.fillStyle = on ? amber : ink;
      ctx.fillText(c.label, cx + 8, cy - 6);
      ctx.globalAlpha = 1;
    }

    screen.current.clear();
    for (const dot of p.dots) {
      const d = p.replay.get(dot.driver);
      if (!d) continue;
      const pos = posAt(d, t, maxStep);
      if (!pos) continue;
      const rp = rotate(pos.x, pos.y, -p.angle);
      const sx = X(rp.x);
      const sy = Y(rp.y);
      screen.current.set(dot.driver, { x: sx, y: sy });
      const dim = p.highlight.length > 0 && !p.highlight.includes(dot.driver);
      // Trails only for the drivers you follow: 22 at once reads as stray lines
      // rather than motion. maxStep stops a trail at telemetry gaps.
      const followed = p.highlight.includes(dot.driver) || p.selectedDriver === dot.driver;
      const trail = followed
        ? trailAt(d, t, TRAIL_S, maxStep).map((v) => rotate(v.x, v.y, -p.angle))
        : [];
      if (trail.length > 1) {
        ctx.strokeStyle = dot.color;
        ctx.globalAlpha = dim ? 0.06 : 0.28;
        ctx.lineWidth = 3;
        ctx.beginPath();
        trail.forEach((pt, i) => (i ? ctx.lineTo(X(pt.x), Y(pt.y)) : ctx.moveTo(X(pt.x), Y(pt.y))));
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.globalAlpha = dim ? 0.35 : 1;
      ctx.fillStyle = dot.color;
      ctx.beginPath();
      ctx.arc(sx, sy, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = p.selectedDriver === dot.driver ? amber : isDay ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.9)";
      ctx.lineWidth = p.selectedDriver === dot.driver ? 2.5 : 1.5;
      ctx.stroke();
      ctx.font = "600 8px 'Barlow Condensed', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = isDay ? "rgba(255,255,255,0.65)" : "rgba(0,0,0,0.65)";
      ctx.strokeText(dot.code, sx, sy);
      ctx.fillStyle = isDay ? "#0E1420" : "#FFFFFF";
      ctx.fillText(dot.code, sx, sy);
      ctx.globalAlpha = 1;
    }
  });

  const toLocal = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const nearestDot = (mx: number, my: number) => {
    let best: { driver: number; d: number } | null = null;
    screen.current.forEach((pt, driver) => {
      const d = Math.hypot(pt.x - mx, pt.y - my);
      if (d < 14 && (!best || d < best.d)) best = { driver, d };
    });
    return best as { driver: number; d: number } | null;
  };

  const onClick = (e: React.MouseEvent) => {
    const { x, y } = toLocal(e);
    const hit = nearestDot(x, y);
    if (hit) {
      p.onDriver(hit.driver);
      return;
    }
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const { scale, ox, oy, span } = geom.current;
    const wx = (e.clientX - rect.left - ox) / scale;
    const wy = (e.clientY - rect.top - oy) / scale;
    let best: Corner | null = null;
    let bestD = span * 0.035;
    for (const c of p.corners) {
      const d = Math.hypot(c.x - wx, c.y - wy);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (best) p.onCorner(best.label);
    void canvas;
  };

  const onMove = (e: React.MouseEvent) => {
    const { x, y } = toLocal(e);
    const hit = nearestDot(x, y);
    if (!hit) {
      setHover(null);
      if (canvasRef.current) canvasRef.current.style.cursor = "default";
      return;
    }
    setHover({ x: x + 14, y: y + 14, driver: hit.driver });
    if (canvasRef.current) canvasRef.current.style.cursor = "pointer";
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", lineHeight: 0 }}>
      <canvas ref={canvasRef} onClick={onClick} onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      {hover && <HoverCard hover={hover} dots={p.dots} info={p.hoverInfo(hover.driver)} />}
    </div>
  );
}
