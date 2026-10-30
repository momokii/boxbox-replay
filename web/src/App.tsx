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
import DriverCard from "./components/DriverCard";
import Info from "./components/Info";
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
    // Clearing on key change is deliberate: showing the previous session's
    // data while a new one loads is exactly the "no context" bug we fixed.
    setData(null);
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

function ReplayFailure(p: { error: string; onRetry: () => void }) {
  const missing = p.error.includes("404");
  return (
    <div className="empty">
      {missing ? (
        <p>This session has no position data in the timing feed, so there is nothing to replay.</p>
      ) : (
        <>
          <p>Couldn't load this session — the timing feed did not answer in time.</p>
          <p className="dim small">This is usually temporary. Nothing is lost; the data is fetched again.</p>
          <button className="primary" onClick={p.onRetry} style={{ marginTop: 8 }}>
            Try again
          </button>
        </>
      )}
    </div>
  );
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
  const [replayRetry, setReplayRetry] = useState(0);
  const autoRetried = useRef<Set<number>>(new Set());

  const replay = useAsync(`replay:${sessionKey ?? "none"}:${replayRetry}`, () =>
    sessionKey ? api.sessionReplay(sessionKey, replayRetry > 0) : Promise.resolve(null),
  );

  // A transient feed failure should not need a button press: retry once per
  // session on its own, and leave the explicit button for a second failure.
  useEffect(() => {
    if (!sessionKey || !replay.error) return;
    if (replay.error.includes("404")) return;
    if (autoRetried.current.has(sessionKey)) return;
    autoRetried.current.add(sessionKey);
    const id = window.setTimeout(() => setReplayRetry((n) => n + 1), 1200);
    return () => window.clearTimeout(id);
  }, [sessionKey, replay.error]);
  const gaps = useAsync(`gaps:${sessionKey ?? "none"}`, () =>
    sessionKey ? api.sessionGaps(sessionKey) : Promise.resolve(null as unknown as SessionGaps),
  );
  const sessionLoading = sessionKey != null && replay.error == null && replay.data == null;
  const drivers = useAsync(`drivers:${sessionKey ?? "none"}`, () =>
    sessionKey ? api.drivers(sessionKey) : Promise.resolve([]),
  );
  const laps = useAsync(`laps:${sessionKey ?? "none"}`, () =>
    sessionKey ? api.laps(sessionKey) : Promise.resolve([]),
  );
  const stints = useAsync(`stints:${sessionKey ?? "none"}`, () =>
    sessionKey ? api.stints(sessionKey) : Promise.resolve([]),
  );
  const allLaps = useMemo(() => laps.data ?? [], [laps.data]);

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

  const tyreFor = (driver: number, lap: number): string | null => {
    const row = (stints.data ?? [])
      .filter((s) => s.driver_number === driver)
      .find((s) => lap >= (s.lap_start ?? 1) && lap <= (s.lap_end ?? Number.MAX_SAFE_INTEGER));
    if (!row) return null;
    const age = row.lap_start != null ? Math.max(1, lap - row.lap_start + 1) : null;
    return `${row.compound ?? "?"}${age ? ` · ${age} laps` : ""}`;
  };
  const hoverInfo = (driver: number) => {
    const row = towerRows.find((r) => r.driver === driver);
    return {
      pos: row ? towerRows.indexOf(row) + 1 : null,
      gap: row?.gap ?? null,
      tyre: tyreFor(driver, Math.max(1, progress.lap)),
      speed: speedAt(driver),
    };
  };

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

  const gapBehind = useMemo(() => {
    const pitDriver = highlight[0] ?? selectedDriver;
    if (pitDriver == null) return null;
    const mine = gapAt(gapTable, pitDriver, playT);
    if (mine == null) return null;
    const behind = (drivers.data ?? [])
      .filter((d) => d.driver_number !== pitDriver)
      .map((d) => gapAt(gapTable, d.driver_number, playT))
      .filter((g): g is number => g != null && g > mine);
    return behind.length ? Math.min(...behind) - mine : null;
  }, [gapTable, highlight, selectedDriver, drivers.data, playT]);

  const lapMarkers = replay.data?.laps ?? [];
  const progress = lapAt(lapMarkers, playT);
  const lapIdx = Math.max(0, lapMarkers.findIndex((m) => m.t > playT) - 1);
  const lapStartT = lapMarkers[lapIdx]?.t ?? 0;
  const lapEndT = lapMarkers[lapIdx + 1]?.t ?? Math.max(lapStartT + 1, dur);
  const lapWindow = { start: lapStartT, end: lapEndT };
  const focusDrivers = highlight.length ? highlight : selectedDriver != null ? [selectedDriver] : [];

  // When you have not picked anyone, follow one stable driver (the leader at
  // lights out) instead of a set that changes as the replay runs.
  const defaultDriver = useMemo(() => {
    let best: { driver: number; gap: number } | null = null;
    for (const d of drivers.data ?? []) {
      const g = gapAt(gapTable, d.driver_number, 0);
      if (g == null) continue;
      if (!best || g < best.gap) best = { driver: d.driver_number, gap: g };
    }
    return best?.driver ?? null;
  }, [drivers.data, gapTable]);

  useEffect(() => {
    if (!sessionKey || focusDrivers.length || defaultDriver == null) return;
    if (speedByDriver.has(defaultDriver)) return;
    let live = true;
    api
      .sessionSpeed(sessionKey, defaultDriver)
      .then((pts) => {
        if (live) setSpeedByDriver((prev) => new Map(prev).set(defaultDriver, pts));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [sessionKey, focusDrivers.length, defaultDriver, speedByDriver]);


  const chartDrivers = focusDrivers.length
    ? focusDrivers
    : defaultDriver != null
      ? [defaultDriver]
      : [];

  const speedLoading = chartDrivers.filter((d) => !speedByDriver.has(d));
  const series: SpeedSeries[] = chartDrivers.flatMap((d) => {
    const pts = speedByDriver.get(d);
    const meta = driverMeta.get(d);
    return pts?.length ? [{ driver: d, label: `#${d} ${meta?.code ?? ""}`.trim(), color: meta?.color ?? "#8A94A6", points: pts }] : [];
  });

  const ref = useMemo(
    () =>
      selectedDriver != null
        ? { driver: selectedDriver, lap: Math.max(1, progress.lap) }
        : bestLap(allLaps),
    [selectedDriver, progress.lap, allLaps],
  );
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
        <h1>
          <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
            <rect width="32" height="32" rx="7.5" fill="var(--panel-2)" />
            <rect x="6.9" y="15.2" width="4.6" height="9.4" rx="1.7" fill="var(--dim)" />
            <rect x="13.7" y="8.4" width="4.6" height="16.2" rx="1.7" fill="var(--amber)" />
            <rect x="20.5" y="12.1" width="4.6" height="12.5" rx="1.7" fill="var(--ink)" />
            <rect x="6.9" y="25.4" width="18.2" height="1.5" rx="0.75" fill="var(--line)" />
          </svg>
          BoxBox Replay
        </h1>
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
              onToggle={(n) => {
                setHighlight((h) => (h.includes(n) ? h.filter((x) => x !== n) : [...h, n]));
                setSelectedDriver((cur) => (cur === n ? null : n));
              }}
            />
            <p className="dim small">
              {sessionLoading ? "Loading this session's timing…" : ""}
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
                {sessionLoading && (
                  <div className="loading-card">
                    <p className="loading-title">Loading {gpName} · {sessName}</p>
                    <p className="dim small">
                      Building the replay from telemetry. The first visit to a session takes about a
                      minute; afterwards it is instant.
                    </p>
                    <div className="loading-bar"><span /></div>
                  </div>
                )}
                {replay.error && <ReplayFailure error={replay.error} onRetry={() => setReplayRetry((n) => n + 1)} />}
                {replay.data && replay.data.positions_end_s < replay.data.duration_s - 10 && (
                  <p className="dim small">
                    Car positions in this feed end at {formatClock(replay.data.positions_end_s)} — after that
                    the map holds each car's last known position. Lap times and gaps keep going.
                  </p>
                )}
                {replay.data && replay.data.drivers_included < replay.data.drivers_expected && (
                  <p className="dim small">
                    Showing {replay.data.drivers_included} of {replay.data.drivers_expected} drivers — the
                    timing feed had no position data for the rest.
                  </p>
                )}
                {replay.data && (
                  <>
                    <div className="map-frame">
                      {geo.error && (
                        <p className="dim small" style={{ padding: "8px 10px" }}>
                          The circuit outline didn't load for this session — cars still replay, but there is
                          no track to draw them on.
                        </p>
                      )}
                      <SessionMap
                        playback={playback}
                        outline={geo.data?.outline ?? []}
                        corners={geo.data?.corners ?? []}
                        zones={geo.data?.zones ?? []}
                        replay={replayMap}
                        angle={geo.data?.angle ?? 0}
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
                        hoverInfo={hoverInfo}
                      />
                    </div>

                    <div className="player">
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

                    <Timeline
                      playback={playback}
                      markers={lapMarkers}
                      onSeek={(t) => playback.setT(t)}
                      coverageEnd={replay.data?.positions_end_s ?? null}
                    />

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
                      <h3>
                        Speed telemetry
                        {focusDrivers.length === 0 && defaultDriver != null && (
                          <span className="dim small"> · leader {driverMeta.get(defaultDriver)?.code ?? `#${defaultDriver}`} (pick a driver in the tower to change)</span>
                        )}
                      </h3>
                      {speedLoading.length > 0 && (
                        <p className="dim small loading-inline">
                          <span className="spinner" aria-hidden="true" />
                          Loading telemetry for{" "}
                          {speedLoading.map((d) => driverMeta.get(d)?.code ?? `#${d}`).join(", ")}…
                        </p>
                      )}
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
              <BattlePanel
                playback={{ state: { t: playT, dur, rev: playback.state.rev } }}
                sessionKey={sessionKey}
                table={gapTable}
                drivers={drivers.data ?? []}
                laps={allLaps}
                onSeek={(t) => playback.setT(t)}
              />
            )}
            {view === "performance" && (
              <PerformancePanel
                sessionKey={sessionKey}
                laps={allLaps}
                highlight={highlight}
                towerOrder={towerRows.map((r) => r.driver)}
                driverCode={(n) => driverMeta.get(n)?.code ?? `#${n}`}
                onSeek={(t) => playback.setT(t)}
                duration={dur}
              />
            )}
            {view === "pit" && sessionKey && (
              <PitPanel
                sessionKey={sessionKey}
                laps={allLaps}
                driver={highlight[0] ?? selectedDriver ?? towerRows[0]?.driver ?? 0}
                driverCode={(n) => driverMeta.get(n)?.code ?? `#${n}`}
                gapBehind={gapBehind}
                onSeek={(t) => playback.setT(t)}
              />
            )}
          </section>

          <section className="engineer">
            <h2>Race engineer</h2>
            {selectedDriver != null ? (
              <DriverCard
                driver={(drivers.data ?? []).find((d) => d.driver_number === selectedDriver)!}
                position={towerRows.findIndex((r) => r.driver === selectedDriver) + 1 || null}
                gap={gapAt(gapTable, selectedDriver, playT)}
                lap={Math.max(1, progress.lap)}
                stint={
                  (stints.data ?? []).find(
                    (s) =>
                      s.driver_number === selectedDriver &&
                      Math.max(1, progress.lap) >= (s.lap_start ?? 1) &&
                      Math.max(1, progress.lap) <= (s.lap_end ?? Number.MAX_SAFE_INTEGER),
                  ) ?? null
                }
                laps={allLaps}
                bestLap={
                  (stints.data ?? []).length
                    ? allLaps
                        .filter((l) => l.driver_number === selectedDriver && l.lap_duration != null)
                        .sort((a, b) => (a.lap_duration as number) - (b.lap_duration as number))[0] ?? null
                    : null
                }
                onClear={() => setSelectedDriver(null)}
              />
            ) : (
              <>
                <p className="session-title">{sessName} · {gpName}</p>
                <p className="dim small">
                  {info.data?.date_start.slice(0, 10)}
                  {info.data ? ` · ${info.data.date_start.slice(11, 16)}–${info.data.date_end.slice(11, 16)} UTC` : ""}
                </p>
                <dl className="facts">
                  <div>
                    <dt>
                      <Info
                        label="Distance"
                        tip="Race distance in laps. The replay clock starts at lights out and runs to the chequered flag."
                      />
                    </dt>
                    <dd>{info.data?.total_laps ?? "—"} laps</dd>
                  </div>
                  <div>
                    <dt><Info label="Drivers" tip="Cars classified in this session." /></dt>
                    <dd>{info.data?.drivers ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>
                      <Info
                        label="Race time"
                        tip="Elapsed time of the race itself (lights out to flag), not the scheduled session window."
                      />
                    </dt>
                    <dd>{info.data ? formatClock(info.data.duration_s) : "—"}</dd>
                  </div>
                  <div>
                    <dt>
                      <Info
                        label="Gaps"
                        tip="Where the tower's gaps come from: live timing intervals when the session has them, otherwise computed from measured lap times. '—' means neither exists."
                      />
                    </dt>
                    <dd>
                      {gaps.data?.source === "lap_times"
                        ? "from lap times"
                        : gaps.data?.source === "intervals"
                          ? "live timing"
                          : "—"}
                    </dd>
                  </div>
                </dl>
                {selectedCorner && (
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
                )}
                <p className="dim small">
                  Click a car on the map for that driver's card, or a corner marker to ask the engineer.
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
