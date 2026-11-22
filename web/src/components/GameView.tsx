import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api";
import type { Geometry, Meeting, SessionInfo, StandingsPayload } from "../types";
import {
  GAME_MODEL,
  lapFraction,
  buildGameDrivers,
  type GameDriver,
  type GameLaps,
  type QualiRow,
  type RaceSim,
  raceState,
  simulateQualifying,
  simulateRace,
  validatePlayerDrivers,
} from "../game";
import "./game.css";

interface Props {
  onClose: () => void;
}

type Phase = "setup" | "qualifying" | "grid" | "race" | "result";

function yearLabel(year: number, latest: number | null): string {
  return year === latest ? "Current standings" : "Final standings";
}

function seedNow(): number {
  const values = new Uint32Array(1);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(values);
    return values[0] || 1;
  }
  return Math.floor(Math.random() * 0xffffffff) || 1;
}

function errorMessage(e: unknown): string {
  if (e instanceof Error && e.message.includes("404")) {
    return "That circuit has no geometry in the timing feed. Pick another race.";
  }
  return "The public feed did not answer. Retry in a moment.";
}

function driverById(drivers: GameDriver[], id: string | null): GameDriver | null {
  return id ? drivers.find((d) => d.id === id) ?? null : null;
}

export default function GameView({ onClose }: Props) {
  const [years, setYears] = useState<number[]>([]);
  const [year, setYear] = useState<number | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [meetingKey, setMeetingKey] = useState<number | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [standings, setStandings] = useState<StandingsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [laps, setLaps] = useState<GameLaps>(5);
  const [playerCount, setPlayerCount] = useState(1);
  const [players, setPlayers] = useState<(string | null)[]>([null]);
  const [active, setActive] = useState(0);
  const [quali, setQuali] = useState(true);
  const [phase, setPhase] = useState<Phase>("setup");
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [grid, setGrid] = useState<QualiRow[]>([]);
  const [sim, setSim] = useState<RaceSim | null>(null);
  const [seed, setSeed] = useState(seedNow);
  const [seedText, setSeedText] = useState("");
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const view = document.querySelector<HTMLElement>(".game-view");
    if (view) view.scrollTop = 0;
  }, [phase]);

  useEffect(() => {
    api
      .years()
      .then((values) => {
        if (!mounted.current) return;
        setYears(values);
        setYear(values[values.length - 1] ?? null);
      })
      .catch(() => mounted.current && setMessage("The season list did not load."));
  }, []);

  const latestYear = years.length ? years[years.length - 1] : null;

  useEffect(() => {
    if (!year) return;
    let live = true;
    setLoading(true);
    setStandings(null);
    setMeetings([]);
    setSessions([]);
    setGeometry(null);
    setSim(null);
    setGrid([]);
    setMessage(null);
    Promise.all([api.standings(year), api.meetings(year)])
      .then(([table, calendar]) => {
        if (!live) return;
        setStandings(table);
        const races = calendar.filter(
          (m) => m.meeting_name.includes("Grand Prix") && Date.parse(m.date_start) <= Date.now() + 86400000,
        );
        setMeetings(races);
        // Preserve an explicit selection if it is still valid; a late
        // calendar response must never silently jump back to round 1.
        setMeetingKey((current) =>
          current != null && races.some((m) => m.meeting_key === current)
            ? current
            : races[0]?.meeting_key ?? null,
        );
      })
      .catch(() => live && setMessage("The season table or calendar did not load."))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [year]);

  const gameDrivers = useMemo(
    () => (standings ? buildGameDrivers(standings) : []),
    [standings],
  );

  useEffect(() => {
    if (!year || !meetingKey) return;
    let live = true;
    setLoadingSessions(true);
    setSessions([]);
    setGeometry(null);
    setSim(null);
    setGrid([]);
    setMessage(null);
    api
      .sessions(year, meetingKey)
      .then((list) => live && setSessions(list))
      .catch(() => live && setMessage("The session list did not load."))
      .finally(() => live && setLoadingSessions(false));
    return () => {
      live = false;
    };
  }, [year, meetingKey]);

  const raceSession = useMemo(
    () => sessions.find((s) => s.session_name === "Race") ?? null,
    [sessions],
  );
  const selectedMeeting = meetings.find((m) => m.meeting_key === meetingKey) ?? null;

  useEffect(() => {
    setPlayers((current) => {
      const next = Array.from({ length: playerCount }, (_, i) => current[i] ?? null);
      return next;
    });
    setActive((current) => Math.min(current, playerCount - 1));
  }, [playerCount]);

  const duplicateError = validatePlayerDrivers(
    players.filter((id): id is string => id != null),
  );

  const pick = (id: string) => {
    const owner = players.indexOf(id);
    if (owner >= 0) {
      setActive(owner);
      return;
    }
    setPlayers((current) => {
      const next = [...current];
      next[active] = id;
      return next;
    });
    const nextEmpty = players.findIndex((value, index) => index !== active && value == null);
    if (nextEmpty >= 0) setActive(nextEmpty);
    else setActive((active + 1) % playerCount);
  };

  const clearSlot = (index: number) => {
    setPlayers((current) => current.map((id, i) => (i === index ? null : id)));
    setActive(index);
  };

  const begin = async () => {
    if (!raceSession || !year) return;
    const err = validatePlayerDrivers(players.filter((id): id is string => id != null)) ?? null;
    if (err) {
      setMessage(err);
      return;
    }
    setPreparing(true);
    setMessage(null);
    try {
      const geo = await api.sessionGeometry(raceSession.session_key);
      if (!mounted.current) return;
      const parsedSeed = Number(seedText.trim());
      const nextSeed =
        /^\d+$/.test(seedText.trim()) && Number.isSafeInteger(parsedSeed) ? parsedSeed : seedNow();
      const nextGrid = simulateQualifying(gameDrivers, nextSeed);
      const nextSim = simulateRace(
        gameDrivers,
        nextGrid,
        laps,
        nextSeed,
        players.filter((id): id is string => id != null),
      );
      setGeometry(geo);
      setSeed(nextSeed);
      setGrid(nextGrid);
      setSim(nextSim);
      setPhase(quali ? "qualifying" : "grid");
    } catch (e) {
      if (mounted.current) setMessage(errorMessage(e));
    } finally {
      if (mounted.current) setPreparing(false);
    }
  };

  const raceAgain = () => {
    if (!geometry || !gameDrivers.length) return;
    const nextSeed = seedNow();
    const nextGrid = simulateQualifying(gameDrivers, nextSeed);
    const nextSim = simulateRace(
      gameDrivers,
      nextGrid,
      laps,
      nextSeed,
      players.filter((id): id is string => id != null),
    );
    setSeed(nextSeed);
    setGrid(nextGrid);
    setSim(nextSim);
    setPhase("race");
  };

  const newSetup = () => {
    setPhase("setup");
    setSim(null);
    setGrid([]);
    setGeometry(null);
    setMessage(null);
  };

  const standingsLabel = year ? yearLabel(year, latestYear) : "";
  const noDrivers = !gameDrivers.length;
  const startDisabled =
    loading || loadingSessions || preparing || !raceSession || noDrivers || players.some((id) => !id) || duplicateError != null;
  const playerLabels = new Map(players.filter((id): id is string => id != null).map((id, i) => [id, i + 1]));

  const body = (
    <div className="game-view" role="dialog" aria-modal="true" aria-label="BoxBox Grid">
      <div className="game-shell">
        <header className="game-head">
          <div>
            <p className="game-kicker">BoxBox Grid · local race room</p>
            <h1>Set the grid. Run the weekend.</h1>
            <p className="game-lede">
              Real season standings, real circuit shape, one screen. One driver per person;
              everyone else is AI.
            </p>
          </div>
          <button type="button" className="game-close" onClick={onClose} aria-label="Close BoxBox Grid">
            ✕
          </button>
        </header>

        {message && <p className="game-message" role="status">{message}</p>}

        {phase === "setup" && (
          <>
            <section className="game-setup" aria-label="Race setup">
              <label>
                Season
                <select
                  value={year ?? ""}
                  onChange={(e) => {
                    setYear(Number(e.target.value));
                    setPlayers(Array.from({ length: playerCount }, () => null));
                    setActive(0);
                  }}
                >
                  {years.map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                Grand Prix
                <select
                  value={meetingKey ?? ""}
                  onChange={(e) => setMeetingKey(Number(e.target.value))}
                  disabled={!meetings.length}
                >
                  {meetings.map((meeting) => (
                    <option key={meeting.meeting_key} value={meeting.meeting_key}>
                      {meeting.meeting_name} · {meeting.date_start.slice(0, 10)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Laps
                <select value={laps} onChange={(e) => setLaps(Number(e.target.value) as GameLaps)}>
                  <option value={3}>3 laps</option>
                  <option value={5}>5 laps</option>
                  <option value={10}>10 laps</option>
                </select>
              </label>
              <label>
                Players
                <select value={playerCount} onChange={(e) => setPlayerCount(Number(e.target.value))}>
                  <option value={1}>1 player</option>
                  <option value={2}>2 players</option>
                  <option value={3}>3 players</option>
                  <option value={4}>4 players</option>
                </select>
              </label>
              <div className="game-quali-choice" role="group" aria-label="Qualifying">
                <span>Qualifying</span>
                <div className="game-choice-buttons">
                  <button type="button" aria-pressed={quali} onClick={() => setQuali(true)}>Run</button>
                  <button type="button" aria-pressed={!quali} onClick={() => setQuali(false)}>Skip</button>
                </div>
                <small>{quali ? "A live flying-lap session sets the grid." : "The same seeded grid is set without the session."}</small>
              </div>
            </section>

            <div className="game-source">
              <span>{year ? `${year} · ${standingsLabel}` : "Choose a season"}</span>
              <span>{selectedMeeting ? selectedMeeting.location : "No circuit selected"}</span>
              <span>{raceSession ? `Race · ${raceSession.date_start.slice(0, 10)}` : "No race session yet"}</span>
              {standings && <span>{standings.source} · {standings.license}</span>}
            </div>

            <section className="game-how" aria-label="How BoxBox Grid works">
              <div>
                <p className="game-kicker">How it works</p>
                <h2>A real race weekend, turned into a local game.</h2>
                <ol className="game-how-steps">
                  <li><b>Pick the weekend.</b> A 2023–2026 season and a real Grand Prix. Completed seasons use final Jolpica standings; the latest uses the current table.</li>
                  <li><b>Draft the drivers.</b> 1–4 people, one driver each, no duplicates. The rest of the field is AI.</li>
                  <li><b>Qualify or skip.</b> A visible single-lap session sets the grid; skipping uses the same seeded model, not a different random grid.</li>
                  <li><b>Race 3, 5 or 10 laps.</b> Seeded incidents can interrupt. Click a car for live pace, gap and race mode.</li>
                </ol>
              </div>
              <aside className="game-how-model">
                <p className="game-kicker">The calculation</p>
                <dl>
                  <div><dt>Driver form</dt><dd>58% points + 42% championship position</dd></div>
                  <div><dt>Team form</dt><dd>constructor points / field maximum</dd></div>
                  <div><dt>Overall</dt><dd>64% driver form + 36% team form</dd></div>
                  <div><dt>Race</dt><dd>seeded lap pace + SC / VSC / crash events</dd></div>
                </dl>
                <p>This is a game model, not a prediction. Grid pace is not a km/h feed.</p>
              </aside>
            </section>

            {!quali && (
              <p className="game-note">
                Qualifying is skipped on screen, but it is still simulated from the same stats and seed; the grid is not uniform random.
              </p>
            )}

            <div className="game-board">
              <section className="game-roster" aria-label="Driver roster">
                <header>
                  <div>
                    <h2>Pick a driver</h2>
                    <p className="dim small">Overall = {GAME_MODEL}</p>
                  </div>
                  <span className="game-round">{standings?.round != null ? `R${standings.round}` : "Season table"}</span>
                </header>
                {loading && <p className="dim small">Loading the table…</p>}
                {!loading && noDrivers && <p className="dim small">No drivers in this standings table.</p>}
                <div className="game-scroll">
                  <table className="laps game-table">
                    <thead>
                      <tr>
                        <th>OVR</th>
                        <th>Driver</th>
                        <th>Team</th>
                        <th>Pts</th>
                        <th><span className="sr-only">Pick</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {gameDrivers.map((driver) => {
                        const owner = players.indexOf(driver.id);
                        const isActive = players[active] === driver.id;
                        return (
                          <tr key={driver.id} className={isActive ? "on" : owner >= 0 ? "picked" : ""}>
                            <td className="mono">{Math.round(driver.overall * 100)}</td>
                            <td>
                              <span className="game-dot" style={{ background: driver.color }} />
                              {driver.code} <span className="dim small">{driver.name}</span>
                            </td>
                            <td className="dim">{driver.team}</td>
                            <td className="mono">{driver.points.toFixed(1)}</td>
                            <td>
                              {owner >= 0 ? (
                                <button type="button" className="game-pill" onClick={() => setActive(owner)}>
                                  P{owner + 1} {isActive ? "· editing" : ""}
                                </button>
                              ) : (
                                <button type="button" className="game-pill" onClick={() => pick(driver.id)}>
                                  Pick
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="game-lineup" aria-label="Player line-up">
                <h2>Line-up</h2>
                <p className="dim small">Click a slot, then pick one driver. Duplicate drivers are disabled.</p>
                <div className="game-slots">
                  {players.map((id, index) => {
                    const driver = driverById(gameDrivers, id);
                    return (
                      <div key={index} className={active === index ? "game-slot active" : "game-slot"}>
                        <button type="button" className="game-slot-main" onClick={() => setActive(index)}>
                          <span className="game-player">P{index + 1}</span>
                          <span>
                            <b style={{ color: driver?.color }}>{driver ? driver.code : "Pick driver"}</b>
                            <small>{driver ? driver.team : "open seat"}</small>
                          </span>
                        </button>
                        {driver && (
                          <button type="button" className="game-clear" onClick={() => clearSlot(index)} aria-label={`Clear P${index + 1} driver`}>
                            ✕
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="game-model">
                  <b>Model</b>
                  <span>{GAME_MODEL}</span>
                </div>
                <label className="game-seed">
                  Seed (optional)
                  <input
                    value={seedText}
                    onChange={(e) => setSeedText(e.target.value)}
                    inputMode="numeric"
                    maxLength={12}
                    placeholder="random"
                    aria-label="Seed for reproducible qualifying and race events"
                  />
                </label>
                <button type="button" className="primary game-start" disabled={startDisabled} onClick={begin}>
                  {preparing ? "Building circuit…" : quali ? "Run qualifying →" : "Set the seeded grid →"}
                </button>
                {preparing && (
                  <p className="dim small" role="status">
                    Loading the real circuit geometry. A cold circuit may wait on the free OpenF1 rate limit.
                  </p>
                )}
                {duplicateError && players.some((id) => id) && <p className="small warn">{duplicateError}</p>}
                {!raceSession && !loadingSessions && <p className="small warn">This Grand Prix has no race session in the feed.</p>}
              </section>
            </div>
          </>
        )}

        {phase === "qualifying" && sim && geometry && (
          <GameQuali
            grid={grid}
            players={playerLabels}
            drivers={gameDrivers}
            meeting={selectedMeeting}
            seed={seed}
            onBack={() => setPhase("setup")}
            onContinue={() => setPhase("grid")}
          />
        )}

        {phase === "grid" && sim && geometry && (
          <GameGrid
            sim={sim}
            grid={grid}
            players={playerLabels}
            drivers={gameDrivers}
            seed={seed}
            quali={quali}
            meeting={selectedMeeting}
            onBack={() => setPhase("setup")}
            onStart={() => setPhase("race")}
          />
        )}

        {phase === "race" && sim && geometry && (
          <GameRace
            sim={sim}
            seed={seed}
            geometry={geometry}
            players={playerLabels}
            drivers={gameDrivers}
            meeting={selectedMeeting}
            onFinish={() => setPhase("result")}
            onNew={newSetup}
          />
        )}

        {phase === "result" && sim && geometry && (
          <GameResult
            sim={sim}
            players={playerLabels}
            drivers={gameDrivers}
            onAgain={raceAgain}
            onNew={newSetup}
          />
        )}
      </div>
    </div>
  );

  return createPortal(body, document.body);
}

function GameQuali(p: {
  grid: QualiRow[];
  players: Map<string, number>;
  drivers: GameDriver[];
  meeting: Meeting | null;
  seed: number;
  onBack: () => void;
  onContinue: () => void;
}) {
  const pole = p.grid[0];
  const poleDriver = p.drivers.find((d) => d.id === pole?.driverId);
  const [shown, setShown] = useState(0);
  const complete = shown >= p.grid.length;

  useEffect(() => {
    setShown(0);
    const timer = window.setInterval(() => {
      setShown((current) => Math.min(p.grid.length, current + 1));
    }, 70);
    return () => window.clearInterval(timer);
  }, [p.grid]);

  return (
    <section className="game-stage" aria-label="Qualifying session">
      <header className="game-stage-head">
        <div>
          <p className="game-kicker">{p.meeting?.meeting_name ?? "Race"} · Qualifying</p>
          <h2>One flying lap. The order is set.</h2>
          <p className="dim small">
            {complete ? `Pole ${poleDriver?.code ?? "—"}` : "Flying laps in progress"} · seed {p.seed} · simulated from the season table
          </p>
        </div>
        <button type="button" className="game-pill" onClick={p.onBack}>Back to setup</button>
      </header>
      <div className="game-quali-summary" role="status">
        <div className="game-quali-main">
          <span className="game-kicker">{complete ? "Session complete" : `Live session · ${shown}/${p.grid.length} laps`}</span>
          <strong>{complete ? (poleDriver ? `${poleDriver.name} on pole` : "Qualifying complete") : "Reading the flying laps…"}</strong>
          <div className="game-quali-progress" aria-hidden="true"><i style={{ width: `${p.grid.length ? (shown / p.grid.length) * 100 : 0}%` }} /></div>
          <span className="dim small">Single flying lap · no Q1/Q2/Q3 split in v1</span>
        </div>
        <dl className="game-quali-facts">
          <div><dt>Pole</dt><dd>{poleDriver?.code ?? "—"}</dd></div>
          <div><dt>Pole lap</dt><dd>{pole ? fmtLap(pole.time) : "—"}</dd></div>
          <div><dt>Player</dt><dd>{pole && p.players.get(pole.driverId) ? `P${p.players.get(pole.driverId)}` : "AI"}</dd></div>
          <div><dt>Field</dt><dd>{p.grid.length}</dd></div>
        </dl>
      </div>
      <div className="game-grid-table">
        <table className="laps game-table">
          <thead><tr><th>Pos</th><th>Driver</th><th>Team</th><th>Lap time</th><th>Gap</th><th>Player</th></tr></thead>
          <tbody>
            {p.grid.slice(0, shown).map((row) => {
              const driver = p.drivers.find((d) => d.id === row.driverId);
              const best = pole?.time ?? row.time;
              return (
                <tr key={row.driverId} className={p.players.get(row.driverId) ? "on" : ""}>
                  <td className="mono">{row.position}</td>
                  <td><span className="game-dot" style={{ background: driver?.color }} />{driver?.code} <span className="dim small">{driver?.name}</span></td>
                  <td className="dim">{driver?.team}</td>
                  <td className="mono">{fmtLap(row.time)}</td>
                  <td className="mono">{row.position === 1 ? "—" : `+${(row.time - best).toFixed(3)}`}</td>
                  <td>{p.players.get(row.driverId) ? <span className="game-player">P{p.players.get(row.driverId)}</span> : <span className="dim">AI</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="game-actions">
        <button type="button" className="primary" onClick={p.onContinue} disabled={!complete}>Continue to grid →</button>
        <p className="dim small">The same seeded times are used by the race; skipping qualifying does not randomise a different grid.</p>
      </div>
    </section>
  );
}

function fmtLap(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(2).padStart(5, "0");
  return `${m}:${s}`;
}

function GameGrid(p: {
  sim: RaceSim;
  grid: QualiRow[];
  players: Map<string, number>;
  drivers: GameDriver[];
  seed: number;
  quali: boolean;
  meeting: Meeting | null;
  onBack: () => void;
  onStart: () => void;
}) {
  return (
    <section className="game-stage" aria-label="Qualifying grid">
      <header className="game-stage-head">
        <div>
          <p className="game-kicker">{p.meeting?.meeting_name ?? "Race"} · {p.quali ? "Qualifying" : "Grid"}</p>
          <h2>{p.quali ? "The grid is set." : "Qualifying skipped. The grid is still modelled."}</h2>
          <p className="dim small">Seed {p.seed} · {GAME_MODEL}</p>
        </div>
        <button type="button" className="game-pill" onClick={p.onBack}>Back to setup</button>
      </header>
      <div className="game-grid-table">
        <table className="laps game-table">
          <thead><tr><th>Grid</th><th>Driver</th><th>Team</th><th>Gap</th><th>Player</th></tr></thead>
          <tbody>
            {p.grid.map((row) => {
              const driver = p.drivers.find((d) => d.id === row.driverId);
              const best = p.grid[0]?.time ?? row.time;
              return (
                <tr key={row.driverId}>
                  <td className="mono">{row.position}</td>
                  <td><span className="game-dot" style={{ background: driver?.color }} />{driver?.code}</td>
                  <td className="dim">{driver?.team}</td>
                  <td className="mono">{row.position === 1 ? "—" : `+${(row.time - best).toFixed(3)}`}</td>
                  <td>{p.players.get(row.driverId) ? <span className="game-player">P{p.players.get(row.driverId)}</span> : <span className="dim">AI</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="game-actions">
        <button type="button" className="primary" onClick={p.onStart}>Lights out →</button>
        <p className="dim small">No tyre, pit-stop, collision or reliability model in v1.</p>
      </div>
    </section>
  );
}

function GameRace(p: {
  sim: RaceSim;
  seed: number;
  geometry: Geometry;
  players: Map<string, number>;
  drivers: GameDriver[];
  meeting: Meeting | null;
  onFinish: () => void;
  onNew: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [view, setView] = useState<"top" | "angle">("top");
  const raf = useRef(0);
  const last = useRef(0);
  const done = useRef(false);
  const finishTimer = useRef<number | null>(null);
  const finishRef = useRef(p.onFinish);
  finishRef.current = p.onFinish;
  const timeScale = p.sim.duration / Math.max(8, p.sim.laps * 8);

  useEffect(() => {
    last.current = performance.now();
    const loop = (now: number) => {
      raf.current = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last.current) / 1000);
      last.current = now;
      if (paused || done.current) return;
      setElapsed((current) => {
        const next = Math.min(p.sim.duration, current + dt * speed * timeScale);
        if (next >= p.sim.duration) {
          done.current = true;
          finishTimer.current = window.setTimeout(() => finishRef.current(), 650);
        }
        return next;
      });
    };
    raf.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf.current);
      if (finishTimer.current != null) window.clearTimeout(finishTimer.current);
    };
  }, [paused, speed, timeScale, p.sim.duration]);

  const state = raceState(p.sim, elapsed);
  const leader = p.drivers.find((d) => d.id === state.leaderId);
  const selectedRow =
    state.rows.find((row) => row.driverId === selectedId) ?? state.rows[0] ?? null;
  const effectiveSelectedId = selectedRow?.driverId ?? null;
  const compareRow =
    state.rows.find((row) => row.driverId === compareId && row.driverId !== effectiveSelectedId) ??
    state.rows.find((row) => row.driverId !== effectiveSelectedId) ??
    null;
  const latestEvent = [...p.sim.events]
    .filter((event) => event.t <= elapsed)
    .sort((a, b) => b.t - a.t)[0] ?? null;
  const progress = Math.min(p.sim.laps, Math.max(1, Math.ceil(elapsed / Math.max(1, p.sim.duration / p.sim.laps))));
  return (
    <section className="game-stage" aria-label="Simulated race">
      <header className="game-stage-head">
        <div>
          <p className="game-kicker">{p.meeting?.meeting_name ?? "Local race"} · {p.players.size} player{p.players.size === 1 ? "" : "s"}</p>
          <h2>{leader ? `${leader.code} leads` : "Lights out"}</h2>
          <p className="dim small">Lap {state.rows[0]?.lap ?? 1}/{p.sim.laps} · seed {p.seed} · {GAME_MODEL}</p>
        </div>
        <div className="game-race-controls">
          <button type="button" className="game-pill" onClick={() => setPaused((v) => !v)}>
            {paused ? "Resume" : "Pause"}
          </button>
          {[1, 2, 4].map((value) => (
            <button key={value} type="button" className="game-pill" aria-pressed={speed === value} onClick={() => setSpeed(value)}>
              {value}×
            </button>
          ))}
          <button type="button" className="game-pill" onClick={() => { setElapsed(p.sim.duration); p.onFinish(); }}>Skip</button>
        </div>
      </header>
      <div className="game-lapstrip" role="status" aria-label="Race progress">
        <span className="game-kicker">Lap {state.rows[0]?.lap ?? 1}/{p.sim.laps}</span>
        <div className="game-lap-segments" aria-hidden="true">
          {Array.from({ length: p.sim.laps }, (_, i) => {
            const leaderProgress = state.rows[0]?.progress ?? 0;
            const done = leaderProgress >= i + 1;
            const current = !done && leaderProgress >= i;
            return <i key={i} className={done ? "done" : current ? "current" : ""} />;
          })}
        </div>
        <span className="dim small">1× = ~8 s/lap · {p.sim.duration.toFixed(0)} model seconds</span>
      </div>
      {latestEvent && (
        <div className={`game-event ${latestEvent.kind.toLowerCase()}`} role="status">
          <b>{latestEvent.kind}</b>
          <span>{latestEvent.label}</span>
          <span className="game-event-lap">Lap {latestEvent.lap}</span>
        </div>
      )}
      <div className="game-race-grid">
        <div className="game-canvas-wrap">
          <div className="game-canvas-head">
            <span className="game-kicker">Circuit · {view === "top" ? "Top view" : "Angle view"}</span>
            <div className="game-view-toggle" role="group" aria-label="Circuit view">
              <button type="button" aria-pressed={view === "top"} onClick={() => setView("top")}>Top</button>
              <button type="button" aria-pressed={view === "angle"} onClick={() => setView("angle")}>Angle</button>
            </div>
          </div>
          <GameCanvas geometry={p.geometry} sim={p.sim} state={state} players={p.players} drivers={p.drivers} selectedId={effectiveSelectedId} onSelect={setSelectedId} view={view} />
          <div className="game-legend">
            {[...p.players.entries()].map(([id, player]) => {
              const driver = p.drivers.find((d) => d.id === id);
              return <span key={id}><i style={{ background: driver?.color }} />P{player} {driver?.code}</span>;
            })}
          </div>
          <p className="game-hint">Hover for pace; click a car or tower row for live stats and compare.</p>
        </div>
        <aside className="game-tower" aria-label="Race order">
          <DriverDesk
            state={state}
            sim={p.sim}
            drivers={p.drivers}
            selectedId={effectiveSelectedId}
            compareId={compareRow?.driverId ?? null}
            onSelect={setSelectedId}
            onCompare={setCompareId}
          />
          <h3>Order</h3>
          <div className="game-tower-scroll">
            <table className="laps game-table">
              <thead><tr><th>#</th><th>Driver</th><th>Gap</th></tr></thead>
              <tbody>
                {state.rows.map((row) => {
                const driver = p.drivers.find((d) => d.id === row.driverId);
                const selected = row.driverId === effectiveSelectedId;
                return (
                  <tr
                    key={row.driverId}
                    className={`${row.player ? "on" : ""} ${selected ? "selected" : ""} ${row.retired ? "retired" : ""}`}
                    tabIndex={0}
                    onClick={() => setSelectedId(row.driverId)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedId(row.driverId);
                      }
                    }}
                  >
                    <td className="mono">{row.position}</td>
                    <td><span className="game-dot" style={{ background: driver?.color }} />{driver?.code}{row.player ? <span className="game-player">P{row.player}</span> : null}{row.retired ? <span className="game-dnf">DNF</span> : null}</td>
                    <td className="mono">{row.retired ? "DNF" : row.position === 1 ? "—" : `+${row.gap.toFixed(1)}`}</td>
                  </tr>
                );
                })}
              </tbody>
            </table>
          </div>
          <p className="dim small game-progress">Clock {Math.min(p.sim.laps, progress)}/{p.sim.laps} · {elapsed.toFixed(0)}s</p>
          <button type="button" className="game-pill" onClick={p.onNew}>Abandon session</button>
        </aside>
      </div>
    </section>
  );
}

function DriverDesk(p: {
  state: ReturnType<typeof raceState>;
  sim: RaceSim;
  drivers: GameDriver[];
  selectedId: string | null;
  compareId: string | null;
  onSelect: (id: string) => void;
  onCompare: (id: string) => void;
}) {
  const selected = p.state.rows.find((row) => row.driverId === p.selectedId) ?? null;
  const compare = p.state.rows.find((row) => row.driverId === p.compareId) ?? null;
  const selectedMeta = p.drivers.find((driver) => driver.id === selected?.driverId) ?? null;
  const compareMeta = p.drivers.find((driver) => driver.id === compare?.driverId) ?? null;
  const selectedSim = p.sim.drivers.find((driver) => driver.id === selected?.driverId) ?? null;
  const compareSim = p.sim.drivers.find((driver) => driver.id === compare?.driverId) ?? null;
  if (!selected || !selectedSim) return null;
  const pace = selectedSim.lapTimes[Math.min(selectedSim.lapTimes.length - 1, Math.max(0, selected.lap - 1))];
  const last = selected.lap > 1 ? selectedSim.lapTimes[Math.min(selectedSim.lapTimes.length - 1, selected.lap - 2)] : null;
  const comparePace = compareSim ? compareSim.lapTimes[Math.min(compareSim.lapTimes.length - 1, Math.max(0, (compare?.lap ?? 1) - 1))] : null;
  const mode = raceMode(p.state.rows, selected);
  return (
    <section className="game-driver-desk" aria-label="Driver desk">
      <header className="game-desk-head">
        <div>
          <p className="game-kicker">Driver desk · live</p>
          <h3>Click a car or tower row to inspect. Compare against any driver.</h3>
        </div>
        <label className="game-compare-select">
          Compare with
          <select value={compare?.driverId ?? ""} onChange={(e) => p.onCompare(e.target.value)}>
            {p.state.rows.filter((row) => row.driverId !== selected.driverId).map((row) => {
              const driver = p.drivers.find((d) => d.id === row.driverId);
              return <option key={row.driverId} value={row.driverId}>{driver?.code ?? row.driverId}</option>;
            })}
          </select>
        </label>
      </header>
      <div className="game-desk-grid">
        <div className="game-desk-driver" style={{ borderColor: selectedMeta?.color }}>
          <span className="game-player">{selected.player ? `P${selected.player} · player` : "AI"}</span>
          <strong style={{ color: selectedMeta?.color }}>{selectedMeta?.code} <span>{selectedMeta?.name}</span></strong>
          <div><b>P{selected.position}</b><span>{selected.retired ? "DNF" : `Lap ${selected.lap}/${p.sim.laps}`}</span><span>{selected.position === 1 ? "leader" : `+${selected.gap.toFixed(1)}s`}</span></div>
          <div><b>Pace</b><span>{fmtLap(pace)}</span><span>{last != null ? `last ${fmtLap(last)}` : "no previous lap"}</span></div>
          <div><b>Mode</b><span>{mode}</span><span>{selectedMeta?.team}</span></div>
        </div>
        <div className="game-desk-compare">
          {compare && compareMeta && compareSim ? (
            <>
              <div className="game-desk-delta">
                <span className="game-kicker">A / B</span>
                <strong>{selectedMeta?.code} vs {compareMeta.code}</strong>
                <span>position {selected.position - compare.position > 0 ? `+${selected.position - compare.position}` : selected.position - compare.position}</span>
                <span>gap {selected.gap - compare.gap >= 0 ? "+" : ""}{(selected.gap - compare.gap).toFixed(1)}s</span>
                <span>pace {comparePace != null ? (pace - comparePace >= 0 ? "+" : "") + (pace - comparePace).toFixed(2) : "—"}s</span>
              </div>
              <div className="game-desk-driver compact">
                <strong style={{ color: compareMeta.color }}>{compareMeta.code} <span>{compareMeta.name}</span></strong>{compare.player ? <span className="game-player">P{compare.player}</span> : null}
                <div><b>P{compare.position}</b><span>{compare.retired ? "DNF" : `Lap ${compare.lap}/${p.sim.laps}`}</span><span>{compare.position === 1 ? "leader" : `+${compare.gap.toFixed(1)}s`}</span></div>
                <div><b>Pace</b><span>{comparePace != null ? fmtLap(comparePace) : "—"}</span><span>{compareMeta.team}</span></div>
              </div>
            </>
          ) : <p className="dim small">No second driver available.</p>}
        </div>
      </div>
    </section>
  );
}

function GameCanvas(p: {
  geometry: Geometry;
  sim: RaceSim;
  state: ReturnType<typeof raceState>;
  players: Map<string, number>;
  drivers: GameDriver[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  view: "top" | "angle";
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const screen = useRef(new Map<string, { x: number; y: number }>());
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const hoverRow = hover ? p.state.rows.find((row) => row.driverId === hover.id) : null;
  const hoverDriver = hover ? p.drivers.find((d) => d.id === hover.id) : null;
  const hoverSim = hover ? p.sim.drivers.find((d) => d.id === hover.id) : null;
  const hoverLap = hoverSim && hoverRow ? hoverSim.lapTimes[Math.min(hoverSim.lapTimes.length - 1, Math.max(0, hoverRow.lap - 1))] : null;
  const hoverMode = hoverRow ? raceMode(p.state.rows, hoverRow) : null;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(320, rect.width);
    const height = Math.max(260, Math.min(560, width * 0.62));
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    screen.current.clear();
    const outline = p.geometry.outline;
    if (outline.length < 3) return;
    const xs = outline.map(([x]) => x);
    const ys = outline.map(([, y]) => y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const pad = 36;
    const scale = Math.min((width - pad * 2) / Math.max(1, maxX - minX), (height - pad * 2) / Math.max(1, maxY - minY));
    const ox = pad + (width - pad * 2 - (maxX - minX) * scale) / 2 - minX * scale;
    const oy = pad + (height - pad * 2 - (maxY - minY) * scale) / 2 + maxY * scale;
    const X = (x: number) => ox + x * scale;
    const Y = (y: number) => oy - y * scale;
    const viewAngle = -0.08;
    const project = (x: number, y: number) => {
      const sx = X(x);
      const sy = Y(y);
      if (p.view === "top") return { x: sx, y: sy };
      const cx = width / 2;
      const cy = height / 2;
      const dx = sx - cx;
      const dy = sy - cy;
      return {
        x: cx + dx * Math.cos(viewAngle) - dy * Math.sin(viewAngle),
        y: cy + (dx * Math.sin(viewAngle) + dy * Math.cos(viewAngle)) * 0.72,
      };
    };

    // cumulative distance for a closed circuit
    const lengths: number[] = [];
    let total = 0;
    for (let i = 0; i < outline.length; i += 1) {
      const a = outline[i];
      const b = outline[(i + 1) % outline.length];
      lengths.push(Math.hypot(b[0] - a[0], b[1] - a[1]));
      total += lengths[i];
    }
    const sample = (progress: number) => {
      let need = ((progress % 1) + 1) % 1 * total;
      for (let i = 0; i < lengths.length; i += 1) {
        if (need <= lengths[i]) {
          const a = outline[i];
          const b = outline[(i + 1) % outline.length];
          const f = lengths[i] ? need / lengths[i] : 0;
          const x = a[0] + (b[0] - a[0]) * f;
          const y = a[1] + (b[1] - a[1]) * f;
          return { x, y, angle: Math.atan2(b[1] - a[1], b[0] - a[0]) };
        }
        need -= lengths[i];
      }
      return { x: outline[0][0], y: outline[0][1], angle: 0 };
    };

    ctx.lineJoin = "round";
    ctx.strokeStyle = "#3c4657";
    ctx.lineWidth = 16;
    ctx.beginPath();
    outline.forEach(([x, y], i) => {
      const point = project(x, y);
      if (i) ctx.lineTo(point.x, point.y);
      else ctx.moveTo(point.x, point.y);
    });
    ctx.closePath();
    ctx.stroke();
    ctx.strokeStyle = "rgba(232,237,243,0.42)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const start = project(outline[0][0], outline[0][1]);
    ctx.fillStyle = "#ffb224";
    ctx.fillRect(start.x - 7, start.y - 7, 14, 14);

    const rows = [...p.state.rows].reverse();
    for (const row of rows) {
      if (row.retired) continue;
      const driver = p.players.has(row.driverId) ? p.players.get(row.driverId) : null;
      const pt = sample(lapFraction(row.progress));
      const meta = p.drivers.find((d) => d.id === row.driverId);
      const marker = driver ? 7 : 4;
      const point = project(pt.x, pt.y);
      const px = point.x;
      const py = point.y;
      screen.current.set(row.driverId, { x: px, y: py });
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(-pt.angle);
      ctx.fillStyle = meta?.color ?? "#e9eef5";
      ctx.strokeStyle = "#0b0e13";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, marker, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (driver) {
        ctx.strokeStyle = "#ffb224";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, marker + 2.5, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (p.selectedId === row.driverId) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, marker + 5, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = "#0b0e13";
      ctx.font = "700 8px 'Barlow Condensed', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#0b0e13";
      ctx.font = "700 8px 'Barlow Condensed', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(meta?.code.slice(0, 2) ?? "", 0, 0);
      ctx.restore();
      if (driver) {
        ctx.fillStyle = "#ffb224";
        ctx.font = "700 8px 'Barlow Condensed', system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`P${driver}`, px, py - 12);
      }
    }
  }, [p.geometry, p.sim, p.state, p.players, p.view, p.selectedId]);
  const onClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = ref.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let bestId: string | null = null;
    let bestD = 15;
    screen.current.forEach((pt, id) => {
      const d = Math.hypot(pt.x - x, pt.y - y);
      if (d < bestD) {
        bestD = d;
        bestId = id;
      }
    });
    if (bestId) p.onSelect(bestId);
  };

  const onMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = ref.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let bestId: string | null = null;
    let bestX = 0;
    let bestY = 0;
    let bestD = 15;
    screen.current.forEach((pt, id) => {
      const d = Math.hypot(pt.x - x, pt.y - y);
      if (d < bestD) {
        bestD = d;
        bestId = id;
        bestX = pt.x;
        bestY = pt.y;
      }
    });
    setHover(bestId ? { id: bestId, x: bestX, y: bestY } : null);
  };

  return (
    <div className="game-canvas-live">
      <canvas
        ref={ref}
        className="game-canvas"
        role="img"
        aria-label="Circuit with simulated car positions"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onClick={onClick}
      />
      {hover && hoverRow && (
        <div
          className="game-hover"
          role="tooltip"
          style={{
            left: Math.min(hover.x + 12, (ref.current?.clientWidth ?? 390) - 190),
            top: Math.max(8, hover.y - 12),
          }}
        >
          <b style={{ color: hoverDriver?.color }}>{hoverDriver?.code ?? hoverRow.driverId}</b>
          {hoverRow.player ? <span className="game-player">P{hoverRow.player}</span> : <span className="dim small">AI</span>}
          <span>P{hoverRow.position} · {hoverRow.finished ? "finished" : `lap ${hoverRow.lap}`}</span>
          <span>{hoverMode}</span>
          <span>{hoverLap != null ? `Pace ${fmtLap(hoverLap)}` : "Pace —"}</span>
          <span>{hoverRow.position === 1 ? "Leader" : `+${hoverRow.gap.toFixed(1)}s`}</span>
        </div>
      )}
    </div>
  );
}

function raceMode(rows: ReturnType<typeof raceState>["rows"], row: ReturnType<typeof raceState>["rows"][number]): string {
  const index = rows.findIndex((r) => r.driverId === row.driverId);
  if (index <= 0) return "Leading";
  const ahead = rows[index - 1];
  const behind = rows[index + 1];
  if (ahead && row.gap - ahead.gap < 1) return "Attacking";
  if (behind && behind.gap - row.gap < 1) return "Defending";
  return "Clear air";
}

function GameResult(p: {
  sim: RaceSim;
  players: Map<string, number>;
  drivers: GameDriver[];
  onAgain: () => void;
  onNew: () => void;
}) {
  const winner = p.drivers.find((d) => d.id === p.sim.preview[0]?.driverId);
  return (
    <section className="game-stage" aria-label="Race result">
      <header className="game-stage-head">
        <div>
          <p className="game-kicker">Chequered flag · {p.sim.laps} laps</p>
          <h2>{winner ? `${winner.name} wins.` : "Race complete."}</h2>
          <p className="dim small">{GAME_MODEL}</p>
        </div>
        <div className="game-actions">
          <button type="button" className="primary" onClick={p.onAgain}>Race again</button>
          <button type="button" className="game-pill" onClick={p.onNew}>New setup</button>
        </div>
      </header>
      <div className="game-result-table">
        <table className="laps game-table">
          <thead><tr><th>Pos</th><th>Driver</th><th>Team</th><th>Gap</th><th>Player</th></tr></thead>
          <tbody>
            {p.sim.preview.map((row) => {
              const driver = p.drivers.find((d) => d.id === row.driverId);
              return (
                <tr key={row.driverId} className={`${row.player ? "on" : ""} ${row.retired ? "retired" : ""}`}>
                  <td className="mono">{row.position}</td>
                  <td><span className="game-dot" style={{ background: driver?.color }} />{driver?.code}{row.retired ? <span className="game-dnf">DNF</span> : null}</td>
                  <td className="dim">{driver?.team}</td>
                  <td className="mono">{row.retired ? "DNF" : row.position === 1 ? "winner" : `+${row.gap.toFixed(3)}`}</td>
                  <td>{row.player ? <span className="game-player">P{row.player}</span> : <span className="dim">AI</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="dim small game-footnote">
        Local time-based model: form + seeded variation, plus SC / VSC / crash events. No tyre or pit-stop simulation.
        {p.sim.events.length > 0 ? ` Incidents: ${p.sim.events.map((e) => `${e.kind} L${e.lap}`).join(" · ")}.` : ""}
      </p>
    </section>
  );
}
