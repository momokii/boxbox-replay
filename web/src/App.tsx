import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { api } from "./api";
import BattlePanel from "./components/BattlePanel";
import CoachPanel from "./components/CoachPanel";
import GapChart from "./components/GapChart";
import PerformancePanel from "./components/PerformancePanel";
import PitPanel from "./components/PitPanel";
import Tower from "./components/Tower";
import TrackMap from "./components/TrackMap";
import SpeedStrip, { type TraceSeries } from "./components/SpeedStrip";
import { formatLapTime, teamColor } from "./format";
import { gapsAt } from "./playback";
import { createPlayback } from "./playbackStore";
import { sectorFlags } from "./sectors";
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

function readParams(): { year?: number; meeting?: number; session?: number } {
  const q = new URLSearchParams(window.location.search);
  const num = (k: string) => {
    const v = q.get(k);
    return v && /^\d+$/.test(v) ? Number(v) : undefined;
  };
  return { year: num("year"), meeting: num("meeting"), session: num("session") };
}

const EMPTY_GEO: Geometry = { ax: "x", ay: "y", outline: [], corners: [], zones: [] };

export default function App() {
  const params = useMemo(readParams, []);
  const years = useAsync("years", api.years);
  const [yearSel, setYearSel] = useState<number | null>(params.year ?? null);
  const [meetingKey, setMeetingKey] = useState<number | null>(params.meeting ?? null);
  const [sessionKey, setSessionKey] = useState<number | null>(params.session ?? null);
  const [highlight, setHighlight] = useState<number[]>([]);
  const [selected, setSelected] = useState<{ driver: number; lap: number } | null>(null);
  const [selectedCorner, setSelectedCorner] = useState<string | null>(null);
  const [view, setView] = useState<"replay" | "battle" | "performance" | "pit">("replay");
  const year = yearSel ?? years.data?.[years.data.length - 1] ?? null;

  // Deep links: reflect selection in the URL.
  useEffect(() => {
    const q = new URLSearchParams();
    if (year) q.set("year", String(year));
    if (meetingKey) q.set("meeting", String(meetingKey));
    if (sessionKey) q.set("session", String(sessionKey));
    window.history.replaceState(null, "", `${window.location.pathname}?${q.toString()}`);
  }, [year, meetingKey, sessionKey]);

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
  const sessionKeys = useMemo(
    () => (sessions.data ?? []).map((s) => s.session_key),
    [sessions.data],
  );
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
  const allLaps = laps.data ?? [];

  // Reference lap: table selection wins, else the session's best lap.
  const ref = selected ?? bestLap(allLaps);
  const refKey = ref && sessionKey ? `${sessionKey}:${ref.driver}:${ref.lap}` : "";

  const rivalLap = useMemo(() => {
    if (!ref) return null;
    let best: { driver: number; lap: number; t: number } | null = null;
    for (const l of allLaps) {
      if (l.lap_duration == null || l.driver_number === ref.driver) continue;
      if (!best || l.lap_duration < best.t) best = { driver: l.driver_number, lap: l.lap_number, t: l.lap_duration };
    }
    return best ? { driver: best.driver, lap: best.lap } : null;
  }, [allLaps, ref]);

  // Playback store (stable across renders).
  const playbackRef = useRef(createPlayback());
  const playback = playbackRef.current;
  useSyncExternalStore(playback.subscribe, () => playback.state.rev);
  const { t: playT, dur, playing, speed, calm } = playback.state;

  // --- Staged replay loading ---
  // Stage 1: lap window (dur + start known immediately, gaps work).
  // Stage 2: geometry (track renders). Stage 3: locations stream in per
  // driver (dots appear as they arrive). Stage 4: car data in background.
  const [win, setWin] = useState<{ startMs: number; dur: number } | null>(null);
  const [geo, setGeo] = useState<Geometry | null>(null);
  const [locs, setLocs] = useState<Map<number, LocPoint[]>>(new Map());
  const [cars, setCars] = useState<Map<number, LapPoint[]>>(new Map());
  const [loadNote, setLoadNote] = useState<string | null>(null);

  useEffect(() => {
    if (!refKey || !ref || !sessionKey) {
      setWin(null);
      setGeo(null);
      setLocs(new Map());
      setCars(new Map());
      setLoadNote(null);
      return;
    }
    let live = true;
    const [sKey, dNum, lap] = [sessionKey, ref.driver, ref.lap];
    setLoadNote("lap window…");
    (async () => {
      const w = await api.lapWindow(sKey, dNum, lap);
      if (!live) return;
      const startMs = Date.parse(w.start);
      const rawEndMs = w.end ? Date.parse(w.end) : startMs + 120000;
      const cappedEndMs = Math.min(rawEndMs, startMs + 150000);
      const wStartIso = new Date(startMs).toISOString();
      const wEndIso = new Date(cappedEndMs).toISOString();
      const durS = (cappedEndMs - startMs) / 1000;
      setWin({ startMs, dur: durS });
      playback.setDur(durS);
      setLoadNote("track…");
      const geometry = await api.geometry(sKey, dNum, lap).catch(() => EMPTY_GEO);
      if (!live) return;
      setGeo(geometry);
      const nums = (drivers.data ?? []).map((d) => d.driver_number);
      const targets = nums.length ? nums : [dNum];
      const acc = new Map<number, LocPoint[]>();
      let done = 0;
      setLoadNote(`drivers 0/${targets.length}…`);
      await Promise.all(
        targets.map(async (n) => {
          const loc = await api.location(sKey, n, undefined, wStartIso, wEndIso).catch(() => [] as LocPoint[]);
          if (!live) return;
          acc.set(n, loc);
          done += 1;
          setLocs(new Map(acc));
          if (done < targets.length) setLoadNote(`drivers ${done}/${targets.length}…`);
        }),
      );
      if (!live) return;
      setLoadNote("telemetry…");
      const carAcc = new Map<number, LapPoint[]>();
      await Promise.all(
        targets.map(async (n) => {
          const car = await api.car(sKey, n, undefined, wStartIso, wEndIso).catch(() => [] as LapPoint[]);
          if (!live) return;
          carAcc.set(n, car);
          setCars(new Map(carAcc));
        }),
      );
      if (!live) return;
      setLoadNote(null);
    })().catch(() => live && setLoadNote("failed to load replay"));
    return () => {
      live = false;
    };
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

  const flagged = useMemo(() => sectorFlags(allLaps), [allLaps]);
  const visible = useMemo(
    () => (highlight.length ? flagged.filter((l) => highlight.includes(l.driver_number)) : flagged),
    [flagged, highlight],
  );

  const driverMeta = useMemo(() => {
    const m = new Map<number, { code: string; color: string }>();
    for (const d of drivers.data ?? []) m.set(d.driver_number, { code: d.name_acronym, color: teamColor(d.team_colour) });
    return m;
  }, [drivers.data]);

  const gaps = useMemo(() => {
    if (!win) return new Map<number, number | null>();
    return gapsAt(intervals.data ?? [], win.startMs + playT * 1000);
  }, [intervals.data, win, playT]);

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
    if (!bundleReady(locs)) return [];
    return traceDrivers.flatMap((n) => {
      const car = cars.get(n) ?? [];
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
  }, [locs, cars, traceDrivers, driverMeta]);

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
  const sessName = sessions.data?.find((s: SessionInfo) => s.session_key === sessionKey)?.session_name ?? "";
  const gapDrivers = useMemo(() => {
    if (highlight.length) return highlight;
    return towerRows.slice(0, 5).map((r) => r.driver);
  }, [highlight, towerRows]);

  return (
    <>
      <header className="topbar">
        <h1>
          BoxBox <span className="accent">Replay</span>
        </h1>
        <span className="sub">
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

      {!sessionKey && (
        <main className="layout">
          <div className="empty" style={{ gridColumn: "1 / -1" }}>
            Pick a season, Grand Prix and session to start the full-field replay.
          </div>
        </main>
      )}

      {sessionKey && (
        <main className="layout">
          <section className="rail" aria-label="Timing tower">
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
            <div className="row" role="tablist" aria-label="Views" style={{ marginBottom: "8px" }}>
              {(["replay", "battle", "performance", "pit"] as const).map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  style={{ textTransform: "capitalize" }}
                >
                  {v === "pit" ? "Pit wall" : v}
                </button>
              ))}
            </div>

            {view === "replay" && (
              <>
                <div className="player" aria-label="Replay controls">
                  <button className="primary" onClick={() => playback.toggle()} disabled={!win}>
                    {playing ? "Pause" : "Play"}
                  </button>
                  <span className="time mono">
                    {playT.toFixed(1)} / {dur.toFixed(0)}s
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0.1, dur)}
                    step={0.1}
                    value={playT}
                    onChange={(e) => playback.setT(Number(e.target.value))}
                    aria-label="Scrub replay"
                  />
                  <div className="seg" role="group" aria-label="Speed">
                    {[1, 2, 4].map((s) => (
                      <button key={s} aria-pressed={speed === s} onClick={() => playback.setSpeed(s)}>
                        {s}x
                      </button>
                    ))}
                  </div>
                  <label className="dim row" style={{ fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                    <input type="checkbox" checked={calm} onChange={(e) => playback.setCalm(e.target.checked)} />
                    Calm
                  </label>
                </div>

                {loadNote && win && (
                  <p className="dim">
                    Loading {loadNote}
                    <span className="skel" style={{ display: "inline-block", width: "120px", height: "10px", marginLeft: "8px" }} />
                  </p>
                )}
                {geo && geo.outline.length > 0 ? (
                  <TrackMap
                    playback={playback}
                    outline={geo.outline}
                    corners={geo.corners}
                    zones={geo.zones}
                    locs={locs}
                    cars={cars}
                    dots={dots}
                    highlight={highlight}
                    selectedCorner={selectedCorner}
                    onCorner={setSelectedCorner}
                  />
                ) : (
                  <div className="empty">{loadNote ? `Loading ${loadNote}` : "Waiting for track data…"}</div>
                )}

                {geo && geo.corners.length > 0 && (
                  <div className="row" style={{ marginTop: "8px" }} aria-label="Corners">
                    <span className="dim" style={{ fontSize: "0.75rem" }}>Corners:</span>
                    {geo.corners.map((c) => (
                      <button
                        key={c.label}
                        onClick={() => setSelectedCorner(c.label)}
                        className={selectedCorner === c.label ? "primary" : ""}
                        style={{ padding: "4px 10px", fontSize: "0.8rem" }}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                )}

                <h2>Speed</h2>
                {stripSeries.length ? (
                  <SpeedStrip playback={playback} series={stripSeries} />
                ) : (
                  <p className="dim">Traces appear once telemetry loads.</p>
                )}

                <h2>Gap to leader</h2>
                <GapChart
                  intervals={intervals.data ?? []}
                  drivers={gapDrivers}
                  labels={new Map(towerRows.map((r) => [r.driver, `#${r.driver} ${r.code}`]))}
                  colors={new Map(towerRows.map((r) => [r.driver, r.color]))}
                />
                {!highlight.length && towerRows.length > 5 && (
                  <p className="dim" style={{ fontSize: "0.75rem" }}>
                    Showing top 5 — highlight drivers in the tower to compare others.
                  </p>
                )}
              </>
            )}

            {view === "battle" && sessionKey && (
              <BattlePanel playback={playback} sessionKey={sessionKey} drivers={drivers.data ?? []} laps={allLaps} refProp={ref} />
            )}
            {view === "performance" && (
              <PerformancePanel
                sessionKey={sessionKey}
                laps={allLaps}
                highlight={highlight}
                towerOrder={towerRows.map((r) => r.driver)}
              />
            )}
            {view === "pit" && sessionKey && (
              <PitPanel
                sessionKey={sessionKey}
                laps={allLaps}
                intervals={intervals.data ?? []}
                driver={highlight[0] ?? ref?.driver ?? towerRows[0]?.driver ?? 0}
              />
            )}
          </section>

          <section className="engineer">
            <h2>Race engineer</h2>
            {sessionKey ? (
              <CoachPanel
                sessionKey={sessionKey}
                selfLap={ref}
                rivalLap={rivalLap}
                corner={selectedCorner}
                driverName={(n) => {
                  const d = (drivers.data ?? []).find((x) => x.driver_number === n);
                  return d ? `#${n} ${d.name_acronym}` : `#${n}`;
                }}
              />
            ) : (
              <p className="dim">Pick a session first.</p>
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
          <div className="laps-wrap">
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
                  const cls = (f: string) =>
                    f === "session" ? "sector-session" : f === "personal" ? "sector-personal" : "";
                  return (
                    <tr
                      key={`${l.driver_number}-${l.lap_number}`}
                      className={selm ? "selected" : ""}
                      onClick={() => setSelected({ driver: l.driver_number, lap: l.lap_number })}
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
          </div>
          <h3>Highlight drivers (optional)</h3>
          <select
            multiple
            size={10}
            style={{ minWidth: "140px" }}
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

function bundleReady(locs: Map<number, unknown>): boolean {
  return locs.size > 0;
}
