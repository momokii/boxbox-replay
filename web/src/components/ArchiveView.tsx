import { useEffect, useState } from "react";
import { api } from "../api";
import type { ArchiveRace, ArchiveResult, StandingsPayload } from "../types";

interface Props {
  onClose: () => void;
}

/** Pre-2023 results/standings. Deliberately separate from replay: no telemetry. */
export default function ArchiveView({ onClose }: Props) {
  const [seasons, setSeasons] = useState<number[]>([]);
  const [year, setYear] = useState<number | null>(null);
  const [races, setRaces] = useState<ArchiveRace[]>([]);
  const [round, setRound] = useState<number | null>(null);
  const [results, setResults] = useState<ArchiveResult[]>([]);
  const [race, setRace] = useState<ArchiveRace | null>(null);
  const [standings, setStandings] = useState<StandingsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    api
      .archiveSeasons()
      .then((data) => {
        const archived = data.seasons.filter((season: number) => season <= 2022);
        setSeasons(archived);
        setYear(archived[archived.length - 1] ?? null);
      })
      .catch(() => setError("The results archive did not answer. Retry in a moment."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!year) return;
    setRaces([]);
    setRound(null);
    setResults([]);
    setStandings(null);
    api
      .archiveRaces(year)
      .then((data) => {
        setRaces(data.races);
        setRound(data.races[data.races.length - 1]?.round ?? null);
      })
      .catch(() => setError("No race list was returned for this season."));
    api
      .standings(year)
      .then(setStandings)
      .catch(() => setStandings(null));
  }, [year]);

  useEffect(() => {
    if (!year || !round) return;
    api
      .archiveResults(year, round)
      .then((data) => {
        setRace(data.race);
        setResults(data.results);
      })
      .catch(() => {
        setRace(null);
        setResults([]);
      });
  }, [year, round]);

  return (
    <div className="archive-view" role="dialog" aria-modal="true" aria-label="Results archive">
      <header className="archive-head">
        <div>
          <h2>Results archive</h2>
          <p className="dim small">
            1950–2022 results and standings from Jolpica F1. No telemetry or replay for
            these seasons — the main picker starts in 2023.
          </p>
        </div>
        <button type="button" className="archive-close" onClick={onClose} aria-label="Close archive">
          Close ✕
        </button>
      </header>

      {loading && <p className="dim">Loading archive…</p>}
      {error && <p className="dim">{error}</p>}

      {!loading && seasons.length > 0 && (
        <>
          <div className="archive-pickers">
            <label>
              Season
              <select value={year ?? ""} onChange={(e) => setYear(Number(e.target.value))}>
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
                disabled={!races.length}
              >
                {(races ?? []).map((item) => (
                  <option key={item.round} value={item.round}>
                    R{item.round} · {item.race_name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="archive-grid">
            <section>
              <h3>{race ? `R${race.round} · ${race.race_name}` : "Race results"}</h3>
              {results.length ? (
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

            <section>
              <h3>Final standings · {year}</h3>
              {standings?.drivers.length ? (
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
            <a
              href="https://api.jolpi.ca/ergast/f1/"
              target="_blank"
              rel="noreferrer"
            >
              Jolpica F1
            </a>{" "}
            · CC BY-NC-SA 4.0. Results and standings only; no telemetry before 2023.
          </p>
        </>
      )}
    </div>
  );
}
