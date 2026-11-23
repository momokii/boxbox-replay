import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api";
import Info from "./Info";
import Modal from "./Modal";
import type { Driver, Geometry, Meeting, SessionInfo, StandingsPayload } from "../types";
import {
  GAME_MODEL,
  GAME_SECONDS_PER_LAP,
  gameClockScale,
  incidentPlaybackFactor,
  driverLapHistory,
  lapFraction,
  buildGameDrivers,
  buildRaceFeed,
  type GameDriver,
  type RaceFeedItem,
  type GameLaps,
  type QualiRow,
  type RaceEvent,
  type RaceSim,
  raceState,
  QUALI_ATTEMPTS,
  simulateQualifying,
  simulateRace,
  validatePlayerDrivers,
} from "../game";
import { buildGameCardData, downloadGameShareCard } from "../gameShareCard";
import "./game.css";

interface Props {
  onClose: () => void;
}

type Phase = "setup" | "qualifying" | "grid" | "race" | "result";

type HoverHandler = (
  driverId: string,
  event: React.MouseEvent,
  position?: number | null,
  player?: number | null,
) => void;

interface DriverHoverState {
  driverId: string;
  position: number | null;
  player: number | null;
  x: number;
  y: number;
}

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
  const [reload, setReload] = useState(0);
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
  const [driverMedia, setDriverMedia] = useState<Driver[]>([]);
  const [hoverDriver, setHoverDriver] = useState<DriverHoverState | null>(null);
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
    setHoverDriver(null);
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
    // The calendar and the standings table are independent. A slow Jolpica
    // response must not hide the Grand Prix picker behind it; the roster's
    // loading state belongs only to the standings request.
    api
      .meetings(year)
      .then((calendar) => {
        if (!live) return;
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
      .catch(() => live && setMessage("The race calendar did not load. Retry."));
    api
      .standings(year)
      .then((table) => live && setStandings(table))
      .catch(() => live && setMessage("The season table did not load. Retry or pick another season."))
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [year, reload]);

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
    if (!raceSession) {
      setDriverMedia([]);
      return;
    }
    let live = true;
    api
      .drivers(raceSession.session_key)
      .then((rows) => live && setDriverMedia(rows))
      .catch(() => {
        // Photos are an enhancement; the game must work without them.
        if (live) setDriverMedia([]);
      });
    return () => {
      live = false;
    };
  }, [raceSession?.session_key]);

  const mediaFor = (driver: GameDriver): Driver | null => {
    const number = driver.number == null ? null : Number(driver.number);
    return (
      driverMedia.find((row) => number != null && row.driver_number === number) ??
      driverMedia.find((row) => row.name_acronym === driver.code) ??
      null
    );
  };

  const showHover = useCallback(
    (driverId: string, event: React.MouseEvent, position: number | null = null, player: number | null = null) => {
      setHoverDriver({ driverId, position, player, x: event.clientX, y: event.clientY });
    },
    [],
  );
  const clearHover = useCallback(() => setHoverDriver(null), []);

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

        {message && (
          <div className="game-message" role="status">
            <span>{message}</span>
            <button type="button" className="game-pill" onClick={() => setReload((value) => value + 1)}>
              Retry
            </button>
          </div>
        )}

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
                <small>{quali ? "Two live flying laps set the grid; best counts." : "The same seeded grid is set without the session."}</small>
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
                  <li><b>Qualify or skip.</b> Two visible flying laps per driver set the grid, best counts; skipping uses the same seeded model, not a different random grid.</li>
                  <li><b>Race 3, 5 or 10 laps.</b> 1× is a 20 s/lap viewing pace (2×/4× available); seeded incidents can interrupt. Click a car for live pace, gap and race mode.</li>
                  <li><b>Share the result.</b> Download a 1200×630 result image with the classification, player badges, incidents and the model disclaimer.</li>
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
                {!loading && noDrivers && <p className="dim small">No drivers loaded. Retry the season table or pick another season.</p>}
                <div className="game-scroll">
                  <table className="laps game-table">
                    <thead>
                      <tr>
                        <th><Info label="OVR" tip="Overall first: 64% driver form (58% points + 42% championship position) + 36% team form, with seeded variation. Not a prediction." /></th>
                        <th><Info label="Driver" tip="Code, full name and team. Hover a row for the identity card and headshot." /></th>
                        <th><Info label="Team" tip="Constructor from the season standings table." /></th>
                        <th><Info label="Pts" tip="Championship points in the season table used to build the game field." /></th>
                        <th><span className="sr-only">Pick</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {gameDrivers.map((driver) => {
                        const owner = players.indexOf(driver.id);
                        const isActive = players[active] === driver.id;
                        return (
                          <tr
                            key={driver.id}
                            className={isActive ? "on" : owner >= 0 ? "picked" : ""}
                            onMouseEnter={(event) => showHover(driver.id, event, null, owner >= 0 ? owner + 1 : null)}
                            onMouseMove={(event) => showHover(driver.id, event, null, owner >= 0 ? owner + 1 : null)}
                            onMouseLeave={clearHover}
                          >
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
            mediaFor={mediaFor}
            onHover={showHover}
            onLeave={clearHover}
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
            mediaFor={mediaFor}
            onHover={showHover}
            onLeave={clearHover}
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
            mediaFor={mediaFor}
            onHover={showHover}
            onLeave={clearHover}
            onFinish={() => setPhase("result")}
            onNew={newSetup}
          />
        )}

        {phase === "result" && sim && geometry && (
          <GameResult
            sim={sim}
            seed={seed}
            players={playerLabels}
            drivers={gameDrivers}
            meeting={selectedMeeting}
            onAgain={raceAgain}
            onNew={newSetup}
          />
        )}
        {hoverDriver && (
          <DriverHoverCard
            key={hoverDriver.driverId}
            driver={driverById(gameDrivers, hoverDriver.driverId)}
            media={driverById(gameDrivers, hoverDriver.driverId) ? mediaFor(driverById(gameDrivers, hoverDriver.driverId)!) : null}
            position={hoverDriver.position}
            player={hoverDriver.player}
            x={hoverDriver.x}
            y={hoverDriver.y}
          />
        )}
      </div>
    </div>
  );

  return createPortal(body, document.body);
}

