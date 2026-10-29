import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { api } from "./api";
import Tower from "./components/Tower";
import TrackMap from "./components/TrackMap";
import SpeedStrip, { type TraceSeries } from "./components/SpeedStrip";
import { formatLapTime } from "./format";
import { gapsAt, windowDuration } from "./playback";
import { createPlayback } from "./playbackStore";
import { sectorFlags } from "./sectors";
import { teamColor } from "./format";
import type { Driver, Geometry, Lap, LapPoint, LocPoint, Meeting, SessionInfo } from "./types";
import "./index.css";

function useAsync<T>(key: string, fn: () => Promise<T>): { data: T | null; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    let live = true;
    setError(null);
    ref
      .current()
      .then((d) => live && setData(d))
      .catch((e) => live && setError(String(e)));
    return () => {
      live = false;
    };
  }, [key]);
  return { data, error };
}

function bestLap(laps: Lap[]): { driver: number; lap: number } | null {
  let best: { driver: number; lap: number; t: number } | null = null;
  for (const l of laps) {
    if (l.lap_duration == null) continue;
    if (!best || l.lap_duration < best.t) best = { driver: l.driver_number, lap: l.lap_number, t: l.lap_duration };
  }
  return best ? { driver: best.driver, lap: best.lap } : null;
}

