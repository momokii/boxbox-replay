import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { beginDraw, themeColors, useCanvasSize } from "../chart";
import { formatLapTime } from "../format";
import type { Playback } from "../playbackStore";
import type { Lap } from "../types";

interface Props {
  playback: Playback;
  laps: Lap[];
  drivers: number[];
  codes: Map<number, string>;
  colors: Map<number, string>;
  totalLaps: number;
}

const H = 200;

/** Lap-time evolution for the chosen drivers: every timed lap, in order. */
export default function LapChart(p: Props) {
  const { canvasRef, wrapRef, width, dpr } = useCanvasSize(H);
  const [hover, setHover] = useState<{ lap: number; x: number } | null>(null);
  useSyncExternalStore(p.playback.subscribe, () => p.playback.state.rev);

  const series = useMemo(
    () =>
      p.drivers
        .map((d) => ({
          driver: d,
          points: p.laps
            .filter((l) => l.driver_number === d && l.lap_duration != null)
            .sort((a, b) => a.lap_number - b.lap_number)
            .map((l) => ({ lap: l.lap_number, t: l.lap_duration as number })),
        }))
        .filter((s) => s.points.length > 1),
    [p.laps, p.drivers],
  );

  const all = series.flatMap((s) => s.points.map((q) => q.t)).sort((a, b) => a - b);
  const lo = all.length ? all[Math.floor(all.length * 0.02)] : 0;
  const hi = all.length ? all[Math.floor(all.length * 0.98)] : 1;
  const padL = 44;
  const padB = 18;
  const padT = 10;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !width) return;
    const draw = beginDraw(canvas, width, H, dpr);
    if (!draw) return;
    const { ctx, w, h } = draw;
    const c = themeColors();
    const maxLap = Math.max(1, p.totalLaps);
    const X = (lap: number) => padL + (lap / maxLap) * (w - padL - 8);
    const Y = (t: number) => padT + (1 - (t - lo) / Math.max(0.1, hi - lo)) * (h - padT - padB);

    ctx.strokeStyle = c.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, h - padB);
    ctx.lineTo(w - 8, h - padB);
    ctx.stroke();

    ctx.fillStyle = c.dim;
    ctx.font = "10px 'Barlow', system-ui, sans-serif";
    ctx.fillText(formatLapTime(hi), 2, padT + 6);
    ctx.fillText(formatLapTime(lo), 2, h - padB);
    ctx.fillText("lap", w - 20, h - 4);

    const dashes = [[], [5, 3], [2, 3], [9, 3, 2, 3]];
    series.forEach((s, idx) => {
      ctx.strokeStyle = p.colors.get(s.driver) ?? c.ink;
      ctx.lineWidth = 1.5;
      ctx.setLineDash(dashes[idx % dashes.length]);
      ctx.beginPath();
      s.points.forEach((q, i) =>
        i ? ctx.lineTo(X(q.lap), Y(q.t)) : ctx.moveTo(X(q.lap), Y(q.t)),
      );
      ctx.stroke();
      ctx.setLineDash([]);
    });

    if (hover) {
      ctx.strokeStyle = c.ink;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(X(hover.lap), padT);
      ctx.lineTo(X(hover.lap), h - padB);
      ctx.stroke();
      ctx.globalAlpha = 1;
      for (const s of series) {
        const q = s.points.find((pt) => pt.lap === hover.lap);
        if (!q) continue;
        ctx.fillStyle = p.colors.get(s.driver) ?? c.ink;
        ctx.beginPath();
        ctx.arc(X(q.lap), Y(q.t), 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [canvasRef, width, dpr, series, hover, lo, hi, p.totalLaps, p.colors]);

  const rows = hover
    ? series.flatMap((s) => {
        const q = s.points.find((pt) => pt.lap === hover.lap);
        return q ? [{ driver: s.driver, code: p.codes.get(s.driver) ?? `#${s.driver}`, t: q.t }] : [];
      })
    : [];

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <canvas
        ref={canvasRef}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const lap = Math.round(((e.clientX - rect.left - padL) / Math.max(1, rect.width - padL - 8)) * Math.max(1, p.totalLaps));
          setHover({ lap, x: e.clientX - rect.left });
        }}
        onMouseLeave={() => setHover(null)}
      />
      {hover && rows.length > 0 && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(hover.x + 10, 8), Math.max(8, width - 150)) }}>
          <strong>Lap {hover.lap}</strong>
          {rows.map((r) => (
            <div key={r.driver}>
              <i style={{ background: p.colors.get(r.driver) }} />
              {r.code} · {formatLapTime(r.t)}
            </div>
          ))}
        </div>
      )}
      {!series.length && <p className="dim small">No timed laps for these drivers.</p>}
    </div>
  );
}
