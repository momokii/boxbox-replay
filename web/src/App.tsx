import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import BattlePanel from "./components/BattlePanel";
import DuelPanel from "./components/DuelPanel";
import InputsStrip from "./components/InputsStrip";
import CoachPanel from "./components/CoachPanel";
import GapChart from "./components/GapChart";
import PerformancePanel from "./components/PerformancePanel";
import PitPanel from "./components/PitPanel";
import SessionMap from "./components/SessionMap";
import SpeedChart, { type SpeedSeries } from "./components/SpeedChart";
import Timeline from "./components/Timeline";
import Tower from "./components/Tower";
import DriverCard from "./components/DriverCard";
import Modal from "./components/Modal";
import LapTimesModal from "./components/LapTimesModal";
import DriverDetails from "./components/DriverDetails";
import Info from "./components/Info";
import { formatClock } from "./session";
import { driverLabel, formatLapTime, teamColor } from "./format";
import {
  buildGapTable,
  buildPositionTable,
  gapAt,
  indexAt,
  lapAt,
  positionAt,
  type GapTable,
} from "./session";
import { createPlayback, useThrottledTick } from "./playbackStore";
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

function useAsync<T>(key: string, fn: () => Promise<T>): {
  data: T | null;
  error: string | null;
  /** Key the current data belongs to; null while a new key is loading. */
  key: string | null;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    let live = true;
    // Clearing on key change is deliberate: showing the previous session's
    // data while a new one loads is exactly the "no context" bug we fixed.
    setData(null);
    setError(null);
    setLoadedKey(null);
    ref
      .current()
      .then((d) => {
        if (!live) return;
        setData(d);
        setLoadedKey(key);
      })
      .catch((e) => live && setError(String(e)));
    return () => {
      live = false;
    };
  }, [key]);
  return { data, error, key: loadedKey };
}