function DriverHoverCard(p: {
  driver: GameDriver | null;
  media: Driver | null;
  position: number | null;
  player: number | null;
  x: number;
  y: number;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  if (!p.driver) return null;
  const headshot = p.media?.headshot_url?.trim();
  const name = p.media?.full_name?.trim() || p.driver.name;
  const team = p.media?.team_name?.trim() || p.driver.team;
  const left = Math.max(8, Math.min(p.x + 14, window.innerWidth - 292));
  const top = Math.max(8, Math.min(p.y + 14, window.innerHeight - 190));
  return (
    <div className="game-identity" role="tooltip" style={{ left, top }}>
      <span className="game-identity-band" style={{ background: p.driver.color }} />
      <div className="game-identity-photo" style={{ borderColor: p.driver.color }}>
        {headshot && !imageFailed ? (
          <img
            src={headshot}
            alt=""
            referrerPolicy="no-referrer"
            loading="eager"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <span>{p.driver.number ?? p.driver.code}</span>
        )}
      </div>
      <div className="game-identity-copy">
        <div className="game-identity-meta">
          <span>{p.media?.name_acronym ?? p.driver.code}</span>
          {p.position != null && <span>P{p.position}</span>}
          {p.player != null ? <span className="game-player">PLAYER P{p.player}</span> : <span>AI</span>}
        </div>
        <strong>{name}</strong>
        <span>{team}</span>
      </div>
    </div>
  );
}

function GameQuali(p: {
  grid: QualiRow[];
  players: Map<string, number>;
  drivers: GameDriver[];
  meeting: Meeting | null;
  seed: number;
  mediaFor: (driver: GameDriver) => Driver | null;
  onHover: HoverHandler;
  onLeave: () => void;
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
          <h2>Two flying laps. The order is set.</h2>
          <p className="dim small">
            {complete ? `Pole ${poleDriver?.code ?? "—"}` : "Flying laps in progress"} · seed {p.seed} · simulated from the season table
          </p>
        </div>
        <button type="button" className="game-pill" onClick={p.onBack}>Back to setup</button>
      </header>
      <div className="game-quali-summary" role="status">
        <div className="game-quali-main">
          <span className="game-kicker">{complete ? "Session complete" : `Live session · ${shown}/${p.grid.length} drivers`}</span>
          <strong>{complete ? (poleDriver ? `${poleDriver.name} on pole` : "Qualifying complete") : "Reading the flying laps…"}</strong>
          <div className="game-quali-progress" aria-hidden="true"><i style={{ width: `${p.grid.length ? (shown / p.grid.length) * 100 : 0}%` }} /></div>
          <span className="dim small">Two flying laps · best counts · no Q1/Q2/Q3 split in v1</span>
        </div>
        <dl className="game-quali-facts">
          <div><dt>Pole</dt><dd>{poleDriver?.code ?? "—"}</dd></div>
          <div><dt>Best lap</dt><dd>{pole ? fmtLap(pole.time) : "—"}</dd></div>
          <div><dt>P2 gap</dt><dd>{p.grid[1] && pole ? `+${(p.grid[1].time - pole.time).toFixed(3)}` : "—"}</dd></div>
          <div><dt>Player</dt><dd>{pole && p.players.get(pole.driverId) ? `P${p.players.get(pole.driverId)}` : "AI"}</dd></div>
          <div><dt>Runs</dt><dd>{QUALI_ATTEMPTS}</dd></div>
          <div><dt>Field</dt><dd>{p.grid.length}</dd></div>
        </dl>
      </div>
      <div className="game-grid-table">
        <table className="laps game-table game-quali-table">
          <thead><tr>
            <th><Info label="Pos" tip="Grid position after the best of the two seeded flying laps." /></th>
            <th><Info label="Driver" tip="Hover a row for full name, team and headshot." /></th>
            <th><Info label="Team" tip="Constructor from the season standings table." /></th>
            <th><Info label="Best" tip="Best of the two seeded flying laps; this time sets the grid." /></th>
            <th><Info label="Runs" tip="Both seeded attempt times, run 1 then run 2." /></th>
            <th><Info label="Gap" tip="Gap to pole using the best lap. The pole has no gap." /></th>
            <th><Info label="Player" tip="Player badge, or AI for the rest of the field." /></th>
          </tr></thead>
          <tbody>
            {p.grid.slice(0, shown).map((row) => {
              const driver = p.drivers.find((d) => d.id === row.driverId);
              const best = pole?.time ?? row.time;
              return (
                <tr
                  key={row.driverId}
                  className={p.players.get(row.driverId) ? "on" : ""}
                  onMouseEnter={(event) => p.onHover(row.driverId, event, row.position, p.players.get(row.driverId) ?? null)}
                  onMouseMove={(event) => p.onHover(row.driverId, event, row.position, p.players.get(row.driverId) ?? null)}
                  onMouseLeave={p.onLeave}
                >
                  <td className="mono">{row.position}</td>
                  <td><span className="game-dot" style={{ background: driver?.color }} />{driver?.code} <span className="dim small">{driver?.name}</span></td>
                  <td className="dim">{driver?.team}</td>
                  <td className="mono">{fmtLap(row.time)}</td>
                  <td className="mono game-runs">{row.attempts.map((time) => fmtLap(time)).join(" · ")}</td>
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
  mediaFor: (driver: GameDriver) => Driver | null;
  onHover: HoverHandler;
  onLeave: () => void;
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
      <div className="game-grid-table game-grid-scroll">
        <table className="laps game-table">
          <thead><tr>
            <th><Info label="Grid" tip="Starting position set by qualifying. Skipping qualifying uses the same seeded best-lap grid." /></th>
            <th><Info label="Driver" tip="Hover a row for full name, team and headshot." /></th>
            <th><Info label="Team" tip="Constructor from the season standings table." /></th>
            <th><Info label="Gap" tip="Gap to the pole time. The pole has no gap." /></th>
            <th><Info label="Player" tip="Player badge, or AI for the rest of the field." /></th>
          </tr></thead>
          <tbody>
            {p.grid.map((row) => {
              const driver = p.drivers.find((d) => d.id === row.driverId);
              const best = p.grid[0]?.time ?? row.time;
              return (
                <tr
                  key={row.driverId}
                  onMouseEnter={(event) => p.onHover(row.driverId, event, row.position, p.players.get(row.driverId) ?? null)}
                  onMouseMove={(event) => p.onHover(row.driverId, event, row.position, p.players.get(row.driverId) ?? null)}
                  onMouseLeave={p.onLeave}
                >
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
        <button type="button" className="primary" onClick={p.onStart}>Start race →</button>
        <p className="dim small">Five lights, then the clock starts. No tyre, pit-stop, collision or reliability model in v1.</p>
      </div>
    </section>
  );
}

function RaceFeed(p: {
  items: RaceFeedItem[];
  event: { kind: string; label: string; lap: number } | null;
  started: boolean;
}) {
  return (
    <section className="game-live-feed" aria-label="Live model feed">
      <header>
        <div>
          <p className="game-kicker">Live model feed</p>
          <h3>{p.event ? p.event.kind : "Race control"}</h3>
        </div>
        <span className="game-live-badge">SIMULATED</span>
      </header>
      <div className={`game-live-current ${p.event ? p.event.kind.toLowerCase() : ""}`} role="status" aria-live="polite">
        {p.event ? (
          <>
            <b>{p.event.kind}</b>
            <span>{p.event.label}</span>
            <small>Lap {p.event.lap}</small>
          </>
        ) : (
          <>
            <b>{p.started ? "GREEN" : "GRID"}</b>
            <span>{p.started ? "No incidents yet. The model is running clean." : "Formation lap. The clock starts after the lights."}</span>
          </>
        )}
      </div>
      <ol className="game-live-items">
        {p.items.length ? p.items.map((item) => (
          <li key={item.id} className={item.kind}>
            <span className="game-live-lap">L{item.lap}</span>
            <span>{item.text}</span>
            <time>{fmtLap(item.t)}</time>
          </li>
        )) : <li className="dim">The first report appears when the race begins.</li>}
      </ol>
      <p className="game-live-note">Model-derived feed · not real race control.</p>
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
  mediaFor: (driver: GameDriver) => Driver | null;
  onHover: HoverHandler;
  onLeave: () => void;
  onFinish: () => void;
  onNew: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [view, setView] = useState<"top" | "angle">("top");
  const [started, setStarted] = useState(false);
  const [lightStep, setLightStep] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const closeDetails = useCallback(() => setDetailId(null), []);
  const changeZoom = (next: number) => {
    const clamped = Math.max(1, Math.min(2.5, next));
    setZoom(clamped);
    if (clamped === 1) setPan({ x: 0, y: 0 });
  };
  const raf = useRef(0);
  const last = useRef(0);
  const done = useRef(false);
  const finishTimer = useRef<number | null>(null);
  const finishRef = useRef(p.onFinish);
  finishRef.current = p.onFinish;
  const latestEvent = [...p.sim.events]
    .filter((event) => event.t <= elapsed)
    .sort((a, b) => b.t - a.t)[0] ?? null;
  const eventFactor = latestEvent
    ? incidentPlaybackFactor(latestEvent.kind, elapsed - latestEvent.t)
    : 1;
  const timeScale = gameClockScale(p.sim.duration, p.sim.laps) * eventFactor;

  useEffect(() => {
    setStarted(false);
    setLightStep(0);
    const lights = window.setInterval(() => {
      setLightStep((step) => Math.min(5, step + 1));
    }, 550);
    const start = window.setTimeout(() => setStarted(true), 3600);
    return () => {
      window.clearInterval(lights);
      window.clearTimeout(start);
    };
  }, []);

  useEffect(() => {
    last.current = performance.now();
    const loop = (now: number) => {
      raf.current = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last.current) / 1000);
      last.current = now;
      if (!started || paused || done.current) return;
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
  }, [started, paused, speed, timeScale, p.sim.duration]);

  const state = raceState(p.sim, elapsed);
  const leader = p.drivers.find((d) => d.id === state.leaderId);
  const selectedRow =
    state.rows.find((row) => row.driverId === selectedId) ?? state.rows[0] ?? null;
  const effectiveSelectedId = selectedRow?.driverId ?? null;
  const compareRow =
    state.rows.find((row) => row.driverId === compareId && row.driverId !== effectiveSelectedId) ??
    state.rows.find((row) => row.driverId !== effectiveSelectedId) ??
    null;
  const progress = Math.min(p.sim.laps, Math.max(1, Math.ceil(elapsed / Math.max(1, p.sim.duration / p.sim.laps))));
  const feed = buildRaceFeed(p.sim, p.drivers);
  const visibleFeed = feed.filter((item) => item.t <= elapsed).slice(-4).reverse();
  const orderRows = state.rows.map((row, index) => {
    const driver = p.drivers.find((item) => item.id === row.driverId);
    const simDriver = p.sim.drivers.find((item) => item.id === row.driverId);
    const completed = row.retired
      ? Math.max(0, row.lap - 1)
      : row.finished
        ? p.sim.laps
        : Math.max(0, row.lap - 1);
    const times = simDriver?.lapTimes.slice(0, completed) ?? [];
    const ahead = state.rows[index - 1];
    return {
      row,
      driver,
      last: times.length ? times[times.length - 1] : null,
      best: times.length ? Math.min(...times) : null,
      interval: ahead ? Math.max(0, row.gap - ahead.gap) : null,
      mode: raceMode(state.rows, row),
    };
  });
  return (
    <section className="game-stage" aria-label="Simulated race">
      <header className="game-stage-head">
        <div>
          <p className="game-kicker">{p.meeting?.meeting_name ?? "Local race"} · {p.players.size} player{p.players.size === 1 ? "" : "s"}</p>
          <h2>{!started ? "Formation lap" : leader ? `${leader.code} leads` : "Lights out"}</h2>
          <p className="dim small">Lap {state.rows[0]?.lap ?? 1}/{p.sim.laps} · seed {p.seed} · {GAME_MODEL}</p>
        </div>
        <div className="game-race-controls">
          <button type="button" className="game-pill" disabled={!started} onClick={() => setPaused((v) => !v)}>
            {paused ? "Resume" : "Pause"}
          </button>
          {[1, 2, 4].map((value) => (
            <button key={value} type="button" className="game-pill" aria-pressed={speed === value} disabled={!started} onClick={() => setSpeed(value)}>
              {value}×
            </button>
          ))}
          <button type="button" className="game-pill" disabled={!started} onClick={() => { setElapsed(p.sim.duration); p.onFinish(); }}>Skip</button>
        </div>
      </header>
      {!started && (
        <div className="game-start-sequence" role="status" aria-live="polite">
          <div className="game-lights" aria-hidden="true">
            {Array.from({ length: 5 }, (_, index) => (
              <i key={index} className={index < lightStep ? "on" : ""} />
            ))}
          </div>
          <div>
            <b>{lightStep >= 5 ? "Lights out" : "Formation lap"}</b>
            <span>{lightStep >= 5 ? "The clock starts now." : "Five lights, then the race begins."}</span>
          </div>
        </div>
      )}
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
        <span className="dim small">1× ≈ {GAME_SECONDS_PER_LAP} s/lap · {p.sim.duration.toFixed(0)} model seconds</span>
      </div>
      {latestEvent && (
        <div className={`game-event ${latestEvent.kind.toLowerCase()}`} role="status">
          <b>{latestEvent.kind}</b>
          <span>{latestEvent.label}</span>
          {eventFactor < 1 && <span className="game-event-slow">playback slowed</span>}
          <span className="game-event-lap">Lap {latestEvent.lap}</span>
        </div>
      )}
      <div className="game-race-grid">
        <div className="game-canvas-wrap">
          <div className="game-canvas-head">
            <span className="game-kicker">Circuit · {view === "top" ? "Top view" : "Angle view"}</span>
            <div className="game-canvas-tools">
              <div className="game-view-toggle" role="group" aria-label="Circuit view">
                <button type="button" aria-pressed={view === "top"} onClick={() => setView("top")}>Top</button>
                <button type="button" aria-pressed={view === "angle"} onClick={() => setView("angle")}>Angle</button>
              </div>
              <div className="game-zoom-controls" role="group" aria-label="Circuit zoom">
                <button type="button" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => changeZoom(zoom - 0.25)}>−</button>
                <span>{Math.round(zoom * 100)}%</span>
                <button type="button" aria-label="Zoom in" disabled={zoom >= 2.5} onClick={() => changeZoom(zoom + 0.25)}>+</button>
                <button type="button" onClick={() => changeZoom(1)}>Fit</button>
              </div>
            </div>
          </div>
          <GameCanvas geometry={p.geometry} sim={p.sim} state={state} players={p.players} drivers={p.drivers} selectedId={effectiveSelectedId} onSelect={setSelectedId} view={view} zoom={zoom} pan={pan} onZoom={changeZoom} onPan={setPan} mediaFor={p.mediaFor} incident={latestEvent} elapsed={elapsed} />
          <div className="game-legend">
            {[...p.players.entries()].map(([id, player]) => {
              const driver = p.drivers.find((d) => d.id === id);
              return <span key={id}><i style={{ background: driver?.color }} />P{player} {driver?.code}</span>;
            })}
          </div>
          <p className="game-hint">Hover for identity and pace; click a car or order row for live stats. Zoom, then drag the circuit to pan.</p>
                <section className="game-order-panel" aria-label="Race order">
        <header>
          <div><p className="game-kicker">Timing</p><h3>Order</h3></div>
          <span className="dim small">Click a row to inspect · double-click for lap-by-lap</span>
        </header>
        <div className="game-order-scroll">
          <table className="laps game-table game-order-table">
            <thead><tr>
              <th><Info label="Pos" tip="Running classification position at the current race clock." /></th>
              <th><Info label="Driver" tip="Three-letter timing code. Hover the row for full name, team and headshot." /></th>
              <th><Info label="Team" tip="Constructor from the season standings table." /></th>
              <th><Info label="Gap" tip="Seconds behind the leader at the current clock. DNF when retired." /></th>
              <th><Info label="Int" tip="Interval to the car directly ahead. The leader has no interval." /></th>
              <th><Info label="Last" tip="Last completed simulated lap; — until the first lap is complete." /></th>
              <th><Info label="Best" tip="Best completed simulated lap up to the current lap. Future laps are never shown." /></th>
              <th><Info label="Mode" tip="Model race state: Leading = P1; Attacking = within 1 s of the car ahead; Defending = within 1 s of the car behind; Clear air = neither." /></th>
              <th><Info label="Player" tip="Player badge, or AI for the rest of the field." /></th>
            </tr></thead>
            <tbody>
              {orderRows.map(({ row, driver, last, best, interval, mode }) => {
                const selected = row.driverId === effectiveSelectedId;
                return (
                  <tr
                    key={row.driverId}
                    className={`${row.player ? "on" : ""} ${selected ? "selected" : ""} ${row.retired ? "retired" : ""}`}
                    tabIndex={0}
                    onClick={() => setSelectedId(row.driverId)}
                    onDoubleClick={() => setDetailId(row.driverId)}
                    onMouseEnter={(event) => p.onHover(row.driverId, event, row.position, row.player)}
                    onMouseMove={(event) => p.onHover(row.driverId, event, row.position, row.player)}
                    onMouseLeave={p.onLeave}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedId(row.driverId);
                      }
                    }}
                  >
                    <td className="mono">{row.position}</td>
                    <td><span className="game-dot" style={{ background: driver?.color }} />{driver?.code}{row.player ? <span className="game-player">P{row.player}</span> : null}{row.retired ? <span className="game-dnf">DNF</span> : null}</td>
                    <td className="dim">{driver?.team ?? "—"}</td>
                    <td className="mono">{row.retired ? "DNF" : row.position === 1 ? "—" : `+${row.gap.toFixed(1)}`}</td>
                    <td className="mono">{row.retired ? "—" : interval == null ? "—" : `+${interval.toFixed(1)}`}</td>
                    <td className="mono">{last != null ? fmtLap(last) : "—"}</td>
                    <td className="mono">{best != null ? fmtLap(best) : "—"}</td>
                    <td className="game-mode-cell">{row.retired ? "DNF" : mode}</td>
                    <td>{row.player ? <span className="game-player">P{row.player}</span> : <span className="dim">AI</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="game-order-foot">
          <span className="dim small game-progress">Clock {Math.min(p.sim.laps, progress)}/{p.sim.laps} · {elapsed.toFixed(0)}s</span>
          <button type="button" className="game-pill" onClick={p.onNew}>Abandon session</button>
        </div>
      </section>
        </div>
        <aside className="game-race-side">
          <RaceFeed
            items={visibleFeed}
            event={latestEvent ? { kind: latestEvent.kind, label: latestEvent.label, lap: latestEvent.lap } : null}
            started={started}
          />
          <DriverDesk
            state={state}
            sim={p.sim}
            drivers={p.drivers}
            selectedId={effectiveSelectedId}
            compareId={compareRow?.driverId ?? null}
            onSelect={setSelectedId}
            onCompare={setCompareId}
            onDetails={setDetailId}
            mediaFor={p.mediaFor}
          />
        </aside>

      </div>
      <DriverLapModal
        sim={p.sim}
        drivers={p.drivers}
        driverId={detailId}
        seed={p.seed}
        player={detailId ? p.players.get(detailId) ?? null : null}
        elapsed={elapsed}
        onClose={closeDetails}
      />
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
  onDetails: (id: string) => void;
  mediaFor: (driver: GameDriver) => Driver | null;
}) {
  const selected = p.state.rows.find((row) => row.driverId === p.selectedId) ?? null;
  const compare = p.state.rows.find((row) => row.driverId === p.compareId) ?? null;
  const selectedMeta = p.drivers.find((driver) => driver.id === selected?.driverId) ?? null;
  const selectedMedia = selectedMeta ? p.mediaFor(selectedMeta) : null;
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
          <div className="game-desk-identity">
            <span className="game-desk-avatar" style={{ borderColor: selectedMeta?.color }}>
              {selectedMedia?.headshot_url ? (
                <img src={selectedMedia.headshot_url} alt="" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.hidden = true; }} />
              ) : null}
              <i>{selectedMeta?.number ?? selectedMeta?.code}</i>
            </span>
            <strong style={{ color: selectedMeta?.color }}>{selectedMeta?.code} <span>{selectedMeta?.name}</span></strong>
          </div>
          <div><b>P{selected.position}</b><span>{selected.retired ? "DNF" : `Lap ${selected.lap}/${p.sim.laps}`}</span><span>{selected.position === 1 ? "leader" : `+${selected.gap.toFixed(1)}s`}</span></div>
          <div><b>Pace</b><span>{fmtLap(pace)}</span><span>{last != null ? `last ${fmtLap(last)}` : "no previous lap"}</span></div>
          <div><b>Mode</b><span>{mode}</span><span>{selectedMeta?.team}</span></div>
          <button type="button" className="game-pill game-desk-details" onClick={() => p.onDetails(selected.driverId)}>Lap by lap</button>
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

function DriverLapModal(p: {
  sim: RaceSim;
  drivers: GameDriver[];
  driverId: string | null;
  seed: number;
  player: number | null;
  elapsed: number;
  onClose: () => void;
}) {
  const driver = p.drivers.find((item) => item.id === p.driverId) ?? null;
  const laps = driver ? driverLapHistory(p.sim, driver.id, p.elapsed) : [];
  const simDriver = driver ? p.sim.drivers.find((item) => item.id === driver.id) : null;
  const times = laps.flatMap((lap) => (lap.time == null ? [] : [lap.time]));
  const best = times.length ? Math.min(...times) : null;
  const average = times.length ? times.reduce((sum, time) => sum + time, 0) / times.length : null;
  const grid = driver ? p.sim.grid.find((row) => row.driverId === driver.id)?.position : null;
  const retiredNow = simDriver?.retiredAt != null && p.elapsed >= simDriver.retiredAt;
  const status = retiredNow ? "DNF" : p.elapsed >= p.sim.duration ? "Finished" : "Running";
  const currentLap = Math.min(p.sim.laps, Math.max(1, Math.floor(p.elapsed / p.sim.baseLap) + 1));
  return (
    <Modal
      open={driver != null}
      title={driver ? `${driver.code} · ${driver.name}` : "Driver laps"}
      subtitle={driver ? `${driver.team} · ${p.player ? `Player P${p.player}` : "AI"} · seed ${p.seed}` : undefined}
      onClose={p.onClose}
      size="wide"
    >
      {driver && (
        <div className="game-lap-modal">
          <div className="game-lap-summary">
            <div><span>Best lap</span><b>{best != null ? fmtLap(best) : "—"}</b></div>
            <div><span>Average lap</span><b>{average != null ? fmtLap(average) : "—"}</b></div>
            <div><span>Laps</span><b>{laps.length}/{p.sim.laps}</b></div>
            <div><span>Grid</span><b>{grid != null ? `P${grid}` : "—"}</b></div>
            <div><span>Status</span><b>{status}</b></div>
          </div>
          <div className="game-lap-table-wrap">
            <table className="laps game-table game-lap-table">
              <thead><tr><th>Lap</th><th>Lap time</th><th>Race time</th><th>Pos</th><th>Gap</th><th>Note</th></tr></thead>
              <tbody>
                {laps.length === 0 && (
                  <tr><td colSpan={6} className="dim">No completed laps yet. Lap {currentLap} is in progress.</td></tr>
                )}
                {laps.map((lap) => (
                  <tr key={lap.lap} className={lap.time === best ? "best" : lap.status === "DNF" ? "retired" : ""}>
                    <td className="mono">L{lap.lap}</td>
                    <td className="mono">{lap.time != null ? fmtLap(lap.time) : "—"}</td>
                    <td className="mono">{fmtLap(lap.raceTime)}</td>
                    <td className="mono">P{lap.position}</td>
                    <td className="mono">{lap.status === "DNF" ? "—" : lap.position === 1 ? "leader" : `+${lap.gap.toFixed(1)}s`}</td>
                    <td>{lap.status === "DNF" ? <span className="game-dnf">DNF</span> : lap.event ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="dim small game-lap-note">Local game model · lap times include seeded incidents · not real telemetry.</p>
        </div>
      )}
    </Modal>
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
  zoom: number;
  pan: { x: number; y: number };
  onZoom: (zoom: number) => void;
  onPan: (pan: { x: number; y: number }) => void;
  mediaFor: (driver: GameDriver) => Driver | null;
  incident: RaceEvent | null;
  elapsed: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const screen = useRef(new Map<string, { x: number; y: number }>());
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const dragStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const dragMoved = useRef(false);
  const hoverRow = hover ? p.state.rows.find((row) => row.driverId === hover.id) : null;
  const hoverDriver = hover ? p.drivers.find((d) => d.id === hover.id) : null;
  const hoverSim = hover ? p.sim.drivers.find((d) => d.id === hover.id) : null;
  const hoverMedia = hoverDriver ? p.mediaFor(hoverDriver) : null;
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
    const viewAngle = -0.14;
    const project = (x: number, y: number) => {
      const sx = X(x);
      const sy = Y(y);
      const cx = width / 2;
      const cy = height / 2;
      let px = sx;
      let py = sy;
      if (p.view === "angle") {
        const dx = sx - cx;
        const dy = sy - cy;
        px = cx + dx * Math.cos(viewAngle) - dy * Math.sin(viewAngle);
        py = cy + (dx * Math.sin(viewAngle) + dy * Math.cos(viewAngle)) * 0.58;
      }
      return {
        x: cx + (px - cx) * p.zoom + p.pan.x,
        y: cy + (py - cy) * p.zoom + p.pan.y,
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
    if (p.incident) {
      if (p.incident.kind === "SC" || p.incident.kind === "VSC") {
        ctx.save();
        ctx.strokeStyle = p.incident.kind === "SC" ? "#ffb224" : "#f6c453";
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 6;
        ctx.beginPath();
        outline.forEach(([x, y], i) => {
          const point = project(x, y);
          if (i) ctx.lineTo(point.x, point.y);
          else ctx.moveTo(point.x, point.y);
        });
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
      const incidentRow = p.incident.driverId
        ? p.state.rows.find((row) => row.driverId === p.incident?.driverId)
        : null;
      if (incidentRow) {
        const lastPoint = sample(lapFraction(incidentRow.progress));
        const point = project(lastPoint.x, lastPoint.y);
        ctx.save();
        ctx.strokeStyle = "#ff6b6b";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#ff6b6b";
        ctx.font = "700 9px 'Barlow Condensed', system-ui, sans-serif";
        ctx.fillText("CRASH", point.x + 17, point.y - 10);
        ctx.restore();
      }
    }
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
  }, [p.geometry, p.sim, p.state, p.players, p.view, p.selectedId, p.zoom, p.pan, p.incident]);
  const onClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragMoved.current) {
      dragMoved.current = false;
      return;
    }
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

  const onWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const next = Math.max(1, Math.min(2.5, p.zoom + (event.deltaY < 0 ? 0.15 : -0.15)));
    if (next !== p.zoom) p.onZoom(next);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (p.zoom <= 1) return;
    dragStart.current = { x: event.clientX, y: event.clientY, panX: p.pan.x, panY: p.pan.y };
    dragMoved.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerUp = () => {
    dragStart.current = null;
  };

  const onMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragStart.current) {
      const dx = event.clientX - dragStart.current.x;
      const dy = event.clientY - dragStart.current.y;
      if (Math.hypot(dx, dy) > 3) dragMoved.current = true;
      p.onPan({ x: dragStart.current.panX + dx, y: dragStart.current.panY + dy });
      return;
    }
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
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerMove={onMove}
        onPointerLeave={() => { setHover(null); dragStart.current = null; }}
        onClick={onClick}
        onWheel={onWheel}
      />
      {hover && hoverRow && (
        <div
          className="game-hover"
          role="tooltip"
          style={{
            left: Math.min(hover.x + 12, (ref.current?.clientWidth ?? 390) - 260),
            top: Math.max(8, hover.y - 12),
          }}
        >
          <div className="game-hover-identity">
            <span className="game-hover-avatar" style={{ borderColor: hoverDriver?.color }}>
              {hoverMedia?.headshot_url ? (
                <img
                  src={hoverMedia.headshot_url}
                  alt=""
                  referrerPolicy="no-referrer"
                  onError={(event) => { event.currentTarget.hidden = true; }}
                />
              ) : null}
              <i>{hoverDriver?.number ?? hoverDriver?.code}</i>
            </span>
            <div>
              <b style={{ color: hoverDriver?.color }}>{hoverDriver?.code ?? hoverRow.driverId}</b>
              <strong>{hoverMedia?.full_name ?? hoverDriver?.name ?? "Driver"}</strong>
              <small>{hoverMedia?.team_name ?? hoverDriver?.team ?? "—"}</small>
            </div>
          </div>
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
  seed: number;
  players: Map<string, number>;
  drivers: GameDriver[];
  meeting: Meeting | null;
  onAgain: () => void;
  onNew: () => void;
}) {
  const winner = p.drivers.find((d) => d.id === p.sim.preview[0]?.driverId);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const download = async () => {
    setSharing(true);
    setShareError(null);
    try {
      await downloadGameShareCard(
        buildGameCardData(p.sim, p.drivers, p.meeting?.meeting_name ?? "Local race", p.seed),
      );
    } catch {
      setShareError("The result image could not be created. The table is still available.");
    } finally {
      setSharing(false);
    }
  };
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
          <button type="button" className="game-pill" onClick={download} disabled={sharing}>
            {sharing ? "Preparing image…" : "Download result image"}
          </button>
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
      {shareError && <p className="game-share-error" role="alert">{shareError}</p>}
      <p className="dim small game-footnote">
        Local time-based model: form + seeded variation, plus SC / VSC / crash events. No tyre or pit-stop simulation.
        {p.sim.events.length > 0 ? ` Incidents: ${p.sim.events.map((e) => `${e.kind} L${e.lap}`).join(" · ")}.` : ""}
      </p>
    </section>
  );
}
