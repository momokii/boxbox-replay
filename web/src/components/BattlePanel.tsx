import { useEffect, useMemo, useState } from "react";
import { beginDraw, themeColors, useCanvasSize } from "../chart";
import { formatLapTime } from "../format";
import { formatClock, gapAt, type GapTable } from "../session";
import Info from "./Info";
import Modal from "./Modal";
import BattleFullView from "./BattleFullView";
import type { Driver, Lap } from "../types";
import type { OvertakeRow } from "../api";

interface Props {
  playback: { state: { t: number; dur: number; rev: number } };
  sessionKey: number;
  table: GapTable;
  drivers: Driver[];
  laps: Lap[];
  onSeek: (t: number) => void;
  overtakes: OvertakeRow[];
  codes: Map<number, string>;
  labels: Map<number, string>;
  colors: Map<number, string>;
}

const H = 190;
const MAX = 3;

/**
 * Battle view. One driver is the anchor; up to two challengers are compared
 * against it, so every chart keeps a single, readable reference.
 */
export default function BattlePanel(p: Props) {
  const [picked, setPicked] = useState<(number | null)[]>([null, null, null]);
  const [paceModal, setPaceModal] = useState(false);
  const now = p.playback.state.t;

  const ordered = [...p.drivers].sort(
    (x, y) => (gapAt(p.table, x.driver_number, now) ?? 1e9) - (gapAt(p.table, y.driver_number, now) ?? 1e9),
  );
  const anchor = picked[0] ?? ordered[0]?.driver_number ?? 0;
  // The first challenger defaults to the next car on track; the select must show
  // that default instead of an empty "—" while the charts use it.
  const defaultB = ordered.find((d) => d.driver_number !== anchor)?.driver_number ?? null;
  const slotB = picked[1] ?? defaultB;
  const slotC = picked[2] ?? null;
  const challengers = [slotB, slotC].filter(
    (d): d is number => d != null && d !== anchor,
  );

  const gapOf = (d: number) => gapAt(p.table, d, now);
  const gapAnchor = gapOf(anchor);

  const lapsOf = (d: number) =>
    p.laps.filter((l) => l.driver_number === d && l.lap_duration != null).sort((x, y) => x.lap_number - y.lap_number);
  const lapsAnchor = lapsOf(anchor);
  const bestOf = (d: number) => {
    const ls = lapsOf(d);
    return ls.length ? Math.min(...ls.map((l) => l.lap_duration as number)) : null;
  };

  const setSlot = (i: number, value: number | null) =>
    setPicked((prev) => prev.map((v, idx) => (idx === i ? value : v)));

  const pairRows = useMemo(() => {
    const all = [anchor, ...challengers];
    const rows: { a: number; b: number; between: number | null }[] = [];
    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        const ga = gapOf(all[i]);
        const gb = gapOf(all[j]);
        rows.push({ a: all[i], b: all[j], between: ga != null && gb != null ? Math.abs(ga - gb) : null });
      }
    }
    return rows;
  }, [anchor, challengers, p.table, now]);

  return (
    <div>
      <div className="row" style={{ marginBottom: 8, gap: 12 }}>
        <label className="dim small">
          Anchor{" "}
          <select value={anchor} onChange={(e) => setSlot(0, Number(e.target.value))}>
            {p.drivers.map((d) => (
              <option key={d.driver_number} value={d.driver_number}>
                #{d.driver_number} {d.name_acronym}
              </option>
            ))}
          </select>
        </label>
        {[1, 2].map((slot) => {
          const value = slot === 1 ? (slotB ?? "") : (slotC ?? "");
          const other = slot === 1 ? slotC : slotB;
          return (
            <label key={slot} className="dim small">
              {slot === 1 ? "Compare" : "Compare (optional)"}{" "}
              <select
                value={value}
                onChange={(e) => setSlot(slot, e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">—</option>
                {p.drivers
                  .filter((d) => d.driver_number !== anchor && d.driver_number !== other)
                  .map((d) => (
                    <option key={d.driver_number} value={d.driver_number}>
                      #{d.driver_number} {d.name_acronym}
                    </option>
                  ))}
              </select>
            </label>
          );
        })}
        <span className="dim small">Up to {MAX} drivers — all comparisons are against the anchor.</span>
      </div>

      <p className="small">
        <strong>{p.labels.get(anchor) ?? `#${anchor}`}</strong>
        {challengers.length === 0 && " — pick at least one driver to compare."}
        {challengers.map((d) => {
          const g = gapOf(d);
          const diff = g != null && gapAnchor != null ? g - gapAnchor : null;
          return (
            <span key={d}>
              {" · "}
              <strong>{p.labels.get(d) ?? `#${d}`}</strong>{" "}
              {diff == null ? "(gap unavailable)" : diff <= 0 ? `${Math.abs(diff).toFixed(3)}s ahead` : `${diff.toFixed(3)}s behind`}
            </span>
          );
        })}
      </p>

      <div className="panel">
        <h3>
          <Info
            label="Relative gap over the session"
            tip="Each line is a challenger's gap to the leader minus the anchor's. Above the line means that driver is behind the anchor; below means ahead. Hover for values."
          />
        </h3>
        <RelativeGap playback={p.playback} table={p.table} anchor={anchor} challengers={challengers} colors={p.colors} labels={p.labels} />
        <p className="dim small">
          Dashed line is zero — the moment they are side by side. One line per challenger, measured against the
          anchor.
        </p>
      </div>

      <div className="panel">
        <h3>
          <Info
            label="Lap pace vs anchor"
            tip="Each row is a lap the anchor completed. Bars show how much slower each challenger was on the same lap (right = slower, left = faster). Click a row to jump the replay there."
          />
        </h3>
        <div className="row" style={{ justifyContent: "flex-end", marginBottom: 6 }}>
          <button className="disclosure" onClick={() => setPaceModal(true)} disabled={!challengers.length}>
            Full view
          </button>
        </div>
        {challengers.length ? (
          <div className="delta-bars">
            {lapsAnchor.map((la) => {
              const deltas = challengers.map((d) => {
                const lb = lapsOf(d).find((l) => l.lap_number === la.lap_number);
                return lb ? (lb.lap_duration as number) - (la.lap_duration as number) : null;
              });
              const visible = deltas.filter((v): v is number => v != null);
              if (!visible.length) return null;
              const worst = Math.max(...visible.map(Math.abs));
              return (
                <button
                  key={la.lap_number}
                  className="delta-row"
                  title={challengers
                    .map((d, i) =>
                      deltas[i] == null
                        ? `${p.codes.get(d)}: no lap`
                        : `${p.codes.get(d)} ${deltas[i]! >= 0 ? "+" : "−"}${Math.abs(deltas[i]!).toFixed(3)}s`,
                    )
                    .join(" · ")}
                  onClick={() => p.onSeek((la.lap_number / Math.max(1, lapsAnchor.length)) * p.playback.state.dur)}
                >
                  <span className="dim">L{la.lap_number}</span>
                  <span className="delta-track">
                    {challengers.map((d, i) => {
                      const v = deltas[i];
                      if (v == null) return null;
                      return (
                        <span
                          key={d}
                          className={v >= 0 ? "delta-b b-slower" : "delta-b b-faster"}
                          style={{
                            width: `${(Math.abs(v) / Math.max(0.3, worst)) * 50}%`,
                            background: p.colors.get(d),
                            opacity: 0.85,
                          }}
                        />
                      );
                    })}
                  </span>
                  <span className="mono small">
                    {deltas[0] == null ? "—" : `${deltas[0] >= 0 ? "+" : "−"}${Math.abs(deltas[0]).toFixed(3)}`}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="dim small">Pick a challenger to compare lap pace.</p>
        )}
      </div>

      <div className="panel">
        <h3>
          <Info
            label="Overtakes involving these drivers"
            tip="Passes recorded by the timing feed where one of the selected drivers was the passer or the passed. Click a row to jump the replay there."
          />
        </h3>
        {(() => {
          const all = [anchor, ...challengers];
          const rel = p.overtakes
            .filter((o) => all.includes(o.overtaking_driver_number) || all.includes(o.overtaken_driver_number))
            .sort((x, y) => x.t - y.t)
            .slice(0, 8);
          if (!rel.length) return <p className="dim small">None recorded involving these drivers.</p>;
          return (
            <div className="event-list">
              {rel.map((o, i) => (
                <button key={i} className="event-row rc" onClick={() => p.onSeek(o.t)}>
                  <span className="mono dim">{formatClock(o.t)}</span>
                  <span className="small">
                    {p.codes.get(o.overtaking_driver_number) ?? `#${o.overtaking_driver_number}`} passed{" "}
                    {p.codes.get(o.overtaken_driver_number) ?? `#${o.overtaken_driver_number}`}
                    {o.position != null ? ` for P${o.position}` : ""}
                  </span>
                </button>
              ))}
            </div>
          );
        })()}
      </div>

      <Modal
        open={paceModal}
        onClose={() => setPaceModal(false)}
        title={`Lap pace — ${p.labels.get(anchor) ?? `#${anchor}`} as anchor`}
        subtitle="Every lap the anchor completed, with the difference for each challenger."
        size="wide"
      >
        <BattleFullView
          laps={p.laps}
          anchor={anchor}
          challengers={challengers}
          labels={p.labels}
          colors={p.colors}
        />
      </Modal>

      <div className="panel">
        <h3>Head to head</h3>
        <table className="laps mono" style={{ fontSize: "0.82rem" }}>
          <thead>
            <tr>
              <th>Pair</th>
              <th>
                <Info label="Between them" tip="Distance between the two drivers at the replay clock." />
              </th>
              <th>
                <Info label="Best laps" tip="Each driver's fastest lap of the session." />
              </th>
            </tr>
          </thead>
          <tbody>
            {pairRows.map((r) => {
              const ba = bestOf(r.a);
              const bb = bestOf(r.b);
              return (
                <tr key={`${r.a}-${r.b}`}>
                  <td>
                    {p.labels.get(r.a) ?? `#${r.a}`} vs {p.labels.get(r.b) ?? `#${r.b}`}
                  </td>
                  <td>{r.between == null ? "—" : `${r.between.toFixed(3)}s`}</td>
                  <td>
                    {ba ? formatLapTime(ba) : "—"} / {bb ? formatLapTime(bb) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RelativeGap(p: {
  playback: { state: { t: number; dur: number; rev: number } };
  table: GapTable;
  anchor: number;
  challengers: number[];
  colors: Map<number, string>;
  labels: Map<number, string>;
}) {
  const { canvasRef, wrapRef, width, dpr } = useCanvasSize(H);
  const [hoverT, setHoverT] = useState<number | null>(null);
  const dur = Math.max(1, p.playback.state.dur);

  const series = useMemo(() => {
    const step = Math.max(1, dur / 700);
    return p.challengers.map((d) => {
      const pts: { t: number; d: number; ga: number; gb: number }[] = [];
      for (let t = 0; t <= dur; t += step) {
        const ga = gapAt(p.table, p.anchor, t);
        const gb = gapAt(p.table, d, t);
        if (ga == null || gb == null) continue;
        pts.push({ t, d: gb - ga, ga, gb });
      }
      return { driver: d, pts };
    });
  }, [p.table, p.anchor, p.challengers, dur]);

  const maxAbs = Math.max(1, ...series.flatMap((s) => s.pts.map((q) => Math.abs(q.d))));
  const padL = 44;
  const padB = 18;
  const padT = 12;
  const mid = (H - padB + padT) / 2;
  const amp = (H - padB - padT) / 2 - 6;
  const X = (t: number, w: number) => padL + (t / dur) * (w - padL - 8);
  const Y = (v: number) => mid - (v / maxAbs) * amp;

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

    ctx.strokeStyle = c.dim;
    ctx.globalAlpha = 0.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padL, mid);
    ctx.lineTo(w - 8, mid);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    ctx.fillStyle = c.dim;
    ctx.font = "10px 'Barlow', system-ui, sans-serif";
    ctx.fillText(`+${maxAbs.toFixed(1)}s`, 2, padT + 6);
    ctx.fillText("0", 2, mid + 3);
    ctx.fillText(`−${maxAbs.toFixed(1)}s`, 2, h - padB);
    ctx.fillText("behind anchor", padL + 4, padT + 10);
    ctx.fillText("ahead of anchor", padL + 4, h - padB - 4);
    ctx.fillText(formatClock(dur), w - 46, h - 3);

    if (!series.length || series.every((s) => !s.pts.length)) {
      ctx.fillText("Gap data unavailable for these drivers.", padL + 8, mid - 10);
      return;
    }

    const dashes = [[], [5, 3], [2, 3]];
    series.forEach((s, idx) => {
      if (s.pts.length < 2) return;
      ctx.strokeStyle = p.colors.get(s.driver) ?? c.amber;
      ctx.lineWidth = 1.8;
      ctx.setLineDash(dashes[idx % dashes.length]);
      ctx.beginPath();
      s.pts.forEach((q, i) => (i ? ctx.lineTo(X(q.t, w), Y(q.d)) : ctx.moveTo(X(q.t, w), Y(q.d))));
      ctx.stroke();
      ctx.setLineDash([]);
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
        const near = s.pts.reduce(
          (best, q) => (Math.abs(q.t - hoverT) < Math.abs(best.t - hoverT) ? q : best),
          s.pts[0] ?? null,
        );
        if (!near) continue;
        ctx.fillStyle = p.colors.get(s.driver) ?? c.amber;
        ctx.beginPath();
        ctx.arc(X(near.t, w), Y(near.d), 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const px = X(Math.min(dur, p.playback.state.t), w);
    ctx.strokeStyle = c.amber;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(px, padT);
    ctx.lineTo(px, h - padB);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }, [canvasRef, width, dpr, series, hoverT, dur, maxAbs, padB, padT, mid, amp, p.anchor, p.challengers, p.colors, p.playback.state.t]);

  const hoverRows =
    hoverT == null
      ? []
      : series.flatMap((s) => {
          const near = s.pts.reduce(
            (best, q) => (Math.abs(q.t - hoverT) < Math.abs(best.t - hoverT) ? q : best),
            s.pts[0] ?? null,
          );
          return near ? [{ driver: s.driver, d: near.d, at: near.t }] : [];
        });

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <canvas
        ref={canvasRef}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setHoverT(((e.clientX - rect.left - padL) / Math.max(1, rect.width - padL - 8)) * dur);
        }}
        onMouseLeave={() => setHoverT(null)}
      />
      {hoverT != null && hoverRows.length > 0 && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(X(hoverT, width) + 10, 8), Math.max(8, width - 170)) }}>
          <strong>{formatClock(hoverT)}</strong>
          {hoverRows.map((r) => (
            <div key={r.driver}>
              <i style={{ background: p.colors.get(r.driver) }} />
              {p.labels.get(r.driver) ?? `#${r.driver}`} ·{" "}
              {r.d <= 0 ? `${Math.abs(r.d).toFixed(3)}s ahead` : `${r.d.toFixed(3)}s behind`}
            </div>
          ))}
        </div>
      )}
      <div className="legend">
        {series.map((s) => (
          <span key={s.driver}>
            <i style={{ background: p.colors.get(s.driver) }} />
            {p.labels.get(s.driver) ?? `#${s.driver}`}
          </span>
        ))}
      </div>
    </div>
  );
}
