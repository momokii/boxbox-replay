import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { api } from "../api";
import { beginDraw, themeColors, useCanvasSize } from "../chart";
import { drsState, sampleIndex } from "../inputs";
import type { Playback } from "../playbackStore";
import type { InputsPayload } from "../types";

export interface InputEntry {
  driver: number;
  code: string;
  color: string;
}

interface Props {
  sessionKey: number;
  entries: InputEntry[];
  playback: Playback;
  /** Session seconds of the shared window (the followed driver's lap). */
  windowStart: number;
  windowEnd: number;
  lapLabel: string;
}

const H = 148;
// The same window is requested again while scrubbing; keep the last few pairs.
const cache = new Map<string, Promise<InputsPayload>>();
const CACHE_MAX = 32;

function loadWindow(
  sessionKey: number,
  driver: number,
  t0: number,
  t1: number,
): Promise<InputsPayload> {
  const key = `${sessionKey}:${driver}:${t0.toFixed(1)}:${t1.toFixed(1)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const request = api.inputsWindow(sessionKey, driver, t0, t1).catch((err) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, request);
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  return request;
}

function valueAt(payload: InputsPayload | undefined, t: number, channel: "throttle" | "brake" | "gear" | "drs") {
  if (!payload) return null;
  const index = sampleIndex(payload.t, t);
  if (index < 0) return null;
  return payload[channel][index] ?? null;
}

/** One shared axis for every followed driver's inputs, with a hover readout. */
export default function InputsStrip(p: Props) {
  const { canvasRef, wrapRef, width, dpr } = useCanvasSize(H);
  const [payloads, setPayloads] = useState<Record<number, InputsPayload>>({});
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<{ t: number; x: number } | null>(null);
  useSyncExternalStore(p.playback.subscribe, () => p.playback.state.rev);

  const driversKey = p.entries.map((e) => e.driver).join(",");
  const windowKey = `${p.windowStart.toFixed(1)}:${p.windowEnd.toFixed(1)}`;
  const duration = Math.max(0.001, p.windowEnd - p.windowStart);
  const localT = p.playback.state.t - p.windowStart;

  useEffect(() => {
    if (!p.sessionKey || !p.entries.length || duration <= 0) return;
    let live = true;
    setError(null);
    Promise.all(
      p.entries.map((entry) =>
        loadWindow(p.sessionKey, entry.driver, p.windowStart, p.windowEnd)
          .then((payload) => [entry.driver, payload] as const)
          .catch(() => [entry.driver, null] as const),
      ),
    ).then((rows) => {
      if (!live) return;
      const next: Record<number, InputsPayload> = {};
      let any = false;
      for (const [driver, payload] of rows) {
        if (payload) {
          next[driver] = payload;
          any = true;
        }
      }
      setPayloads(next);
      if (!any) setError("no inputs for this window");
    });
    return () => {
      live = false;
    };
  }, [p.sessionKey, driversKey, windowKey, duration, p.entries, p.windowStart, p.windowEnd]);

  const readoutT = hover ? Math.max(0, Math.min(hover.t, duration)) : Math.max(0, Math.min(localT, duration));

  const readout = useMemo(
    () =>
      p.entries.map((entry) => ({
        ...entry,
        throttle: valueAt(payloads[entry.driver], readoutT, "throttle"),
        brake: valueAt(payloads[entry.driver], readoutT, "brake"),
        gear: valueAt(payloads[entry.driver], readoutT, "gear"),
        drs: valueAt(payloads[entry.driver], readoutT, "drs"),
      })),
    [p.entries, payloads, readoutT],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !width) return;
    const draw = beginDraw(canvas, width, H, dpr);
    if (!draw) return;
    const { ctx, w, h } = draw;
    const tokens = themeColors();
    const panel = getComputedStyle(document.documentElement).getPropertyValue("--panel-2").trim();
    const padL = 34;
    const padR = 8;
    const padT = 12;
    const padB = 26 + Math.max(0, p.entries.length - 1) * 5;
    const plotW = Math.max(1, w - padL - padR);
    const plotH = Math.max(1, h - padT - padB);
    const X = (t: number) => padL + (Math.max(0, Math.min(t, duration)) / duration) * plotW;
    const Y = (value: number) => padT + (1 - value / 100) * plotH;

    // Throttle: one line per driver, in their team colour.
    for (const entry of p.entries) {
      const payload = payloads[entry.driver];
      if (!payload) continue;
      ctx.beginPath();
      let started = false;
      payload.t.forEach((t, i) => {
        const v = payload.throttle[i];
        if (v == null) return;
        if (!started) {
          ctx.moveTo(X(t), Y(v));
          started = true;
        } else {
          ctx.lineTo(X(t), Y(v));
        }
      });
      ctx.strokeStyle = entry.color;
      ctx.lineWidth = p.entries.length > 1 ? 1.4 : 1.8;
      ctx.globalAlpha = 0.95;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Brake: a tick row per driver under the plot.
    p.entries.forEach((entry, row) => {
      const payload = payloads[entry.driver];
      if (!payload) return;
      const y = h - 8 - row * 5;
      // A colour chip ties each brake row to its throttle line.
      ctx.fillStyle = entry.color;
      ctx.fillRect(4, y - 3, 4, 5);
      ctx.strokeStyle = "#ff5a52";
      ctx.lineWidth = 3;
      ctx.beginPath();
      payload.t.forEach((t, i) => {
        const v = payload.brake[i];
        if (v == null || v < 50) return;
        ctx.moveTo(X(t), y - 2);
        ctx.lineTo(X(t), y + 1);
      });
      ctx.stroke();
    });

    // Gear numbers: reference driver only, spaced to stay legible.
    const primary = payloads[p.entries[0]?.driver];
    if (primary) {
      ctx.font = "600 10px 'Barlow Condensed', system-ui, sans-serif";
      ctx.fillStyle = tokens.dim;
      let lastGear: number | null = null;
      let lastLabelX = -Infinity;
      primary.t.forEach((t, i) => {
        const g = primary.gear[i];
        if (g == null || g === lastGear) return;
        lastGear = g;
        const x = X(t);
        if (x < padL + 8 || x > w - padR - 6 || x - lastLabelX < 20) return;
        lastLabelX = x;
        ctx.fillText(String(Math.round(g)), x - 2, padT - 2);
      });
    }

    // Playhead.
    if (localT >= 0 && localT <= duration) {
      ctx.strokeStyle = tokens.amber;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X(localT), 0);
      ctx.lineTo(X(localT), h);
      ctx.stroke();
    }

    // Hover crosshair and per-driver tooltip.
    if (hover) {
      const hx = X(hover.t);
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = tokens.dim;
      ctx.beginPath();
      ctx.moveTo(hx, 0);
      ctx.lineTo(hx, h);
      ctx.stroke();
      ctx.setLineDash([]);

      const rows = p.entries.map((entry) => {
        const payload = payloads[entry.driver];
        const t = Math.max(0, Math.min(hover.t, duration));
        const thr = valueAt(payload, t, "throttle");
        const brk = valueAt(payload, t, "brake");
        const gear = valueAt(payload, t, "gear");
        const drs = valueAt(payload, t, "drs");
        const drsLabel =
          drsState(drs) === "unknown" ? "—" : drsState(drs) === "open" ? "open" : "shut";
        return {
          code: entry.code,
          text:
            `thr ${thr == null ? "—" : `${Math.round(thr)}%`}` +
            ` · brk ${brk == null ? "—" : brk >= 50 ? "on" : "off"}` +
            ` · g${gear == null ? "—" : Math.round(gear)} · DRS ${drsLabel}`,
          color: entry.color,
        };
      });
      const boxW = 196;
      const boxH = 15 + rows.length * 14 + 6;
      const bx = hx + boxW + 12 > w ? Math.max(4, hx - boxW - 12) : hx + 12;
      const by = 6;
      ctx.fillStyle = panel || "#1b2029";
      ctx.strokeStyle = tokens.line;
      ctx.lineWidth = 1;
      ctx.fillRect(bx, by, boxW, boxH);
      ctx.strokeRect(bx, by, boxW, boxH);
      ctx.fillStyle = tokens.dim;
      ctx.font = "10px system-ui, sans-serif";
      ctx.fillText(`t + ${hover.t.toFixed(1)}s`, bx + 8, by + 13);
      rows.forEach((row, i) => {
        const y = by + 27 + i * 14;
        ctx.fillStyle = row.color;
        ctx.fillRect(bx + 8, y - 7, 3, 9);
        ctx.fillStyle = tokens.ink;
        ctx.font = "600 10px 'Barlow Condensed', system-ui, sans-serif";
        ctx.fillText(row.code, bx + 15, y);
        ctx.font = "10px system-ui, sans-serif";
        ctx.fillStyle = tokens.dim;
        ctx.fillText(row.text, bx + 48, y);
      });
    }

    ctx.fillStyle = tokens.dim;
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillText("100", 2, padT + 4);
    ctx.fillText("0", 2, padT + plotH + 4);
  }, [payloads, width, dpr, p.entries, duration, localT, hover, canvasRef]);

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const padL = 34;
    const padR = 8;
    const plotW = Math.max(1, rect.width - padL - padR);
    const t = ((e.clientX - rect.left - padL) / plotW) * duration;
    setHover(t >= 0 && t <= duration ? { t, x: e.clientX - rect.left } : null);
  };

  return (
    <div className="inputs" ref={wrapRef}>
      <div className="inputs-head">
        <span className="inputs-title">
          Inputs · {p.lapLabel} · {p.entries.length > 1 ? `${p.entries.length} drivers` : p.entries[0]?.code}
          {hover && <span className="inputs-hover-time"> · hovering {hover.t.toFixed(1)}s</span>}
        </span>
        <span className="inputs-values">
          {readout.map((row) => (
            <span key={row.driver} className="inputs-chip">
              <i style={{ background: row.color }} aria-hidden="true" />
              <b>{row.code}</b> thr {row.throttle == null ? "—" : `${Math.round(row.throttle)}%`} · brk{" "}
              {row.brake == null ? "—" : row.brake >= 50 ? "on" : "off"} · g
              {row.gear == null ? "—" : Math.round(row.gear)} · DRS{" "}
              {drsState(row.drs) === "unknown" ? "—" : drsState(row.drs) === "open" ? "open" : "shut"}
            </span>
          ))}
        </span>
      </div>
      {error ? (
        <p className="dim small inputs-note">{error}</p>
      ) : (
        <canvas
          ref={canvasRef}
          className="inputs-canvas"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        />
      )}
    </div>
  );
}
