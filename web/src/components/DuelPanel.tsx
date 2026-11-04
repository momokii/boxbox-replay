import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { themeColors } from "../chart";
import {
  defaultPair,
  fastestLap,
  frameAt,
  pointAt,
  rotatePoint,
  type DuelPayload,
} from "../duel";
import { formatLapTime, teamColor } from "../format";
import type { Driver, Geometry, Lap } from "../types";
import Info from "./Info";

interface Props {
  sessionKey: number;
  drivers: Driver[];
  laps: Lap[];
  colors: Map<number, string>;
  geometry: Geometry | null;
  /** Session the laps prop belongs to; null while a switch is loading. */
  lapsSession: number | null;
  theme: "night" | "day";
  /** Drivers to open with: highlighted or selected in the replay. */
  preferred: number[];
}

/** Progress of a driver at the duel clock, in seconds. */
function clockFor(payload: DuelPayload | null): number {
  if (!payload) return 0;
  return Math.max(payload.a.lap_duration ?? 0, payload.b.lap_duration ?? 0);
}

export default function DuelPanel({
  sessionKey,
  drivers,
  laps,
  colors,
  geometry,
  lapsSession,
  theme,
  preferred,
}: Props) {
  const pair = useMemo(
    () =>
      defaultPair(
        drivers.map((d) => d.driver_number),
        laps,
        preferred,
      ),
    [drivers, laps, preferred],
  );

  const [aDriver, setADriver] = useState(pair[0]);
  const [bDriver, setBDriver] = useState(pair[1]);
  const [aLap, setALap] = useState<number | null>(null);
  const [bLap, setBLap] = useState<number | null>(null);
  const [payload, setPayload] = useState<DuelPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);

  const tRef = useRef(0);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  // A new session (or a pair that only becomes known once its laps load) must
  // not inherit lap numbers from the previous circuit.
  useEffect(() => {
    setADriver(pair[0]);
    setBDriver(pair[1]);
    setALap(null);
    setBLap(null);
    setPayload(null);
    setT(0);
    setPlaying(false);
  }, [sessionKey, pair[0], pair[1]]);

  const lapOptions = (driver: number) =>
    laps
      .filter((l) => l.driver_number === driver && l.lap_duration != null)
      .sort((a, b) => a.lap_number - b.lap_number);

  const aLapEff = aLap ?? fastestLap(laps, aDriver)?.lap_number ?? null;
  const bLapEff = bLap ?? fastestLap(laps, bDriver)?.lap_number ?? null;

  useEffect(() => {
    // Never align a lap against a session it does not belong to: on a session
    // switch the previous laps are still in state for one render.
    if (!sessionKey || lapsSession !== sessionKey || aDriver === bDriver) return;
    if (aLapEff == null || bLapEff == null) {
      // A driver escaped the timing feed: drop the old pair rather than
      // leaving a stale duel on screen.
      setPayload(null);
      setError(null);
      return;
    }
    let live = true;
    setLoading(true);
    setError(null);
    api
      .duel(sessionKey, aDriver, aLapEff, bDriver, bLapEff)
      .then((data) => {
        if (!live) return;
        setPayload(data);
        setT(0);
        setPlaying(false);
      })
      .catch((err: unknown) => {
        if (!live) return;
        setPayload(null);
        setError(err instanceof Error ? err.message : "Could not load this pair.");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [sessionKey, lapsSession, aDriver, aLapEff, bDriver, bLapEff]);

  const duration = clockFor(payload);

  useEffect(() => {
    if (!playing || !payload) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      const next = tRef.current + dt;
      if (next >= duration) {
        tRef.current = duration;
        setT(duration);
        setPlaying(false);
        return;
      }
      tRef.current = next;
      setT(next);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, payload, duration]);

  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvas.current;
    const el = wrap.current;
    if (!cv || !el || !geometry || !payload) return;
    const outline = geometry.outline;
    if (!outline.length) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = el.getBoundingClientRect();
    const w = Math.max(280, rect.width);
    const h = Math.max(260, Math.min(520, w * 0.58));
    cv.width = w * dpr;
    cv.height = h * dpr;
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const tokens = themeColors();
    const xs = outline.map((p) => p[0]);
    const ys = outline.map((p) => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const pad = 34;
    const scale = Math.min(
      (w - pad * 2) / Math.max(1, maxX - minX),
      (h - pad * 2) / Math.max(1, maxY - minY),
    );
    const ox = pad + (w - pad * 2 - (maxX - minX) * scale) / 2 - minX * scale;
    // World y grows up, canvas y grows down.
    const oy = pad + (h - pad * 2 - (maxY - minY) * scale) / 2 + maxY * scale;
    const X = (x: number) => ox + x * scale;
    const Y = (y: number) => oy - y * scale;

    ctx.lineJoin = "round";
    ctx.strokeStyle = tokens.line;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    outline.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
    ctx.closePath();
    ctx.stroke();

    ctx.font = "600 10px 'Barlow Condensed', system-ui, sans-serif";
    ctx.fillStyle = tokens.dim;
    for (const corner of geometry.corners) {
      ctx.beginPath();
      ctx.arc(X(corner.x), Y(corner.y), 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(corner.label, X(corner.x) + 6, Y(corner.y) - 5);
    }

    const frame = frameAt(payload, t);
    const sides: Array<{ key: "a" | "b"; driver: number; f: number; code: string }> = [
      { key: "a", driver: payload.a.driver_number, f: frame.fa, code: driverCode(payload.a.driver_number) },
      { key: "b", driver: payload.b.driver_number, f: frame.fb, code: driverCode(payload.b.driver_number) },
    ];

    for (const side of sides) {
      const [rawX, rawY] = pointAt(payload.traces[side.key], side.f);
      // The session outline is served rotated to square up the start straight;
      // the duel traces are raw, so apply the same rotation before drawing.
      const [x, y] = rotatePoint(rawX, rawY, -(geometry.angle ?? 0));
      const cx = X(x);
      const cy = Y(y);
      const raw = drivers.find((d) => d.driver_number === side.driver)?.team_colour;
      const colour = colors.get(side.driver) ?? teamColor(raw ?? null);
      const leads = frame.leader === side.key;

      if (leads) {
        ctx.beginPath();
        ctx.arc(cx, cy, 13, 0, Math.PI * 2);
        ctx.strokeStyle = tokens.amber;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.fillStyle = colour;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = tokens.ink;
      ctx.stroke();

      ctx.font = "700 12px 'Barlow Condensed', system-ui, sans-serif";
      ctx.fillStyle = tokens.ink;
      // Stagger labels so the two cars stay readable when they overlap.
      ctx.fillText(side.code, cx + 12, side.key === "a" ? cy - 14 : cy + 22);
    }
  }, [payload, t, geometry, colors, theme]);

  function driverCode(n: number): string {
    return drivers.find((d) => d.driver_number === n)?.name_acronym ?? `#${n}`;
  }

  const frame = payload ? frameAt(payload, t) : null;
  const leaderCode = frame && frame.leader !== "tie" ? driverCode(
    frame.leader === "a" ? payload!.a.driver_number : payload!.b.driver_number,
  ) : null;

  const picker = (
    side: "a" | "b",
    driver: number,
    setDriver: (n: number) => void,
    lapNumber: number | null,
    setLap: (n: number | null) => void,
  ) => (
    <div className={`duel-pick duel-pick-${side}`}>
      <span className="duel-pick-label">
        <b>{side.toUpperCase()}</b> · {side === "a" ? "reference lap" : "comparison lap"}
      </span>
      <div className="duel-select-row">
        <select
          className="duel-select duel-select-driver"
          value={driver}
          aria-label={`Driver ${side.toUpperCase()}`}
          title="Pick a driver"
          onChange={(e) => {
            setDriver(Number(e.target.value));
            setLap(null);
          }}
        >
          {drivers.map((d) => (
            <option key={d.driver_number} value={d.driver_number}>
              {d.name_acronym}
            </option>
          ))}
        </select>
        <select
          className="duel-select duel-select-lap"
          value={lapNumber ?? ""}
          aria-label={`Lap for ${driverCode(driver)}`}
          title="Pick a lap: the fastest is selected by default"
          onChange={(e) => setLap(e.target.value ? Number(e.target.value) : null)}
        >
          {lapOptions(driver).length === 0 && <option value="">no timed laps</option>}
          {lapOptions(driver).map((l) => (
            <option key={l.lap_number} value={l.lap_number}>
              L{l.lap_number} · {formatLapTime(l.lap_duration)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  const lapRow = (driver: number, lapNumber: number | null) =>
    lapNumber == null
      ? undefined
      : laps.find((l) => l.driver_number === driver && l.lap_number === lapNumber);

  const sectors = (() => {
    if (!payload) return [];
    const a = lapRow(payload.a.driver_number, payload.a.lap);
    const b = lapRow(payload.b.driver_number, payload.b.lap);
    if (!a || !b) return [];
    const rows = [];
    for (const [label, key] of [
      ["S1", "duration_sector_1"],
      ["S2", "duration_sector_2"],
      ["S3", "duration_sector_3"],
    ] as const) {
      const ta = a[key];
      const tb = b[key];
      if (ta == null || tb == null) continue;
      rows.push({ label, a: ta, b: tb, delta: tb - ta });
    }
    return rows;
  })();

  // Lead changes along the sampled delta curve.
  const leadChanges = (() => {
    if (!payload || !payload.delta.length) return 0;
    // Ignore flips inside the sampling noise: a change only counts once the
    // other car is genuinely ahead by more than 50 ms.
    let changes = 0;
    let last = 0;
    for (const [, dt] of payload.delta) {
      if (Math.abs(dt) < 0.05) continue;
      const sign = dt > 0 ? 1 : -1;
      if (last !== 0 && sign !== last) changes += 1;
      last = sign;
    }
    return changes;
  })();

  return (
    <section className="duel" aria-label="Lap duel">
      <header className="duel-head">
        <h2>
          Lap duel{" "}
          <Info
            label="what is aligned"
            tip="Two laps race the same circuit. Both cars are placed by distance around the lap, so the delta shows where time is actually gained or lost. It starts at 0.000 and closes on the official lap-time difference at the line."
          />
        </h2>
        <button
          type="button"
          className="chip"
          onClick={() => {
            setADriver(bDriver);
            setBDriver(aDriver);
            setALap(bLapEff);
            setBLap(aLapEff);
          }}
          title="Swap A and B"
        >
          Swap
        </button>
      </header>

      <div className="duel-controls">
        {picker("a", aDriver, setADriver, aLapEff, setALap)}
        {picker("b", bDriver, setBDriver, bLapEff, setBLap)}
      </div>
      <p className="duel-note dim">
        Pick a driver, then a lap on each side — the fastest lap is selected for you. Swap
        flips A and B.
      </p>

      {aDriver === bDriver && (
        <p className="duel-note">Pick two different drivers to compare their laps.</p>
      )}
      {aDriver !== bDriver && (aLapEff == null || bLapEff == null) && (
        <p className="duel-note">
          One of these drivers has no timed laps in this session, so there is nothing to
          align.
        </p>
      )}
      {error && <p className="duel-note duel-error">{error}</p>}
      {loading && <p className="duel-note dim">Aligning both laps…</p>}

      {payload && !error && (
        <>
          <div className="duel-stage" ref={wrap}>
            <canvas ref={canvas} className="duel-canvas" />
          </div>

          <div className="duel-verdict" aria-live="polite">
            {frame?.leader === "tie" ? (
              <span className="dim">Dead level</span>
            ) : (
              <>
                <b>{leaderCode}</b> leads by <b>{frame?.gap.toFixed(3)}s</b>
              </>
            )}
          </div>

          <div className="duel-bar" aria-hidden="true">
            <span className="duel-bar-side">A</span>
            <div className="duel-bar-track">
              <i className="duel-bar-mid" />
              <i
                className="duel-bar-dot"
                style={{
                  left: `${50 - Math.max(-1, Math.min(1, (frame?.signed ?? 0) / 2)) * 50}%`,
                }}
              />
            </div>
            <span className="duel-bar-side">B</span>
          </div>

          <div className="duel-clock">
            <button
              type="button"
              className="duel-play"
              onClick={() => {
                if (!playing && t >= duration) setT(0);
                setPlaying((p) => !p);
              }}
              aria-pressed={playing}
            >
              {playing ? "Pause" : "Play"}
            </button>
            <input
              className="duel-range"
              type="range"
              min={0}
              max={duration || 1}
              step={0.05}
              value={t}
              aria-label="Duel position"
              onChange={(e) => {
                setPlaying(false);
                setT(Number(e.target.value));
              }}
            />
            <span className="duel-time">{t.toFixed(2)}s</span>
          </div>

          <div className="duel-laps">
            <span>
              <b>{driverCode(payload.a.driver_number)}</b> L{payload.a.lap}{" "}
              <span className="dim">{formatLapTime(payload.a.lap_duration)}</span>
            </span>
            <span>
              <b>{driverCode(payload.b.driver_number)}</b> L{payload.b.lap}{" "}
              <span className="dim">{formatLapTime(payload.b.lap_duration)}</span>
            </span>
            <span className="dim">
              official difference{" "}
              {formatLapTime(
                Math.abs((payload.b.lap_duration ?? 0) - (payload.a.lap_duration ?? 0)),
              )}
            </span>
            {leadChanges > 0 && (
              <span className="dim">
                lead changed {leadChanges} time{leadChanges === 1 ? "" : "s"}
              </span>
            )}
          </div>

          {sectors.length > 0 && (
            <table className="duel-sectors">
              <caption>
                Sector split
                <span className="dim"> · negative is B faster</span>
              </caption>
              <thead>
                <tr>
                  <th scope="col">Sector</th>
                  <th scope="col">{driverCode(payload.a.driver_number)}</th>
                  <th scope="col">{driverCode(payload.b.driver_number)}</th>
                  <th scope="col">Δ B−A</th>
                </tr>
              </thead>
              <tbody>
                {sectors.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    <td>{row.a.toFixed(3)}</td>
                    <td>{row.b.toFixed(3)}</td>
                    <td className={row.delta < 0 ? "duel-fast" : row.delta > 0 ? "duel-slow" : ""}>
                      {row.delta > 0 ? "+" : ""}
                      {row.delta.toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <details className="duel-help">
            <summary>How to read this</summary>
            <ul>
              <li>
                Both cars run the circuit at the same <em>distance</em>, not the same clock:
                position on track is what makes the gap comparable.
              </li>
              <li>
                The delta starts at 0.000 and closes exactly on the official lap-time
                difference at the finish line.
              </li>
              <li>
                A positive delta means A is ahead; the bar fills toward the leading side.
              </li>
              <li>
                The sector table shows where the time was won: a negative Δ means B was faster
                in that sector.
              </li>
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