export default function App() {
  const years = useAsync("years", api.years);
  const [yearSel, setYearSel] = useState<number | null>(null);
  const [meetingKey, setMeetingKey] = useState<number | null>(null);
  const [sessionKey, setSessionKey] = useState<number | null>(null);
  const [highlight, setHighlight] = useState<number[]>([]);
  const [selected, setSelected] = useState<{ driver: number; lap: number } | null>(null);
  const [selectedCorner, setSelectedCorner] = useState<string | null>(null);
  const year = yearSel ?? years.data?.[years.data.length - 1] ?? null;

  const resetSession = () => {
    setSessionKey(null);
    setHighlight([]);
    setSelected(null);
    setSelectedCorner(null);
  };

  const meetings = useAsync(`meetings:${year ?? "none"}`, () =>
    year ? api.meetings(year) : Promise.resolve([]),
  );
  const sessions = useAsync(`sessions:${year ?? "none"}:${meetingKey ?? "none"}`, () =>
    year && meetingKey ? api.sessions(year, meetingKey) : Promise.resolve([]),
  );
  const sessionKeys = useMemo(() => (sessions.data ?? []).map((s) => s.session_key), [sessions.data]);
  const status = useAsync(`status:${sessionKeys.join(",")}`, () =>
    sessionKeys.length ? api.sessionStatus(sessionKeys) : Promise.resolve({}),
  );
  const reasons: Record<string, string> = status.data ?? {};

  const drivers = useAsync(`drivers:${sessionKey ?? "none"}`, () =>
    sessionKey ? api.drivers(sessionKey) : Promise.resolve([]),
  );
  const laps = useAsync(`laps:${sessionKey ?? "none"}`, () =>
    sessionKey ? api.laps(sessionKey) : Promise.resolve([]),
  );
  const intervals = useAsync(`intervals:${sessionKey ?? "none"}`, () =>
    sessionKey ? api.intervals(sessionKey) : Promise.resolve([]),
  );

  // Reference lap: table selection wins, else the session's best lap.
  const allLaps = laps.data ?? [];
  const ref = selected ?? bestLap(allLaps);
  const refKey = ref && sessionKey ? `${sessionKey}:${ref.driver}:${ref.lap}` : "";

  // Playback store (stable across renders).
  const playbackRef = useRef(createPlayback());
  const playback = playbackRef.current;
  useSyncExternalStore(playback.subscribe, () => playback.state.rev);
  const { t: playT, dur, playing, speed, calm } = playback.state;

  // Replay bundle: geometry + all-driver locations/cars for the reference lap.
  const [bundle, setBundle] = useState<{
    key: string;
    geometry: Geometry;
    locs: Map<number, LocPoint[]>;
    cars: Map<number, LapPoint[]>;
    winStartMs: number;
    progress: string | null;
  } | null>(null);

  const emptyGeometry: Geometry = { ax: "x", ay: "y", outline: [], corners: [], zones: [] };

  useEffect(() => {
    if (!refKey || !ref || !sessionKey) {
      setBundle(null);
      return;
    }
    let live = true;
    const [sKey, dNum, lap] = [sessionKey, ref.driver, ref.lap];
    (async () => {
      setBundle({
        key: refKey,
        geometry: emptyGeometry,
        locs: new Map(),
        cars: new Map(),
        winStartMs: 0,
        progress: "track…",
      });
      const geometry = await api.geometry(sKey, dNum, lap);
      if (!live) return;
      const driverNums = (drivers.data ?? []).map((d) => d.driver_number);
      const nums = driverNums.length ? driverNums : [dNum];
      const locs = new Map<number, LocPoint[]>();
      const cars = new Map<number, LapPoint[]>();
      let done = 0;
      await Promise.all(
        nums.map(async (n) => {
          const [loc, car] = await Promise.all([
            api.location(sKey, n, lap).catch(() => [] as LocPoint[]),
            api.car(sKey, n, lap).catch(() => [] as LapPoint[]),
          ]);
          if (!live) return;
          locs.set(n, loc);
          cars.set(n, car);
          done += 1;
          setBundle((b) =>
            b && b.key === refKey ? { ...b, progress: `drivers ${done}/${nums.length}…` } : b,
          );
        }),
      );
      if (!live) return;
      let maxDur = 0;
      let winStartMs = 0;
      locs.forEach((pts) => {
        maxDur = Math.max(maxDur, windowDuration(pts));
        if (pts.length) {
          const s = Date.parse(pts[0].date);
          if (!winStartMs || s < winStartMs) winStartMs = s;
        }
      });
      playback.setDur(maxDur);
      setBundle({ key: refKey, geometry, locs, cars, winStartMs, progress: null });
    })().catch(() => {
      if (live) {
        setBundle({
          key: refKey,
          geometry: emptyGeometry,
          locs: new Map(),
          cars: new Map(),
          winStartMs: 0,
          progress: "failed to load replay",
        });
      }
    });
    return () => {
      live = false;
    };
    // refKey is the stable identity of (session, driver, lap); ref object
    // identity changes every render, so it stays out of the dep list.
  }, [refKey]);

  // Space = play/pause (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? "").toUpperCase();
      if (e.code === "Space" && !/INPUT|TEXTAREA|SELECT/.test(tag)) {
        e.preventDefault();
        playback.toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playback]);

  const flagged = useMemo(() => (laps.data ? sectorFlags(laps.data) : []), [laps.data]);
  const visible = useMemo(
    () => (highlight.length ? flagged.filter((l) => highlight.includes(l.driver_number)) : flagged),
    [flagged, highlight],
  );

  const driverMeta = useMemo(() => {
    const m = new Map<number, { code: string; color: string }>();
    for (const d of drivers.data ?? []) {
      m.set(d.driver_number, { code: d.name_acronym, color: teamColor(d.team_colour) });
    }
    return m;
  }, [drivers.data]);

  const gaps = useMemo(() => {
    if (!bundle) return new Map<number, number | null>();
    return gapsAt(intervals.data ?? [], bundle.winStartMs + playT * 1000);
  }, [intervals.data, bundle, playT]);

  const towerRows = useMemo(() => {
    const rows = (drivers.data ?? []).map((d) => ({
      driver: d.driver_number,
      code: d.name_acronym,
      color: teamColor(d.team_colour),
      gap: gaps.get(d.driver_number) ?? null,
      highlighted: highlight.includes(d.driver_number),
      selected: selected?.driver === d.driver_number,
    }));
    rows.sort((a, b) => {
      if (a.gap == null) return 1;
      if (b.gap == null) return -1;
      return a.gap - b.gap;
    });
    return rows;
  }, [drivers.data, gaps, highlight, selected]);

  const traceDrivers = useMemo(() => {
    if (highlight.length) return highlight;
    return towerRows.slice(0, 3).map((r) => r.driver);
  }, [highlight, towerRows]);

  const stripSeries: TraceSeries[] = useMemo(() => {
    if (!bundle) return [];
    return traceDrivers.flatMap((n) => {
      const car = bundle.cars.get(n) ?? [];
      if (!car.length) return [];
      const meta = driverMeta.get(n);
      return [
        {
          label: `#${n} ${meta?.code ?? ""}`.trim(),
          color: meta?.color ?? "#8A94A6",
          t: car.map((c) => c.t),
          speed: car.map((c) => c.speed),
        },
      ];
    });
  }, [bundle, traceDrivers, driverMeta]);

  const dots = useMemo(
    () =>
      (drivers.data ?? []).map((d) => ({
        driver: d.driver_number,
        label: `#${d.driver_number} ${d.name_acronym}`,
        color: teamColor(d.team_colour),
      })),
    [drivers.data],
  );

  const driverLabel = (d: Driver) => `#${d.driver_number} ${d.name_acronym}`;
  const gpName = meetings.data?.find((m: Meeting) => m.meeting_key === meetingKey)?.meeting_name ?? "";
  const sessName =
    sessions.data?.find((s: SessionInfo) => s.session_key === sessionKey)?.session_name ?? "";

  return (
    <>
      <header className="topbar">
        <h1>
          BoxBox <span className="accent">Replay</span>
        </h1>
        <span className="dim">
          {gpName} {sessName && `· ${sessName}`} {ref && `· lap ${ref.lap} replay`}
        </span>
      </header>

      <div className="pickers">
        <label>
          Season
          <select
            value={year ?? ""}
            onChange={(e) => {
              setYearSel(Number(e.target.value));
              setMeetingKey(null);
              resetSession();
            }}
          >
            <option value="">—</option>
            {(years.data ?? []).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label>
          Grand Prix
          <select
            value={meetingKey ?? ""}
            onChange={(e) => {
              setMeetingKey(Number(e.target.value));
              resetSession();
            }}
            disabled={!meetings.data?.length}
          >
            <option value="">—</option>
            {(meetings.data ?? []).map((m: Meeting) => (
              <option key={m.meeting_key} value={m.meeting_key}>
                {m.meeting_name} · {m.location}
              </option>
            ))}
          </select>
        </label>
        <label>
          Session
          <select
            value={sessionKey ?? ""}
            onChange={(e) => {
              setSessionKey(Number(e.target.value));
              setHighlight([]);
              setSelected(null);
              setSelectedCorner(null);
            }}
            disabled={!sessions.data?.length}
          >
            <option value="">—</option>
            {(sessions.data ?? []).map((s: SessionInfo) => {
              const reason = reasons[String(s.session_key)];
              return (
                <option key={s.session_key} value={s.session_key} disabled={reason !== undefined && reason !== ""}>
                  {s.session_name} ({s.date_start.slice(0, 10)})
                  {reason ? ` — ${reason}` : ""}
                </option>
              );
            })}
          </select>
        </label>
      </div>

      {sessionKey && (
        <main className="layout">
          <section className="rail">
            <h2>Timing tower</h2>
            <Tower
              rows={towerRows}
              onToggle={(n) => setHighlight((h) => (h.includes(n) ? h.filter((x) => x !== n) : [...h, n]))}
            />
            <p className="dim" style={{ fontSize: "0.75rem" }}>
              Click a row to highlight. Empty highlight = full field.
            </p>
          </section>

          <section className="stage">
            <div className="row">
              <button className="primary" onClick={() => playback.toggle()}>
                {playing ? "Pause" : "Play"}
              </button>
              <label className="dim">
                Speed{" "}
                <select value={speed} onChange={(e) => playback.setSpeed(Number(e.target.value))}>
                  {[1, 2, 4].map((s) => (
                    <option key={s} value={s}>
                      {s}x
                    </option>
                  ))}
                </select>
              </label>
              <label className="dim row">
                <input type="checkbox" checked={calm} onChange={(e) => playback.setCalm(e.target.checked)} />
                Reduce motion
              </label>
              <span className="mono dim">
                {playT.toFixed(1)}s / {dur.toFixed(0)}s
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(0.1, dur)}
              step={0.1}
              value={playT}
              onChange={(e) => playback.setT(Number(e.target.value))}
              style={{ width: "100%" }}
              aria-label="Scrub replay"
            />
            {bundle?.progress && <p className="dim">Loading {bundle.progress}</p>}
            {bundle && !bundle.progress && (
              <TrackMap
                playback={playback}
                outline={bundle.geometry.outline}
                corners={bundle.geometry.corners}
                zones={bundle.geometry.zones}
                locs={bundle.locs}
                cars={bundle.cars}
                dots={dots}
                highlight={highlight}
                selectedCorner={selectedCorner}
                onCorner={setSelectedCorner}
              />
            )}
            <h2>Speed</h2>
            <SpeedStrip playback={playback} series={stripSeries} />
          </section>

          <section className="engineer">
            <h2>Race engineer</h2>
            {selectedCorner ? (
              <p>
                Corner <strong>{selectedCorner}</strong> selected — coach fires on demand in R3.
              </p>
            ) : (
              <p className="dim">Click a corner diamond on the map.</p>
            )}
            {selected && (
              <p>
                Loaded lap: <strong>#{selected.driver}</strong> lap {selected.lap}
              </p>
            )}
          </section>
        </main>
      )}

      {sessionKey && (
        <section style={{ maxWidth: "1600px", margin: "0 auto", padding: "0 12px 24px" }}>
          <h2>Lap table</h2>
          {laps.error && <p>Failed to load laps: {laps.error}</p>}
          <table className="laps mono">
            <thead>
              <tr>
                <th>Lap</th>
                <th>Driver</th>
                <th>Time</th>
                <th>S1</th>
                <th>S2</th>
                <th>S3</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((l) => {
                const selm = selected?.driver === l.driver_number && selected?.lap === l.lap_number;
                const cls = (f: string) => (f === "session" ? "sector-session" : f === "personal" ? "sector-personal" : "");
                return (
                  <tr
                    key={`${l.driver_number}-${l.lap_number}`}
                    className={selm ? "selected" : ""}
                    onClick={() => setSelected({ driver: l.driver_number, lap: l.lap_number })}
                    style={{ cursor: "pointer" }}
                  >
                    <td>{l.lap_number}</td>
                    <td>#{l.driver_number}</td>
                    <td>{formatLapTime(l.lap_duration)}</td>
                    <td className={cls(l.s1)}>{formatLapTime(l.duration_sector_1)}</td>
                    <td className={cls(l.s2)}>{formatLapTime(l.duration_sector_2)}</td>
                    <td className={cls(l.s3)}>{formatLapTime(l.duration_sector_3)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <h3>Highlight drivers (optional)</h3>
          <select
            multiple
            size={6}
            value={highlight.map(String)}
            disabled={!drivers.data?.length}
            onChange={(e) => setHighlight(Array.from(e.target.selectedOptions).map((o) => Number(o.value)))}
          >
            {(drivers.data ?? []).map((d: Driver) => (
              <option key={d.driver_number} value={d.driver_number}>
                {driverLabel(d)}
              </option>
            ))}
          </select>
        </section>
      )}
    </>
  );
}
