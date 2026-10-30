import { useEffect, useState, useSyncExternalStore } from "react";
import { beginDraw, themeColors, useCanvasSize } from "../chart";
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

const H = 210;

/** Gap to leader over the whole session for the chosen drivers. */
export default function GapChart(p: Props) {
  const { canvasRef, wrapRef, width, dpr } = useCanvasSize(H);
  const [hoverT, setHoverT] = useState<number | null>(null);
  useSyncExternalStore(p.playback.subscribe, () => p.playback.state.rev);

  const dur = Math.max(1, p.playback.state.dur);
  const padL = 40;
  const padB = 18;
  const padT = 10;

  const series = p.drivers
    .map((d) => ({ d, entry: p.table.get(d) }))
    .filter((s): s is { d: number; entry: { t: number[]; gap: number[] } } => !!s.entry?.t.length);
  const maxGap = Math.max(1, ...series.flatMap((s) => s.entry.gap));

  const X = (t: number, w: number) => padL + (t / dur) * (w - padL - 8);
  const Y = (g: number, h: number) => padT + (Math.min(g, maxGap) / maxGap) * (h - padT - padB);
  const tOf = (px: number, w: number) => ((px - padL) / Math.max(1, w - padL - 8)) * dur;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !width) return;
    const draw = beginDraw(canvas, width, H, dpr);
    if (!draw) return;
    const { ctx, w, h } = draw;
    const c = themeColors();

    ctx.strokeStyle = c.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, h - padB);
    ctx.lineTo(w - 8, h - padB);
    ctx.stroke();

    ctx.fillStyle = c.dim;
    ctx.font = "10px 'Barlow', system-ui, sans-serif";
    ctx.fillText(`+${maxGap.toFixed(0)}s`, 4, padT + 6);
    ctx.fillText("0", 4, h - padB);
    ctx.fillText(formatClock(dur), w - 46, h - 3);
    if (p.source === "lap_times") ctx.fillText("from lap times", padL + 4, padT + 8);
    if (p.source === "none") {
      ctx.fillText("No gap data for this session.", padL + 8, 40);
      return;
    }

    const dashes = [[], [6, 4], [2, 3], [10, 3, 2, 3]];
    series.forEach((s, idx) => {
      ctx.strokeStyle = p.colors.get(s.d) ?? c.dim;
      ctx.lineWidth = 1.6;
      ctx.setLineDash(dashes[idx % dashes.length]);
      ctx.beginPath();
      s.entry.t.forEach((t, i) =>
        i ? ctx.lineTo(X(t, w), Y(s.entry.gap[i], h)) : ctx.moveTo(X(t, w), Y(s.entry.gap[i], h)),
      );
      ctx.stroke();
      ctx.setLineDash([]);
      const lastT = s.entry.t[s.entry.t.length - 1];
      ctx.fillStyle = p.colors.get(s.d) ?? c.dim;
      ctx.fillText(p.labels.get(s.d) ?? `#${s.d}`, X(lastT, w) + 4, Y(s.entry.gap[s.entry.gap.length - 1], h) + 3);
    });

    if (hoverT != null) {
      ctx.strokeStyle = c.ink;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X(hoverT, w), padT);
      ctx.lineTo(X(hoverT, w), h - padB);
      ctx.stroke();
      ctx.globalAlpha = 1;
      for (const s of series) {
        const g = gapAt(p.table, s.d, hoverT);
        if (g == null) continue;
        ctx.fillStyle = p.colors.get(s.d) ?? c.dim;
        ctx.beginPath();
        ctx.arc(X(hoverT, w), Y(g, h), 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const px = X(p.playback.state.t, w);
    ctx.strokeStyle = c.amber;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(px, padT);
    ctx.lineTo(px, h - padB);
    ctx.stroke();
  }, [canvasRef, width, dpr, p.table, p.drivers, p.labels, p.colors, p.source, p.playback, hoverT, dur, maxGap, series]);

  const rows = hoverT == null
    ? []
    : p.drivers.map((d) => ({ d, gap: gapAt(p.table, d, hoverT) })).filter((r) => r.gap != null);

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
      {hoverT != null && rows.length > 0 && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(X(hoverT, width) + 10, 8), Math.max(8, width - 150)) }}>
          <strong>{formatClock(hoverT)}</strong>
          {rows.map((r) => (
            <div key={r.d}>
              <i style={{ background: p.colors.get(r.d) }} />
              {p.labels.get(r.d) ?? `#${r.d}`} · +{r.gap!.toFixed(3)}s
            </div>
          ))}
        </div>
      )}
      <div className="legend">
        {p.drivers.map((d) => {
          const g = gapAt(p.table, d, p.playback.state.t);
          return (
            <span key={d}>
              <i style={{ background: p.colors.get(d) }} />
              {p.labels.get(d) ?? `#${d}`}{" "}
              <em className="dim">{g == null ? "—" : `+${g.toFixed(3)}`}</em>
            </span>
          );
        })}
      </div>
    </div>
  );
}
