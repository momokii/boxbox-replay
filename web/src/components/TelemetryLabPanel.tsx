import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { beginDraw, themeColors, useCanvasSize } from "../chart";
import { formatClock } from "../session";
import { sortedLaps, telemetryWindow } from "../windows";
import type { Driver, TelemetryResult } from "../types";

interface Props {
  sessionKey: number;
  drivers: Driver[];
  codes: Map<number, string>;
  colors: Map<number, string>;
  windowStart: number;
  windowEnd: number;
  lapMarkers: { lap_number: number; t: number }[];
  duration: number;
  currentLap: number;
  preferred: number[];
}

const H = 260;
const MAX_DRIVERS = 3;

/** Multi-driver inputs over the same session-time window. */
export default function TelemetryLabPanel(p: Props) {
  const initial = (p.preferred.length ? p.preferred : p.drivers.map((d) => d.driver_number)).slice(
    0,
    2,
  );
  const [selected, setSelected] = useState<number[]>(initial);
  const [scope, setScope] = useState<"replay" | "lap" | "session">("replay");
  const [fixedLap, setFixedLap] = useState<number | null>(null);
  const [data, setData] = useState<TelemetryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<{ t: number; x: number } | null>(null);
  const [explain, setExplain] = useState<string | null>(null);
  const [explainBusy, setExplainBusy] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const { canvasRef, wrapRef, width, dpr } = useCanvasSize(H);
  const lastWindow = useRef("");

  useEffect(() => {
    setSelected(
      (p.preferred.length ? p.preferred : p.drivers.map((d) => d.driver_number)).slice(0, 2),
    );
  }, [p.sessionKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const lapOptions = sortedLaps(p.lapMarkers);
  const fixedMarker = lapOptions.find((m) => m.lap_number === fixedLap) ?? lapOptions[0];
  const { start, end } = telemetryWindow(
    scope,
    p.windowStart,
    p.windowEnd,
    lapOptions,
    fixedLap,
    p.duration,
  );
  const windowKey = `${start.toFixed(1)}:${end.toFixed(1)}`;
  const scopeLabel =
    scope === "session"
      ? `Full session · ${Math.round(start)}–${Math.round(end)}s`
      : scope === "lap"
        ? `Lap ${fixedMarker?.lap_number ?? "—"} · ${Math.round(start)}–${Math.round(end)}s`
        : `Replay lap ${p.currentLap} · ${Math.round(start)}–${Math.round(end)}s`;

  useEffect(() => {
    if (scope !== "lap" || fixedLap != null) return;
    setFixedLap(p.currentLap || lapOptions[0]?.lap_number || null);
  }, [scope, fixedLap, p.currentLap, lapOptions]);

  useEffect(() => {
    if (!p.sessionKey || selected.length === 0) {
      setData(null);
      return;
    }
    let live = true;
    setError(null);
    setData(null);
    api
      .telemetry({
        session_key: p.sessionKey,
        drivers: selected,
        t0: start,
        t1: end,
        points: scope === "session" ? 1200 : 600,
      })
      .then((result) => {
        if (!live) return;
        setData(result);
        lastWindow.current = windowKey;
      })
      .catch((err: unknown) => {
        if (!live) return;
        setData(null);
        const message = err instanceof Error ? err.message : "";
        setError(
          message.includes("404")
            ? "No telemetry for these drivers in this window."
            : "The lab could not load this window.",
        );
      });
    return () => {
      live = false;
    };
  }, [p.sessionKey, selected, start, end, windowKey]);

  const toggle = (driver: number) => {
    setSelected((current) => {
      if (current.includes(driver)) {
        return current.length > 1 ? current.filter((d) => d !== driver) : current;
      }
      return current.length >= MAX_DRIVERS ? [...current.slice(1), driver] : [...current, driver];
    });
  };

  const span = Math.max(1, end - start);

  useEffect(() => {
    setExplain(null);
    setExplainError(null);
  }, [selected, p.windowStart, p.windowEnd]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !width || !data) return;
    const draw = beginDraw(canvas, width, H, dpr);
    if (!draw) return;
    const { ctx, w, h } = draw;
    const tokens = themeColors();
    const padL = 38;
    const padR = 10;
    const padT = 12;
    const padB = 24;
    const plotW = Math.max(1, w - padL - padR);
    const plotH = Math.max(1, h - padT - padB);
    const maxSpeed = Math.max(
      200,
      ...data.series.flatMap((s) => s.speed.filter((v): v is number => v != null)),
    );
    const X = (t: number) => padL + (t / span) * plotW;
    const Y = (v: number) => padT + (1 - v / (maxSpeed * 1.1)) * plotH;

    ctx.strokeStyle = tokens.line;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i += 1) {
      const y = padT + (i / 4) * plotH;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.globalAlpha = 0.35;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = tokens.dim;
      ctx.font = "10px system-ui, sans-serif";
      ctx.fillText(String(Math.round(maxSpeed * (1 - i / 4))), 4, y + 3);
    }

    for (const series of data.series) {
      const color = p.colors.get(series.driver_number) ?? tokens.ink;
      ctx.beginPath();
      let started = false;
      series.speed.forEach((value, index) => {
        if (value == null) return;
        const x = X(data.t[index]);
        const y = Y(value);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    if (hover) {
      const x = X(hover.t);
      ctx.strokeStyle = tokens.amber;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, h - padB);
      ctx.stroke();
    }

    ctx.fillStyle = tokens.dim;
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillText("0s", padL, h - 8);
    ctx.fillText(`${Math.round(span)}s`, w - padR - 28, h - 8);
  }, [data, width, dpr, p.colors, hover, span, canvasRef]);

  const indexAt = (t: number) => {
    if (!data) return -1;
    let lo = 0;
    let hi = data.t.length - 1;
    if (t <= data.t[0]) return 0;
    if (t >= data.t[hi]) return hi;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (data.t[mid] <= t) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  const hoverIndex = hover ? indexAt(hover.t) : -1;

  return (
    <section className="lab" aria-label="Telemetry lab">
      <header className="lab-head">
        <div>
          <h2>Telemetry lab</h2>
          <p className="dim small">
            Several drivers on the same clock. Distance-aligned lap comparison lives in Lap
            duel; this view is about the same moment.
          </p>
        </div>
        <div className="lab-scope">
          <label>
            Window
            <select
              value={scope}
              onChange={(e) => {
                const next = e.target.value as typeof scope;
                setScope(next);
                if (next === "lap" && fixedLap == null) {
                  setFixedLap(p.currentLap || lapOptions[0]?.lap_number || null);
                }
              }}
            >
              <option value="replay">Replay lap</option>
              <option value="lap" disabled={!lapOptions.length}>Fixed lap</option>
              <option value="session">Full session</option>
            </select>
          </label>
          {scope === "lap" && (
            <label>
              Lap
              <select
                value={fixedLap ?? ""}
                onChange={(e) => setFixedLap(Number(e.target.value))}
              >
                {lapOptions.map((m) => (
                  <option key={m.lap_number} value={m.lap_number}>
                    L{m.lap_number}
                  </option>
                ))}
              </select>
            </label>
          )}
          <span className="lab-window">{scopeLabel}</span>
        </div>
      </header>
      {scope === "lap" && (
        <p className="dim small">
          Lap windows come from the replay's lap markers; another driver's exact
          lap boundary can differ slightly.
        </p>
      )}

      <div className="lab-drivers">
        {p.drivers.map((driver) => {
          const on = selected.includes(driver.driver_number);
          return (
            <button
              key={driver.driver_number}
              type="button"
              className={on ? "lab-chip on" : "lab-chip"}
              onClick={() => toggle(driver.driver_number)}
              style={on ? { borderColor: p.colors.get(driver.driver_number) } : undefined}
            >
              <i style={{ background: p.colors.get(driver.driver_number) ?? "var(--ink)" }} />
              {driver.name_acronym}
            </button>
          );
        })}
        <span className="dim small">up to {MAX_DRIVERS} drivers</span>
      </div>

      {error && <p className="duel-note duel-error">{error}</p>}

      <div className="lab-stage" ref={wrapRef} aria-busy={!data}>
        <canvas
          ref={canvasRef}
          className="lab-canvas"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const padL = 38;
            const padR = 10;
            const plotW = Math.max(1, rect.width - padL - padR);
            const t = ((e.clientX - rect.left - padL) / plotW) * span;
            setHover(t >= 0 && t <= span ? { t, x: e.clientX - rect.left } : null);
          }}
          onMouseLeave={() => setHover(null)}
        />
        {!data && !error && <div className="lab-loading">Loading traces…</div>}
        {hover && data && (
          <div className="chart-tip lab-tip" style={{ left: Math.min(Math.max(hover.x + 12, 8), 260) }}>
            <strong>{formatClock(start + hover.t)}</strong>
            {data.series.map((series) => {
              const i = hoverIndex;
              const v = (arr: (number | null)[]) => (i >= 0 ? arr[i] : null);
              return (
                <div key={series.driver_number}>
                  <i style={{ background: p.colors.get(series.driver_number) ?? "var(--ink)" }} />
                  {p.codes.get(series.driver_number) ?? `#${series.driver_number}`}{" "}
                  {v(series.speed) == null ? "—" : `${Math.round(v(series.speed)!)} km/h`} · thr{" "}
                  {v(series.throttle) == null ? "—" : `${Math.round(v(series.throttle)!)}%`} · brk{" "}
                  {v(series.brake) == null ? "—" : v(series.brake)! >= 50 ? "on" : "off"}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {data && (
        <>

          <div className="strategy-explain">
            <button
              type="button"
              className="pit-explain-btn"
              disabled={explainBusy}
              onClick={async () => {
                setExplainBusy(true);
                setExplainError(null);
                try {
                  const reply = await api.aiExplain({
                    session_key: p.sessionKey,
                    kind: "compare",
                    subject: {
                      drivers: selected,
                      t0: start,
                      t1: end,
                    },
                  });
                  setExplain(reply.answer);
                } catch (err: unknown) {
                  const message = err instanceof Error ? err.message : "";
                  setExplainError(
                    message.includes("429")
                      ? "The engineer has reached its usage limit. Try again after it resets."
                      : message.includes("503")
                        ? "The AI is not configured on this deployment."
                        : "The engineer did not answer. The traces are unaffected.",
                  );
                } finally {
                  setExplainBusy(false);
                }
              }}
            >
              {explainBusy ? "Asking the engineer…" : "Explain this comparison"}
            </button>
            {explainError && <p className="small warn">{explainError}</p>}
            {explain && (
              <div className="pit-explain-note">
                <p>{explain}</p>
                <footer className="dim small">
                  AI explanation · the traces above are the source of truth
                </footer>
              </div>
            )}
          </div>

          <div className="lab-readout">
            {data.series.map((series) => {
              const i = hoverIndex;
              const value = (arr: (number | null)[]) => (i >= 0 ? arr[i] : null);
              const speed = value(series.speed);
              const throttle = value(series.throttle);
              const brake = value(series.brake);
              const gear = value(series.gear);
              const drs = value(series.drs);
              return (
                <span key={series.driver_number} className="lab-value">
                  <i style={{ background: p.colors.get(series.driver_number) ?? "var(--ink)" }} />
                  <b>{p.codes.get(series.driver_number) ?? `#${series.driver_number}`}</b>{" "}
                  {speed == null ? "—" : `${Math.round(speed)} km/h`} · thr{" "}
                  {throttle == null ? "—" : `${Math.round(throttle)}%`} · brk{" "}
                  {brake == null ? "—" : brake >= 50 ? "on" : "off"} · g
                  {gear == null ? "—" : Math.round(gear)} · DRS{" "}
                  {drs == null ? "—" : drs >= 8 ? "open" : "shut"}
                </span>
              );
            })}
            {!hover && <span className="dim small">Hover the chart to read every driver.</span>}
          </div>
        </>
      )}
    </section>
  );
}
