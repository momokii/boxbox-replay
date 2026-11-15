import { useEffect, useState } from "react";
import { api } from "../api";
import type { ArchiveRace, ArchiveResult, StandingsPayload } from "../types";

interface Props {
  onClose: () => void;
}

function checkedLabel(iso?: string): string {
  if (!iso) return "just now";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "just now"
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Results/standings archive for every available season. No telemetry before 2023. */
export default function ArchiveView({ onClose }: Props) {
  const [seasons, setSeasons] = useState<number[]>([]);
  const [year, setYear] = useState<number | null>(null);
  const [races, setRaces] = useState<ArchiveRace[]>([]);
  const [round, setRound] = useState<number | null>(null);
  const [results, setResults] = useState<ArchiveResult[]>([]);
  const [race, setRace] = useState<ArchiveRace | null>(null);
  const [standings, setStandings] = useState<StandingsPayload | null>(null);
  const [loadingSeasons, setLoadingSeasons] = useState(true);
  const [loadingRaces, setLoadingRaces] = useState(false);
  const [loadingResults, setLoadingResults] = useState(false);
  const [loadingStandings, setLoadingStandings] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | undefined>();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let live = true;
    setLoadingSeasons(true);
    api
      .archiveSeasons(tick > 0)
      .then((data) => {
        if (!live) return;
        setSeasons(data.seasons);
        setYear((current) => current ?? data.seasons[data.seasons.length - 1] ?? null);
        setCheckedAt(data.fetched_at);
        setMessage(null);
      })
      .catch(() => live && setMessage("The results archive did not answer. Retry in a moment."))
      .finally(() => live && setLoadingSeasons(false));
    return () => {
      live = false;
    };
  }, [tick]);

  useEffect(() => {
    if (!year) return;
    let live = true;
    setLoadingRaces(true);
    setLoadingStandings(true);
    setRaces([]);
    setRound(null);
    setResults([]);
    setRace(null);
    setStandings(null);
    api
      .archiveRaces(year, tick > 0)
      .then((data) => {
        if (!live) return;
        setRaces(data.races);
        const today = Date.now();
        const completed = data.races.filter(
          (item) => item.date != null && Date.parse(item.date) <= today,
        );
        setRound((completed[completed.length - 1] ?? data.races[data.races.length - 1])?.round ?? null);
        setCheckedAt(data.fetched_at);
        setMessage(null);
      })
      .catch(() => live && setMessage(`The ${year} calendar did not load.`))
      .finally(() => live && setLoadingRaces(false));
    api
      .standings(year, undefined, tick > 0)
      .then((data) => {
        if (!live) return;
        setStandings(data);
        setCheckedAt(data.fetched_at);
      })
      .catch(() => live && setStandings(null))
      .finally(() => live && setLoadingStandings(false));
    return () => {
      live = false;
    };
  }, [year, tick]);

  useEffect(() => {
    if (!year || !round) return;
    let live = true;
    setLoadingResults(true);
    setResults([]);
    setRace(null);
    api
      .archiveResults(year, round, tick > 0)
      .then((data) => {
        if (!live) return;
        setRace(data.race);
        setResults(data.results);
        setCheckedAt(data.fetched_at);
        setMessage(null);
      })
      .catch(() => {
        if (!live) return;
        setRace(null);
        setResults([]);
      })
      .finally(() => live && setLoadingResults(false));
    return () => {
      live = false;
    };
  }, [year, round, tick]);

  const refreshing = loadingSeasons || loadingRaces || loadingResults || loadingStandings;
  const latest = seasons[seasons.length - 1];

  return (
    <div className="archive-view" role="dialog" aria-modal="true" aria-label="Results archive">
      <header className="archive-head">
        <div>
          <h2>Results archive</h2>
          <p className="dim small">
            Results and standings from Jolpica F1{latest ? ` through ${latest}` : ""}.
            2023+ also has replay in the main picker; this view is results only. No
            telemetry exists before 2023.
          </p>
        </div>
        <div className="archive-actions">
          <span className="dim small">Checked {checkedLabel(checkedAt)}</span>
          <button
            type="button"
            className="ghost small"
            onClick={() => {
              setLoadingSeasons(true);
              setLoadingRaces(true);
              setLoadingResults(true);
              setLoadingStandings(true);
              setTick((n) => n + 1);
            }}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <button type="button" className="archive-close" onClick={onClose} aria-label="Close archive">
            Close ✕
          </button>
        </div>
      </header>

      {message && <p className="dim">{message}</p>}
      {loadingSeasons && <p className="dim">Loading archive seasons…</p>}

      {!loadingSeasons && seasons.length > 0 && (
        <>
          <div className="archive-pickers">
            <label>
              Season
              <select value={year ?? ""} onChange={(e) => setYear(Number(e.target.value))} disabled={loadingSeasons}>
                {[...seasons].reverse().map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Race
              <select
                value={round ?? ""}
                onChange={(e) => setRound(Number(e.target.value))}
                disabled={loadingRaces || !races.length}
              >
                {round == null && <option value="">—</option>}
                {(races ?? []).map((item) => (
                  <option key={item.round} value={item.round}>
                    R{item.round} · {item.race_name}
                  </option>
                ))}
              </select>
            </label>
            {loadingRaces && <span className="archive-loading">Loading {year} calendar…</span>}
          </div>

          <div className="archive-grid">
            <section aria-busy={loadingResults}>
              <h3>
                {loadingResults
                  ? round
                    ? `Loading R${round} results…`
                    : `Loading ${year} results…`
                  : race
                    ? `R${race.round} · ${race.race_name}`
                    : "Race results"}
              </h3>
              {loadingResults ? (
                <p className="dim small">Fetching the result sheet…</p>
              ) : results.length ? (
                <div className="archive-scroll">
                  <table className="laps mono archive-table">
                    <thead>
                      <tr>
                        <th>Pos</th>
                        <th>Driver</th>
                        <th>Team</th>
                        <th>Grid</th>
                        <th>Laps</th>
                        <th>Time / status</th>
                        <th>Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((row) => (
                        <tr key={`${row.position}-${row.driver_id}`}>
                          <td>{row.position_text || row.position}</td>
                          <td>
                            {row.name}
                            {row.code ? ` (${row.code})` : ""}
                          </td>
                          <td className="dim">{row.team}</td>
                          <td>{row.grid || "—"}</td>
                          <td>{row.laps}</td>
                          <td>{row.time ?? row.status}</td>
                          <td>{row.points.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="dim small">
                  No results are stored for this round in the archive. Pick another race.
                </p>
              )}
            </section>

            <section aria-busy={loadingStandings}>
              <h3>Standings · {year}</h3>
              {loadingStandings ? (
                <p className="dim small">Fetching the final table…</p>
              ) : standings?.drivers.length ? (
                <div className="archive-scroll">
                  <table className="laps mono archive-table">
                    <thead>
                      <tr>
                        <th>Pos</th>
                        <th>Driver</th>
                        <th>Team</th>
                        <th>Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.drivers.slice(0, 12).map((row) => (
                        <tr key={row.driver_id}>
                          <td>{row.position}</td>
                          <td>{row.name}</td>
                          <td className="dim">{row.constructor}</td>
                          <td>{row.points.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="dim small">No final standings are stored for this season.</p>
              )}
            </section>
          </div>

          <p className="dim small archive-source">
            Source:{" "}
            <a href="https://api.jolpi.ca/ergast/f1/" target="_blank" rel="noreferrer">
              Jolpica F1
            </a>{" "}
            · CC BY-NC-SA 4.0. Results and standings only; replay telemetry starts in 2023. The archive revalidates hourly; Refresh bypasses the cache.
          </p>
        </>
      )}
    </div>
  );
}
