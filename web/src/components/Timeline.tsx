import { useEffect, useRef, useSyncExternalStore } from "react";
import { lapAt, type LapMarker } from "../session";
import type { Playback } from "../playbackStore";

interface Props {
  playback: Playback;
  markers: LapMarker[];
  onSeek: (t: number) => void;
}

const H = 44;

/** Session timeline: lap ticks, played span, playhead. Click or drag to seek. */
export default function Timeline(p: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  useSyncExternalStore(p.playback.subscribe, () => p.playback.state.rev);

  const seekFromEvent = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    p.onSeek(f * p.playback.state.dur);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const style = getComputedStyle(document.documentElement);
    const line = style.getPropertyValue("--line").trim() || "#2A3342";
    const amber = style.getPropertyValue("--amber").trim() || "#FFB224";
    const dim = style.getPropertyValue("--dim").trim() || "#8A94A6";
    const dpr = window.devicePixelRatio || 1;
    const rect = wrap.getBoundingClientRect();
    const w = Math.max(240, rect.width);
    canvas.width = w * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, H);

    const dur = Math.max(1, p.playback.state.dur);
    const X = (t: number) => (t / dur) * w;
    const baseY = 26;

    ctx.strokeStyle = line;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    ctx.lineTo(w, baseY);
    ctx.stroke();

    ctx.strokeStyle = amber;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    ctx.lineTo(X(p.playback.state.t), baseY);
    ctx.stroke();

    // Lap ticks: every lap, labelled every 10.
    ctx.font = "10px 'Barlow', system-ui, sans-serif";
    for (const m of p.markers) {
      const x = X(m.t);
      const major = m.index % 10 === 0 || m.index === 1;
      ctx.strokeStyle = major ? dim : line;
      ctx.globalAlpha = major ? 0.9 : 0.5;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, baseY - 7);
      ctx.lineTo(x, baseY + (major ? 7 : 4));
      ctx.stroke();
      if (major) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = dim;
        ctx.fillText(String(m.index), x + 2, baseY + 18);
      }
    }
    ctx.globalAlpha = 1;

    const px = X(p.playback.state.t);
    ctx.strokeStyle = amber;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, 4);
    ctx.lineTo(px, baseY + 6);
    ctx.stroke();
    ctx.fillStyle = amber;
    ctx.beginPath();
    ctx.arc(px, baseY, 4.5, 0, Math.PI * 2);
    ctx.fill();

    const { lap, total } = lapAt(p.markers, p.playback.state.t);
    if (total) {
      const label = `LAP ${Math.max(1, lap)}/${total}`;
      ctx.textAlign = "right";
      ctx.fillStyle = dim;
      ctx.fillText(label, w, 12);
      ctx.textAlign = "left";
    }
  });

  return (
    <div ref={wrapRef}>
      <canvas
        ref={canvasRef}
        style={{ cursor: "pointer", touchAction: "none" }}
        aria-label="Session timeline"
        onPointerDown={(e) => {
          dragging.current = true;
          seekFromEvent(e.clientX);
        }}
        onPointerMove={(e) => {
          if (dragging.current) seekFromEvent(e.clientX);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        onPointerLeave={() => {
          dragging.current = false;
        }}
      />
    </div>
  );
}
