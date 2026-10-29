import { useEffect, useRef, useSyncExternalStore } from "react";
import { formatClock, gapAt, type GapTable } from "../session";
import type { Playback } from "../playbackStore";

interface Props {
  playback: Playback;
  table: GapTable;
  drivers: number[];
  labels: Map<number, string>;
  colors: Map<number, string>;
  source: "intervals" | "lap_times" | "none";
}

/** Gap to leader over the whole session for the chosen drivers. */
export default function GapChart(p: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  useSyncExternalStore(p.playback.subscribe, () => p.playback.state.rev);

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

    const padL = 40;
    const padB = 18;
    const padT = 8;
    const dur = Math.max(1, p.playback.state.dur);

    const series = p.drivers
      .map((d) => ({ d, entry: p.table.get(d) }))
      .filter((s): s is { d: number; entry: { t: number[]; gap: number[] } } => !!s.entry?.t.length);
    const maxGap = Math.max(1, ...series.flatMap((s) => s.entry.gap.filter((_, i) => i % 5 === 0)));

    const X = (t: number) => padL + (t / dur) * (w - padL - 6);
    const Y = (g: number) => padT + (Math.min(g, maxGap) / maxGap) * (h - padT - padB);

    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, h - padB);
    ctx.lineTo(w - 6, h - padB);
    ctx.stroke();

    ctx.fillStyle = dim;
    ctx.font = "10px 'Barlow', system-ui, sans-serif";
    ctx.fillText(`+${maxGap.toFixed(0)}s`, 4, padT + 6);
    ctx.fillText("0", 4, h - padB);

    const dashes = [[], [6, 4], [2, 3], [10, 3, 2, 3]];
    let idx = 0;
    for (const s of series) {
      ctx.strokeStyle = p.colors.get(s.d) ?? dim;
      ctx.lineWidth = 1.6;
      ctx.setLineDash(dashes[idx % dashes.length]);
      idx += 1;
      ctx.beginPath();
      s.entry.t.forEach((t, i) => (i ? ctx.lineTo(X(t), Y(s.entry.gap[i])) : ctx.moveTo(X(t), Y(s.entry.gap[i]))));
      ctx.stroke();
      ctx.setLineDash([]);
      const lastT = s.entry.t[s.entry.t.length - 1];
      const lastG = s.entry.gap[s.entry.gap.length - 1];
      ctx.fillStyle = p.colors.get(s.d) ?? dim;
      ctx.fillText(p.labels.get(s.d) ?? `#${s.d}`, X(lastT) + 4, Y(lastG) + 3);
    }

    const px = X(p.playback.state.t);
    ctx.strokeStyle = amber;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(px, padT);
    ctx.lineTo(px, h - padB);
    ctx.stroke();

    ctx.fillStyle = dim;
    ctx.fillText(formatClock(dur), w - 46, h - 3);
    if (p.source === "lap_times") {
      ctx.fillText("from lap times", padL + 4, padT + 8);
    }
  });

  const now = p.playback.state.t;
  return (
    <div ref={wrapRef}>
      <canvas ref={canvasRef} />
      <div className="legend">
        {p.drivers.map((d) => (
          <span key={d}>
            <i style={{ background: p.colors.get(d) }} />
            {p.labels.get(d) ?? `#${d}`}{" "}
            <em className="dim">
              {(() => {
                const g = gapAt(p.table, d, now);
                return g == null ? "—" : `+${g.toFixed(3)}`;
              })()}
            </em>
          </span>
        ))}
      </div>
    </div>
  );
}