function ReplayFailure(p: { error: string; onRetry: () => void }) {
  const missing = p.error.includes("404");
  const needsKey = p.error.includes("503") || p.error.includes("401");
  return (
    <div className="empty">
      {needsKey ? (
        <>
          <p>The timing feed now asks for credentials, so this session can't be fetched.</p>
          <p className="dim small">
            Add <code>OPENF1_API_KEY</code> to <code>.env</code> and restart the stack. Sessions
            already downloaded keep playing without a key.
          </p>
        </>
      ) : missing ? (
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
  const tRaw = q.get("t");
  const t = tRaw && /^\d+(\.\d+)?$/.test(tRaw) ? Number(tRaw) : undefined;
  return { year: num("year"), meeting: num("meeting"), session: num("session"), t };
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
  const [view, setView] = useState<"replay" | "battle" | "duel" | "performance" | "pit">("replay");
  const [showLaps, setShowLaps] = useState(false);
  const [lapsModal, setLapsModal] = useState(false);
  const [driverDetail, setDriverDetail] = useState<"stints" | "laps" | "overtakes" | "pits" | null>(null);
  const year = yearSel ?? years.data?.[years.data.length - 1] ?? null;

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
  const [pausedAt, setPausedAt] = useState(0);
  const [linkCopied, setLinkCopied] = useState(false);
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
  const pit = useAsync(`pit:${sessionKey ?? "none"}`, () =>
    sessionKey ? api.sessionPit(sessionKey) : Promise.resolve({ summary: [], stops: [] }),
  );
  const positions = useAsync(`positions:${sessionKey ?? "none"}`, () =>
    sessionKey ? api.sessionPositions(sessionKey) : Promise.resolve([]),
  );
  const overtakes = useAsync(`overtakes:${sessionKey ?? "none"}`, () =>
    sessionKey ? api.sessionOvertakes(sessionKey) : Promise.resolve({ counts: [], events: [] }),
  );
  const result = useAsync(`result:${sessionKey ?? "none"}`, () =>
    sessionKey ? api.sessionResult(sessionKey) : Promise.resolve([]),
  );
  const allLaps = useMemo(() => laps.data ?? [], [laps.data]);

  const playbackRef = useRef(createPlayback());
  const playback = playbackRef.current;
  // Capped re-render rate: the map/timeline subscribe at full frame rate on
  // their own; the page around them only needs ~8 updates a second.
  useThrottledTick(playback, 120);
  const { t: playT, dur, playing, speed, calm } = playback.state;

  // Respect the OS "reduce motion" preference on first load.
  const calmInitialised = useRef(false);
  useEffect(() => {
    if (calmInitialised.current) return;
    calmInitialised.current = true;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) playback.setCalm(true);
  }, [playback]);

  /** Absolute URL for the current frame — built from state, not from location. */
  const momentUrl = () => {
    const q = new URLSearchParams();
    if (year) q.set("year", String(year));
    if (meetingKey) q.set("meeting", String(meetingKey));
    if (sessionKey) q.set("session", String(sessionKey));
    q.set("t", playT.toFixed(1));
    return `${window.location.origin}${window.location.pathname}?${q.toString()}`;
  };

  const restoredMoment = useRef(false);
  useEffect(() => {
    const q = new URLSearchParams();
    if (year) q.set("year", String(year));
    if (meetingKey) q.set("meeting", String(meetingKey));
    if (sessionKey) q.set("session", String(sessionKey));
    // Only carry a moment in the URL when paused on a real position, so the
    // link always reproduces the frame that was copied.
    if (!playbackRef.current.state.playing && playbackRef.current.state.t > 0.5) {
      q.set("t", playbackRef.current.state.t.toFixed(1));
    }
    window.history.replaceState(null, "", `${window.location.pathname}?${q.toString()}`);
  }, [year, meetingKey, sessionKey, pausedAt]);

  useEffect(() => {
    if (restoredMoment.current || params.t == null || !replay.data) return;
    restoredMoment.current = true;
    const moment = Math.min(params.t, replay.data.duration_s);
    // The duration must be set before seeking, otherwise the seek clamps to 0.
    playbackRef.current.setDur(replay.data.duration_s);
    playbackRef.current.setT(moment);
    setPausedAt(moment);
  }, [params.t, replay.data]);



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
    const m = new Map<number, { code: string; color: string; label: string }>();
    for (const d of drivers.data ?? []) {
      m.set(d.driver_number, {
        code: d.name_acronym,
        color: teamColor(d.team_colour),
        label: driverLabel(d.name_acronym, d.full_name),
      });
    }
    return m;
  }, [drivers.data]);

  const driverMetaLabel = (n: number) => driverMeta.get(n)?.label ?? `#${n}`;

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

  const positionTable = useMemo(
    () => buildPositionTable(positions.data ?? []),
    [positions.data],
  );

  const statusByDriver = useMemo(() => {
    const m = new Map<number, "DNF" | "DNS" | "DSQ" | "OUT">();
    for (const r of result.data ?? []) {
      if (r.dnf) m.set(r.driver_number, "DNF");
      else if (r.dns) m.set(r.driver_number, "DNS");
      else if (r.dsq) m.set(r.driver_number, "DSQ");
    }
    // Without a result feed, a car that stopped setting laps is out of the race.
    // Evidence: its last recorded lap is far behind the replay clock.
    if (replay.data) {
      const startMs = Date.parse(replay.data.start);
      const lastT = new Map<number, number>();
      for (const l of allLaps) {
        if (!l.date_start) continue;
        const ms = Date.parse(l.date_start);
        if (Number.isNaN(ms)) continue;
        const t = (ms - startMs) / 1000;
        if (t >= 0 && t > (lastT.get(l.driver_number) ?? -1)) lastT.set(l.driver_number, t);
      }
      // Only for drivers the result feed did not classify: a car with no fresh
      // laps is out, which is evidence, not a guess.
      for (const [driver, t] of lastT) {
        if (!m.has(driver) && playT - t > 180) m.set(driver, "OUT");
      }
    }
    return m;
  }, [result.data, replay.data, allLaps, playT]);

  const towerRows = useMemo(() => {
    const rows = (drivers.data ?? []).map((d) => ({
      driver: d.driver_number,
      code: d.name_acronym,
      color: teamColor(d.team_colour),
      gap: gapAt(gapTable, d.driver_number, playT),
      position: positionAt(positionTable, d.driver_number, playT),
      highlighted: highlight.includes(d.driver_number),
      selected: selectedDriver === d.driver_number,
      status: statusByDriver.get(d.driver_number) ?? null,
    }));
    // Classification order is what the tower shows, and the gaps we display are
    // classification gaps — so order by gap. The official position feed is used
    // only to break ties when a driver has no gap (e.g. intervals missing).
    rows.sort((a, b) => {
      // Retired / disqualified cars are classified last, never by stale gaps.
      if (!!a.status !== !!b.status) return a.status ? 1 : -1;
      if (a.status && b.status) return a.driver - b.driver;
      if (a.gap != null && b.gap != null) return a.gap - b.gap;
      if (a.gap != null) return -1;
      if (b.gap != null) return 1;
      if (a.position != null && b.position != null) return a.position - b.position;
      if (a.position != null) return -1;
      if (b.position != null) return 1;
      return a.driver - b.driver;
    });
    return rows;
  }, [drivers.data, gapTable, positionTable, statusByDriver, playT, highlight, selectedDriver]);

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
        <button
          className="theme-toggle"
          onClick={toggle}
          aria-label={theme === "night" ? "Switch to light theme" : "Switch to dark theme"}
          title={theme === "night" ? "Light theme" : "Dark theme"}
        >
          {theme === "night" ? (
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
              <circle cx="12" cy="12" r="4.2" fill="currentColor" />
              <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2" />
                <path d="M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4L17 7M7 17l-1.6 1.6" />
              </g>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
              <path
                d="M20 14.6A8.4 8.4 0 0 1 9.4 4a8.4 8.4 0 1 0 10.6 10.6z"
                fill="currentColor"
              />
            </svg>
          )}
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
              {(["replay", "battle", "duel", "performance", "pit"] as const).map((v) => (
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
                      <label className="dim small row" title="Stops auto-advance so you can scrub frame by frame">
                        <input
                          type="checkbox"
                          checked={calm}
                          onChange={(e) => playback.setCalm(e.target.checked)}
                        />
                        <span className="hide-sm">
                          <Info
                            label="Reduce motion"
                            tip="Pauses automatic playback and keeps the playhead still until you scrub. It starts switched on if your system asks for reduced motion. Keyboard: Space still toggles play."
                          />
                        </span>
                        <span className="show-sm">Reduce</span>
                      </label>
                      <button
                        className="ghost small"
                        onClick={() => {
                          const url = momentUrl();
                          setPausedAt(playT);
                          window.history.replaceState(null, "", url);
                          const done = () => {
                            setLinkCopied(true);
                            window.setTimeout(() => setLinkCopied(false), 1600);
                          };
                          navigator.clipboard?.writeText(url).then(done).catch(() => {
                            // Clipboard blocked (http, permissions): show it instead of pretending.
                            window.prompt("Copy this link", url);
                          });
                        }}
                        disabled={playT < 0.5}
                        title="Copy a link that reopens the replay at this exact moment"
                      >
                        {linkCopied ? "Copied" : "Copy link"}
                      </button>
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
                      {sessionKey && series.length > 0 && progress.lap > 0 && lapEndT > lapStartT && (
                        <InputsStrip
                          sessionKey={sessionKey}
                          entries={series.map((s) => ({
                            driver: s.driver,
                            code: s.label,
                            color: s.color,
                          }))}
                          playback={playback}
                          windowStart={lapStartT}
                          windowEnd={lapEndT}
                          lapLabel={`LAP ${Math.max(1, progress.lap)}`}
                        />
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
                overtakes={overtakes.data?.events ?? []}
                codes={new Map((drivers.data ?? []).map((d) => [d.driver_number, d.name_acronym]))}
                labels={new Map((drivers.data ?? []).map((d) => [d.driver_number, driverMetaLabel(d.driver_number)]))}
                colors={new Map(towerRows.map((r) => [r.driver, r.color]))}
              />
            )}
            {view === "duel" && sessionKey && (
              <DuelPanel
                sessionKey={sessionKey}
                lapsSession={laps.key === `laps:${sessionKey ?? "none"}` ? sessionKey : null}
                drivers={drivers.data ?? []}
                laps={allLaps}
                colors={new Map(towerRows.map((r) => [r.driver, r.color]))}
                geometry={geo.data ?? null}
                theme={theme}
                preferred={
                  highlight.length
                    ? highlight
                    : selectedDriver != null
                      ? [selectedDriver]
                      : []
                }
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
                pitSummary={pit.data?.summary ?? []}
                overtakeCounts={overtakes.data?.counts ?? []}
                playback={playback}
                totalLaps={info.data?.total_laps ?? 0}
                colors={new Map(towerRows.map((r) => [r.driver, r.color]))}
              />
            )}
            {view === "pit" && sessionKey && (
              <PitPanel
                sessionKey={sessionKey}
                laps={allLaps}
                stints={stints.data ?? []}
                driver={highlight[0] ?? selectedDriver ?? towerRows[0]?.driver ?? 0}
                driverCode={(n) => driverMeta.get(n)?.code ?? `#${n}`}
                gapBehind={gapBehind}
                lap={Math.max(1, progress.lap)}
                onSeek={(t) => playback.setT(t)}
                pitStops={
                  (pit.data?.summary ?? []).find(
                    (s) => s.driver_number === (highlight[0] ?? selectedDriver ?? 0),
                  ) ?? null
                }
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
                pit={
                  (pit.data?.summary ?? []).find((s) => s.driver_number === selectedDriver) ?? null
                }
                overtakes={
                  (overtakes.data?.counts ?? []).find((o) => o.driver_number === selectedDriver) ?? null
                }
                result={
                  (result.data ?? []).find((r) => r.driver_number === selectedDriver) ?? null
                }
                onOpen={(kind) => setDriverDetail(kind)}
              />
            ) : (
              <>
                <p className="session-title">{sessName} · {gpName}</p>
                <p className="dim small">
                  {info.data?.date_start.slice(0, 10)}
                  {info.data ? ` · ${info.data.date_start.slice(11, 16)}–${info.data.date_end.slice(11, 16)} UTC` : ""}
                </p>
                {(result.data ?? []).length > 0 && (
                  <p className="small" style={{ marginTop: 0 }}>
                    <Info
                      label="Final result"
                      tip="Official classification from the session result feed: position, points and gap to the winner."
                    />{" "}
                    {(result.data ?? [])
                      .filter((r) => r.position != null)
                      .slice(0, 3)
                      .map((r) => `P${r.position} ${driverMeta.get(r.driver_number)?.code ?? `#${r.driver_number}`}`)
                      .join(" · ")}
                  </p>
                )}
                <dl className="facts">
                  <div>
                    <dt>
                      <Info
                        label="Distance"
                        tip="Race distance in laps. The replay clock starts at lights out and runs to the chequered flag."
                      />
                    </dt>
                    <dd>{info.data?.total_laps ? `${info.data.total_laps} laps` : "—"}</dd>
                  </div>
                  <div>
                    <dt><Info label="Drivers" tip="Cars classified in this session." /></dt>
                    <dd>{info.data?.drivers ? info.data.drivers : "—"}</dd>
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

      {selectedDriver != null && (
        <DriverDetails
          kind={driverDetail}
          onClose={() => setDriverDetail(null)}
          driver={(drivers.data ?? []).find((d) => d.driver_number === selectedDriver)!}
          label={driverMetaLabel(selectedDriver)}
          lap={Math.max(1, progress.lap)}
          laps={allLaps}
          stints={stints.data ?? []}
          overtakeEvents={overtakes.data?.events ?? []}
          overtakeCounts={
            (overtakes.data?.counts ?? []).find((o) => o.driver_number === selectedDriver) ?? null
          }
          pitStops={pit.data?.stops ?? []}
          pitSummary={(pit.data?.summary ?? []).find((s) => s.driver_number === selectedDriver) ?? null}
          color={driverMeta.get(selectedDriver)?.color ?? "#8A94A6"}
          colors={new Map(towerRows.map((r) => [r.driver, r.color]))}
          playback={playback}
          totalLaps={info.data?.total_laps ?? 0}
          onSeek={(t) => {
            playback.setT(t);
            setDriverDetail(null);
          }}
          codes={new Map((drivers.data ?? []).map((d) => [d.driver_number, d.name_acronym]))}
        />
      )}

      <Modal
        open={lapsModal}
        onClose={() => setLapsModal(false)}
        title="Lap times"
        subtitle={`${gpName}${sessName ? ` · ${sessName}` : ""} · every timed lap`}
        size="wide"
      >
        <LapTimesModal
          laps={tableRows}
          drivers={drivers.data ?? []}
          totalLaps={info.data?.total_laps ?? 0}
          colors={new Map(towerRows.map((r) => [r.driver, r.color]))}
          playback={playback}
        />
      </Modal>

      {sessionKey && !sessionBlocked && (
        <section className="laps-section">
          <div className="row">
            <button className="disclosure" onClick={() => setShowLaps((v) => !v)} aria-expanded={showLaps}>
              {showLaps ? "Hide lap times" : `Show lap times (${tableRows.length})`}
            </button>
            <button className="disclosure" onClick={() => setLapsModal(true)}>
              Full view
            </button>
            {showLaps && (
              <span className="dim small">
                {highlight.length ? `${highlight.length} driver${highlight.length > 1 ? "s" : ""} filtered` : "All drivers"}
              </span>
            )}
          </div>

          {showLaps && (
            <div className="chips" role="group" aria-label="Filter lap table by driver" style={{ margin: "8px 0" }}>
              <button className={highlight.length === 0 ? "chip on" : "chip"} onClick={() => setHighlight([])}>
                All drivers
              </button>
              {(drivers.data ?? []).map((d: Driver) => {
                const on = highlight.includes(d.driver_number);
                return (
                  <button
                    key={d.driver_number}
                    className={on ? "chip on" : "chip"}
                    aria-pressed={on}
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
          )}
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
                        <td>{driverMetaLabel(l.driver_number)}</td>
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

        </section>
      )}
    </>
  );
}
