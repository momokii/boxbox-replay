import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { api } from "../api";
import { beginDraw, themeColors, useCanvasSize } from "../chart";
import { drsState, sampleIndex } from "../inputs";
import type { Playback } from "../playbackStore";
import type { InputsPayload } from "../types";

interface Props {
  sessionKey: number;
  driver: number;
  lap: number;
  code: string;
  color: string;
  playback: Playback;
  /** Session seconds at the lap start; inputs are relative to it. */
  windowStart: number;
  lapDuration: number;
}

const H = 112;
// Lap windows are small parquet reads, but scrubbing re-requests the same lap;
// a short cache keeps the strip instant without unbounded growth.
const cache = new Map<string, Promise<InputsPayload>>();
const CACHE_MAX = 24;

function loadInputs(sessionKey: number, driver: number, lap: number): Promise<InputsPayload> {
  const key = `${sessionKey}:${driver}:${lap}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const request = api.inputs(sessionKey, driver, lap).catch((err) => {
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

/** Throttle, brake, gear and DRS for one lap, with the replay playhead. */
export default function InputsStrip(p: Props) {
  const { canvasRef, wrapRef, width, dpr } = useCanvasSize(H);
  const [payload, setPayload] = useState<InputsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  useSyncExternalStore(p.playback.subscribe, () => p.playback.state.rev);
  const key = `${p.sessionKey}:${p.driver}:${p.lap}`;
  const lastKey = useRef("");

  useEffect(() => {
    lastKey.current = key;
    setError(null);
    loadInputs(p.sessionKey, p.driver, p.lap)
      .then((data) => {
        if (lastKey.current === key) setPayload(data);
      })
      .catch((err: unknown) => {
        if (lastKey.current !== key) return;
        setPayload(null);
        setError(err instanceof Error && err.message.includes("404") ? "no inputs for this lap" : "inputs unavailable");
      });
  }, [key, p.sessionKey, p.driver, p.lap]);

  const duration = payload?.lap_duration ?? p.lapDuration;
  const localT = p.playback.state.t - p.windowStart;
  const index = useMemo(
    () => (payload ? sampleIndex(payload.t, Math.max(0, Math.min(localT, duration))) : -1),
    [payload, localT, duration],
  );

  const throttle = index >= 0 ? payload?.throttle[index] ?? null : null;
  const braking = index >= 0 ? payload?.brake[index] ?? null : null;
  const gear = index >= 0 ? payload?.gear[index] ?? null : null;
  const drs = index >= 0 ? payload?.drs[index] ?? null : null;
  const drsLabel = drsState(drs);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !width || !payload) return;
    const draw = beginDraw(canvas, width, H, dpr);
    if (!draw) return;
    const { ctx, w, h } = draw;
    const tokens = themeColors();
    const padL = 34;
    const padR = 8;
    const padT = 12;
    const padB = 26;
    const plotW = Math.max(1, w - padL - padR);
    const plotH = Math.max(1, h - padT - padB);
    const span = Math.max(1, duration);
    const X = (t: number) => padL + (t / span) * plotW;
    const Y = (value: number) => padT + (1 - value / 100) * plotH;

    // Throttle: filled area, the dominant trace.
    ctx.beginPath();
    ctx.moveTo(X(0), Y(0));
    payload.t.forEach((t, i) => {
      const v = payload.throttle[i];
      if (v == null) return;
      ctx.lineTo(X(t), Y(v));
    });
    ctx.lineTo(X(Math.min(duration, payload.t[payload.t.length - 1] ?? 0)), Y(0));
    ctx.closePath();
    ctx.fillStyle = p.color;
    ctx.globalAlpha = 0.18;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.beginPath();
    payload.t.forEach((t, i) => {
      const v = payload.throttle[i];
      if (v == null) return;
      if (i === 0) ctx.moveTo(X(t), Y(v));
      else ctx.lineTo(X(t), Y(v));
    });
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Brake: thick red bars wherever the pedal is down.
    ctx.strokeStyle = "#ff5a52";
    ctx.lineWidth = 3;
    ctx.beginPath();
    payload.t.forEach((t, i) => {
      const v = payload.brake[i];
      if (v == null || v < 50) return;
      ctx.moveTo(X(t), padT + plotH + 8);
      ctx.lineTo(X(t), padT + plotH + 13);
    });
    ctx.stroke();

    // Gear numbers along the top, one per change, spaced so they stay legible.
    ctx.font = "600 10px 'Barlow Condensed', system-ui, sans-serif";
    ctx.fillStyle = tokens.dim;
    let lastGear: number | null = null;
    let lastLabelX = -Infinity;
    payload.t.forEach((t, i) => {
      const g = payload.gear[i];
      if (g == null || g === lastGear) return;
      lastGear = g;
      const x = X(t);
      if (x < padL + 8 || x > w - padR - 6 || x - lastLabelX < 20) return;
      lastLabelX = x;
      ctx.fillText(String(Math.round(g)), x - 2, padT - 2);
    });

    // Playhead.
    const playT = Math.max(0, Math.min(localT, duration));
    if (localT >= 0 && localT <= duration) {
      ctx.strokeStyle = tokens.amber;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X(playT), 0);
      ctx.lineTo(X(playT), h);
      ctx.stroke();
    }

    ctx.fillStyle = tokens.dim;
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillText("100", 2, padT + 4);
    ctx.fillText("0", 2, padT + plotH + 4);
  }, [payload, width, dpr, p.color, duration, localT, canvasRef]);

  return (
    <div className="inputs" ref={wrapRef}>
      <div className="inputs-head">
        <span className="inputs-title">Inputs · {p.code} L{p.lap}</span>
        <span className="inputs-values">
          <span title="Throttle">thr {throttle == null ? "—" : `${Math.round(throttle)}%`}</span>
          <span title="Brake">brk {braking == null ? "—" : braking >= 50 ? "on" : "off"}</span>
          <span title="Gear">g{gear == null ? "—" : Math.round(gear)}</span>
          <span
            className={drsLabel === "open" ? "inputs-drs on" : "inputs-drs"}
            title={drsLabel === "unknown" ? "This feed does not carry DRS state" : "DRS"}
          >
            DRS {drsLabel === "unknown" ? "—" : drsLabel === "open" ? "open" : "shut"}
          </span>
        </span>
      </div>
      {error ? (
        <p className="dim small inputs-note">{error}</p>
      ) : (
        <canvas ref={canvasRef} className="inputs-canvas" />
      )}
    </div>
  );
}
