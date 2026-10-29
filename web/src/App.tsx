import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { api } from "./api";
import BattlePanel from "./components/BattlePanel";
import CoachPanel from "./components/CoachPanel";
import GapChart from "./components/GapChart";
import PerformancePanel from "./components/PerformancePanel";
import PitPanel from "./components/PitPanel";
import SessionMap from "./components/SessionMap";
import SpeedChart, { type SpeedSeries } from "./components/SpeedChart";
import Timeline from "./components/Timeline";
import Tower from "./components/Tower";
import { formatClock } from "./session";
import { formatLapTime, teamColor } from "./format";
import { buildGapTable, gapAt, indexAt, lapAt, type GapTable } from "./session";
import { createPlayback } from "./playbackStore";
import { sectorFlags } from "./sectors";
import { useTheme } from "./theme";
import type {
  Driver,
  Geometry,
  Lap,
  Meeting,
  ReplayDriver,
  SessionGaps,
  SessionInfo,
  SessionInfoFull,
  SpeedPoint,
} from "./types";
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

function readParams() {
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
  const { theme, toggle } = useTheme();

  const years = useAsync("years", api.years);
  const [yearSel, setYearSel] = useState<number | null>(params.year ?? null);
  const [meetingKey, setMeetingKey] = useState<number | null>(params.meeting ?? null);
  const [sessionKey, setSessionKey] = useState<number | null>(params.session ?? null);
  const [highlight, setHighlight] = useState<number[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<number | null>(null);
  const [selectedCorner, setSelectedCorner] = useState<string | null>(null);
  const [view, setView] = useState<"replay" | "battle" | "performance" | "pit">("replay");
  const [showLaps, setShowLaps] = useState(false);
  const year = yearSel ?? years.data?.[years.data.length - 1] ?? null;

  useEffect(() => {
    const q = new URLSearchParams();
    if (year) q.set("year", String(year));
    if (meetingKey) q.set("meeting", String(meetingKey));
    if (sessionKey) q.set("session", String(sessionKey));
    window.history.replaceState(null, "", `${window.location.pathname}?${q.toString()}`);
  }, [year, meetingKey, sessionKey]);

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

  // Open inside a real race on first visit (deep links win).
  const autoPicked = useRef(false);
  const hasParams = params.year != null || params.meeting != null || params.session != null;
  useEffect(() => {
    if (autoPicked.current || hasParams || yearSel || !years.data?.length) return;
    setYearSel(years.data[years.data.length - 1]);
  }, [years.data, yearSel, hasParams]);
  useEffect(() => {
    if (autoPicked.current || hasParams || !year) return;
    const ms = meetings.data ?? [];
    if (!ms.length || sessionKey) return;
    let live = true;
    (async () => {
      for (const m of [...ms].reverse().slice(0, 8)) {
        const sess = await api.sessions(year, m.meeting_key).catch(() => []);
        if (!live || !sess.length) continue;
        const ordered = [
          ...sess.filter((s) => s.session_name.startsWith("Race")),
          ...sess.filter((s) => !s.session_name.startsWith("Race")),
        ];
        const probe = await api
          .sessionStatus(ordered.map((s) => s.session_key))
          .catch(() => ({} as Record<string, string>));
        if (!live) return;
        const good = ordered.find((s) => (probe[String(s.session_key)] ?? "x") === "");
        if (good) {
          autoPicked.current = true;
          setMeetingKey(m.meeting_key);
          setSessionKey(good.session_key);
          return;
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [meetings.data, year, sessionKey, hasParams]);

  const info = useAsync(`info:${sessionKey ?? "none"}`, () =>
    sessionKey ? api.sessionInfo(sessionKey) : Promise.resolve(null as unknown as SessionInfoFull),
  );
  const geo = useAsync(`geom:${sessionKey ?? "none"}`, () =>
    sessionKey
      ? api.sessionGeometry(sessionKey).catch(() => ({ ...EMPTY_GEO, driver: 0, lap: 0 }))
      : Promise.resolve({ ...EMPTY_GEO, driver: 0, lap: 0 }),
  );
  const replay = useAsync(`replay:${sessionKey ?? "none"}`, () =>
    sessionKey ? api.sessionReplay(sessionKey) : Promise.resolve(null),
  );
  const gaps = useAsync(`gaps:${sessionKey ?? "none"}`, () =>
    sessionKey ? api.sessionGaps(sessionKey) : Promise.resolve(null as unknown as SessionGaps),
  );
  const drivers = useAsync(`drivers:${sessionKey ?? "none"}`, () =>
    sessionKey ? api.drivers(sessionKey) : Promise.resolve([]),
  );
  const laps = useAsync(`laps:${sessionKey ?? "none"}`, () =>
    sessionKey ? api.laps(sessionKey) : Promise.resolve([]),
  );
  const allLaps = laps.data ?? [];

  const playbackRef = useRef(createPlayback());
  const playback = playbackRef.current;
  useSyncExternalStore(playback.subscribe, () => playback.state.rev);
  const { t: playT, dur, playing, speed, calm } = playback.state;

  useEffect(() => {
    if (replay.data) playback.setDur(Math.max(1, replay.data.duration_s));
  }, [replay.data, playback]);

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

  const replayMap = useMemo(() => {
    const m = new Map<number, ReplayDriver>();
    for (const d of replay.data?.drivers ?? []) m.set(d.driver_number, d);
    return m;
  }, [replay.data]);

  const gapTable: GapTable = useMemo(
    () => buildGapTable(gaps.data?.points ?? []),
    [gaps.data],
  );

  const driverMeta = useMemo(() => {
    const m = new Map<number, { code: string; color: string }>();
    for (const d of drivers.data ?? []) m.set(d.driver_number, { code: d.name_acronym, color: teamColor(d.team_colour) });
    return m;
  }, [drivers.data]);

  // Speed for chosen drivers only, fetched on demand.
  const [speedByDriver, setSpeedByDriver] = useState<Map<number, SpeedPoint[]>>(new Map());
  useEffect(() => {
    if (!sessionKey) return;
    const wanted = highlight.length ? highlight : selectedDriver != null ? [selectedDriver] : [];
    const missing = wanted.filter((d) => !speedByDriver.has(d));
    if (!missing.length) return;
    let live = true;
    (async () => {
      const next = new Map(speedByDriver);
      await Promise.all(
        missing.map(async (d) => {
          const pts = await api.sessionSpeed(sessionKey, d).catch(() => []);
          if (live) next.set(d, pts);
        }),
      );
      if (live) setSpeedByDriver(next);
    })();
    return () => {
      live = false;
    };
  }, [sessionKey, highlight, selectedDriver, speedByDriver]);

  const speedAt = (driver: number): number | null => {
    const pts = speedByDriver.get(driver);
    if (!pts?.length) return null;
    const times = pts.map((p) => p.t);
    const i = indexAt(times, playT);
    return i < 0 ? null : Math.round(pts[i].v);
  };

  const towerRows = useMemo(() => {
    const rows = (drivers.data ?? []).map((d) => ({
      driver: d.driver_number,
      code: d.name_acronym,
      color: teamColor(d.team_colour),
      gap: gapAt(gapTable, d.driver_number, playT),
      highlighted: highlight.includes(d.driver_number),
      selected: selectedDriver === d.driver_number,
    }));
    rows.sort((a, b) => {
      if (a.gap == null) return 1;
      if (b.gap == null) return -1;
      return a.gap - b.gap;
    });
    return rows;
  }, [drivers.data, gapTable, playT, highlight, selectedDriver]);

  const lapMarkers = replay.data?.laps ?? [];
  const progress = lapAt(lapMarkers, playT);
  const lapIdx = Math.max(0, lapMarkers.findIndex((m) => m.t > playT) - 1);
  const lapStartT = lapMarkers[lapIdx]?.t ?? 0;
  const lapEndT = lapMarkers[lapIdx + 1]?.t ?? Math.max(lapStartT + 1, dur);
  const lapWindow = { start: lapStartT, end: lapEndT };
  const focusDrivers = highlight.length ? highlight : selectedDriver != null ? [selectedDriver] : [];
  const chartDrivers = focusDrivers.length ? focusDrivers : towerRows.slice(0, 5).map((r) => r.driver);

  const series: SpeedSeries[] = chartDrivers.flatMap((d) => {
    const pts = speedByDriver.get(d);
    const meta = driverMeta.get(d);
    return pts?.length ? [{ driver: d, label: `#${d} ${meta?.code ?? ""}`.trim(), color: meta?.color ?? "#8A94A6", points: pts }] : [];
  });

  const ref = selectedDriver != null
    ? { driver: selectedDriver, lap: Math.max(1, progress.lap) }
    : bestLap(allLaps);
  const rivalLap = useMemo(() => {
    if (!ref) return null;
    let best: { driver: number; lap: number; t: number } | null = null;
    for (const l of allLaps) {
      if (l.lap_duration == null || l.driver_number === ref.driver) continue;
      if (!best || l.lap_duration < best.t) best = { driver: l.driver_number, lap: l.lap_number, t: l.lap_duration };
    }
    return best ? { driver: best.driver, lap: best.lap } : null;
  }, [allLaps, ref]);

  const flagged = useMemo(() => sectorFlags(allLaps), [allLaps]);
  const tableRows = useMemo(
    () => (highlight.length ? flagged.filter((l) => highlight.includes(l.driver_number)) : flagged),
    [flagged, highlight],
  );

  const gpName = meetings.data?.find((m: Meeting) => m.meeting_key === meetingKey)?.meeting_name ?? "";
  const sessName = sessions.data?.find((s: SessionInfo) => s.session_key === sessionKey)?.session_name ?? "";
  const sessionBlocked = sessionKey ? reasons[String(sessionKey)] || null : null;
  const loading = sessionKey != null && replay.data == null && replay.error == null;

  const seekToLap = (lapNumber: number) => {
    const marker = lapMarkers.find((m) => m.index === lapNumber);
    if (marker) playback.setT(marker.t);
    setShowLaps(false);
  };

  return (
    <>
      <header className="topbar">
        <h1>BoxBox Replay</h1>
        <span className="sub">
          {gpName}
          {sessName ? ` · ${sessName}` : ""}
          {progress.total ? ` · LAP ${Math.max(1, progress.lap)}/${progress.total}` : ""}
        </span>
        <span className="clock">{formatClock(playT)}</span>
        <button className="theme-toggle" onClick={toggle} aria-label="Switch theme">
          {theme === "night" ? "Day" : "Night"}
        </button>
      </header>

      <div className="pickers">
        <label>
          Season
          <select
            value={year ?? ""}
            onChange={(e) => {
              setYearSel(Number(e.target.value));
              setMeetingKey(null);
              setSessionKey(null);
              setHighlight([]);
              setSelectedDriver(null);
              setSelectedCorner(null);
            }}
          >
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
              setSessionKey(null);
              setHighlight([]);
              setSelectedDriver(null);
              setSelectedCorner(null);
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
              setSelectedDriver(null);
              setSelectedCorner(null);
              setSpeedByDriver(new Map());
            }}
            disabled={!sessions.data?.length}
          >
            <option value="">—</option>
            {(sessions.data ?? []).map((s: SessionInfo) => {
              const reason = reasons[String(s.session_key)];
              return (
                <option key={s.session_key} value={s.session_key} disabled={reason != null && reason !== ""}>
                  {s.session_name} ({s.date_start.slice(0, 10)})
                  {reason ? ` — ${reason}` : ""}
                </option>
              );
            })}
          </select>
        </label>
      </div>

      {sessionBlocked && (
        <main className="layout">
          <div className="empty" style={{ gridColumn: "1 / -1" }}>
            This session has no telemetry ({sessionBlocked}). Pick another session or Grand Prix.
          </div>
        </main>
      )}

      {!sessionKey && !sessionBlocked && (
        <main className="layout">
          <div className="empty" style={{ gridColumn: "1 / -1" }}>
            {loading ? "Loading the latest race…" : "Pick a season, Grand Prix and session to replay a race."}
          </div>
        </main>
      )}

      {sessionKey && !sessionBlocked && (
        <main className="layout">
          <section className="rail" aria-label="Timing tower">
            <h2>Timing tower</h2>
            <Tower
              rows={towerRows}
              onToggle={(n) => setHighlight((h) => (h.includes(n) ? h.filter((x) => x !== n) : [...h, n]))}
            />
            <p className="dim small">
              {highlight.length
                ? `${highlight.length} highlighted — tower, speed and gaps follow your choice.`
                : "Click a row to follow that driver. Nothing highlighted shows the whole field."}
            </p>
          </section>

          <section className="stage">
            <div className="tabbar" role="tablist" aria-label="Views">
              {(["replay", "battle", "performance", "pit"] as const).map((v) => (
                <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}>
                  {v === "pit" ? "Pit wall" : v}
                </button>
              ))}
            </div>

            {view === "replay" && (
              <>
                {loading && (
                  <div className="empty">
                    Loading race data — first visit for a session takes a minute, then it stays cached.
                  </div>
                )}
                {replay.error && <div className="empty">This session has no replay data. Try another one.</div>}
                {replay.data && (
                  <>
                    <div className="map-frame">
                      <SessionMap
                        playback={playback}
                        outline={geo.data?.outline ?? []}
                        corners={geo.data?.corners ?? []}
                        zones={geo.data?.zones ?? []}
                        replay={replayMap}
                        dots={(drivers.data ?? []).map((d) => ({
                          driver: d.driver_number,
                          code: d.name_acronym,
                          color: teamColor(d.team_colour),
                        }))}
                        highlight={highlight}
                        selectedCorner={selectedCorner}
                        selectedDriver={selectedDriver}
                        onCorner={setSelectedCorner}
                        onDriver={(n) => setSelectedDriver((cur) => (cur === n ? null : n))}
                        speedAt={speedAt}
                      />
                      <div className="player player-overlay">
                        <button className="primary" onClick={() => playback.toggle()}>
                          {playing ? "Pause" : "Play"}
                        </button>
                        <div className="seg" role="group" aria-label="Speed">
                          {[1, 2, 4, 8].map((s) => (
                            <button key={s} aria-pressed={speed === s} onClick={() => playback.setSpeed(s)}>
                              {s}×
                            </button>
                          ))}
                        </div>
                        <label className="dim small row">
                          <input type="checkbox" checked={calm} onChange={(e) => playback.setCalm(e.target.checked)} />
                          Calm
                        </label>
                        <span className="mono small dim" style={{ marginLeft: "auto" }}>
                          {formatClock(playT)} / {formatClock(dur)}
                        </span>
                      </div>
                    </div>

                    <Timeline playback={playback} markers={lapMarkers} onSeek={(t) => playback.setT(t)} />

                    {geo.data?.corners?.length ? (
                      <div className="row" aria-label="Corners">
                        <span className="dim small">Corners</span>
                        {geo.data.corners.map((c) => (
                          <button
                            key={c.label}
                            className={selectedCorner === c.label ? "chip on" : "chip"}
                            onClick={() => setSelectedCorner(c.label)}
                          >
                            {c.label}
                          </button>
                        ))}
                      </div>
                    ) : null}

                    <div className="panel">
                      <h3>Speed telemetry</h3>
                      {series.length ? (
                        <SpeedChart
                          playback={playback}
                          series={series}
                          windowStart={lapWindow.start}
                          windowEnd={lapWindow.end}
                          lapLabel={`LAP ${Math.max(1, progress.lap)}`}
                        />
                      ) : (
                        <p className="dim small">
                          Pick a driver in the tower (or click a car on the map) to see their speed trace for the lap under the playhead.
                        </p>
                      )}
                    </div>

                    <div className="panel">
                      <h3>Gap to leader</h3>
                      {gaps.data?.source === "none" ? (
                        <p className="dim small">No gap data for this session.</p>
                      ) : (
                        <GapChart
                          playback={playback}
                          table={gapTable}
                          drivers={chartDrivers}
                          labels={new Map(towerRows.map((r) => [r.driver, `#${r.code}`]))}
                          colors={new Map(towerRows.map((r) => [r.driver, r.color]))}
                          source={gaps.data?.source ?? "none"}
                        />
                      )}
                    </div>
                  </>
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
                intervals={[]}
                driver={highlight[0] ?? selectedDriver ?? towerRows[0]?.driver ?? 0}
              />
            )}
          </section>

          <section className="engineer">
            <h2>Race engineer</h2>
            {selectedCorner ? (
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
              <>
                <p className="session-title">{sessName} · {gpName}</p>
                <p className="dim small">{info.data?.date_start.slice(0, 10)}</p>
                <dl className="facts">
                  <div>
                    <dt>Distance</dt>
                    <dd>{info.data?.total_laps ?? "—"} laps</dd>
                  </div>
                  <div>
                    <dt>Drivers</dt>
                    <dd>{info.data?.drivers ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Race time</dt>
                    <dd>{info.data ? formatClock(info.data.duration_s) : "—"}</dd>
                  </div>
                  <div>
                    <dt>Gaps</dt>
                    <dd>{gaps.data?.source === "lap_times" ? "from lap times" : gaps.data?.source === "intervals" ? "live timing" : "—"}</dd>
                  </div>
                </dl>
                <p className="dim small">
                  {selectedDriver != null
                    ? `Following #${selectedDriver}. Click a corner to ask the engineer about it.`
                    : "Click a car or a corner on the map to dig in."}
                </p>
              </>
            )}
          </section>
        </main>
      )}

      {sessionKey && !sessionBlocked && (
        <section className="laps-section">
          <button className="disclosure" onClick={() => setShowLaps((v) => !v)} aria-expanded={showLaps}>
            {showLaps ? "Hide lap times" : `Show lap times (${tableRows.length})`}
          </button>
          {showLaps && (
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
                  {tableRows.map((l) => {
                    const cls = (f: string) =>
                      f === "session" ? "sector-session" : f === "personal" ? "sector-personal" : "";
                    return (
                      <tr key={`${l.driver_number}-${l.lap_number}`} onClick={() => seekToLap(l.lap_number)}>
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
          )}
          <div className="chips" role="group" aria-label="Highlight drivers">
            {(drivers.data ?? []).map((d: Driver) => {
              const on = highlight.includes(d.driver_number);
              return (
                <button
                  key={d.driver_number}
                  aria-pressed={on}
                  className={on ? "chip on" : "chip"}
                  onClick={() =>
                    setHighlight((h) =>
                      h.includes(d.driver_number) ? h.filter((x) => x !== d.driver_number) : [...h, d.driver_number],
                    )
                  }
                >
                  <i style={{ background: teamColor(d.team_colour) }} />
                  {d.name_acronym}
                </button>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
