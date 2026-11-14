import { useEffect, useState } from "react";
import { api } from "../api";
import type { ProgressionPayload, StandingsPayload } from "../types";

interface Props {
  year: number;
  meetingName: string;
  meetingDate: string | null;
}

const COLORS = ["#ff5a52", "#4cc2ff", "#ffb224", "#3ddc97", "#b388ff", "#ff8bc9", "#e8edf3", "#7bdff2"];

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return COLORS[hash % COLORS.length];
}

function ProgressionChart({ data }: { data: ProgressionPayload }) {
  if (!data.rounds.length || !data.series.length) return null;
  const series = data.series.slice(0, 5);
  const max = Math.max(1, ...series.flatMap((s) => s.points));
  const width = 720;
  const height = 240;
  const pad = { l: 38, r: 48, t: 16, b: 28 };
  const x = (i: number) =>
    pad.l + (data.rounds.length === 1 ? 0 : (i / (data.rounds.length - 1)) * (width - pad.l - pad.r));
  const y = (points: number) => height - pad.b - (points / max) * (height - pad.t - pad.b);
  const grid = [0, 0.25, 0.5, 0.75, 1];
  return (
    <>
      <div className="chart-legend">
        {series.map((line) => (
          <span key={line.driver_id}>
            <i style={{ background: colorFor(line.constructor) }} />
            {line.code}
          </span>
        ))}
      </div>
    <svg className="standings-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Championship points after each round">
      <title>Championship points after each round</title>
      {grid.map((f) => (
        <g key={f}>
          <line
            x1={pad.l}
            x2={width - pad.r}
            y1={y(max * f)}
            y2={y(max * f)}
            stroke="var(--line)"
            strokeDasharray="3 5"
          />
          <text x={4} y={y(max * f) + 4} fill="var(--dim)" fontSize="10">
            {Math.round(max * f)}
          </text>
        </g>
      ))}
      {data.rounds.map((round, i) => (
        <text key={round} x={x(i)} y={height - 8} fill="var(--dim)" fontSize="10" textAnchor="middle">
          R{round}
        </text>
      ))}
      {series.map((line) => (
        <g key={line.driver_id}>
          <polyline
            fill="none"
            stroke={colorFor(line.constructor)}
            strokeWidth="2.2"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={line.points.map((points, i) => `${x(i)},${y(points)}`).join(" ")}
          />
        </g>
      ))}
    </svg>
    </>
  );
}

/** Season standings from Jolpica. Separate from replay: no telemetry claims. */
export default function StandingsPanel({ year, meetingName, meetingDate }: Props) {
  const [round, setRound] = useState(0);
  const [table, setTable] = useState<StandingsPayload | null>(null);
  const [progress, setProgress] = useState<ProgressionPayload | null>(null);
  const [tab, setTab] = useState<"drivers" | "constructors">("drivers");
  const [message, setMessage] = useState<string | null>(null);
  const [progressError, setProgressError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    setMessage(null);
    setTable(null);
    setProgress(null);
    setProgressError(false);
    setRound(0);
    const needle = meetingName.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
    const date = meetingDate?.slice(0, 10) ?? "";
    api
      .archiveRaces(year)
      .then((data) => {
        if (!live) return;
        const exact = data.races.find(
          (race) => race.race_name.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim() === needle,
        );
        if (exact) {
          setRound(exact.round);
          return;
        }
        // Duplicate/renamed events: fall back to the nearest race date.
        const nearest = data.races
          .map((race) => ({
            race,
            days: race.date ? Math.abs(Date.parse(race.date) - Date.parse(date)) / 86400000 : Infinity,
          }))
          .sort((a, b) => a.days - b.days)[0];
        if (nearest && nearest.days <= 10) setRound(nearest.race.round);
        else setMessage("No championship round matches this weekend in the archive.");
      })
      .catch(() => live && setMessage("The standings source did not answer."));
    return () => {
      live = false;
    };
  }, [year, meetingName, meetingDate, reload]);

  useEffect(() => {
    if (!round) return;
    let live = true;
    api
      .standings(year, round)
      .then((result) => live && setTable(result))
      .catch(() => live && setMessage("The standings source did not answer."));
    api
      .standingsProgression(year, round)
      .then((result) => live && setProgress(result))
      .catch(() => live && setProgressError(true));
    return () => {
      live = false;
    };
  }, [year, round]);

  if (!meetingName) {
    return (
      <section className="standings-panel">
        <p className="dim">Championship standings are available once a race weekend is selected.</p>
      </section>
    );
  }

  if (message) {
    return (
      <section className="standings-panel">
        <p className="dim">{message}</p>
        <button type="button" className="primary" onClick={() => setReload((n) => n + 1)}>
          Retry
        </button>
      </section>
    );
  }

  if (!table) {
    return (
      <section className="standings-panel">
        <p className="dim">Loading championship standings…</p>
      </section>
    );
  }

  const rows =
    tab === "drivers"
      ? table.drivers.map((row) => ({ ...row, team: row.constructor }))
      : table.constructors.map((row) => ({ ...row, team: row.name }));
  return (
    <section className="standings-panel">
      <div className="standings-head">
        <div>
          <h2>Championship</h2>
          <p className="dim small">
            {table.year} · after round {round} · {table.drivers.length} drivers
          </p>
        </div>
        <div className="seg" role="group" aria-label="Standings table">
          <button type="button" aria-pressed={tab === "drivers"} onClick={() => setTab("drivers")}>
            Drivers
          </button>
          <button type="button" aria-pressed={tab === "constructors"} onClick={() => setTab("constructors")}>
            Teams
          </button>
        </div>
      </div>

      {rows.length ? (
        <div className="standings-table-scroll">
        <table className="standings-table mono">
          <thead>
            <tr>
              <th>Pos</th>
              <th>{tab === "drivers" ? "Driver" : "Team"}</th>
              {tab === "drivers" && <th>Team</th>}
              <th>Points</th>
              <th>Wins</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const team = row.team;
              return (
                <tr key={`${row.position}-${row.name}`}>
                  <td>{row.position}</td>
                  <td>
                    <i className="team-dot" style={{ background: colorFor(team) }} />
                    {row.name}
                  </td>
                  {tab === "drivers" && <td className="dim">{team}</td>}
                  <td>{row.points.toFixed(1)}</td>
                  <td>{row.wins}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      ) : (
        <p className="dim">No standings data is stored for this round.</p>
      )}

      {!progress && !progressError && (
        <p className="dim small">Building the season chart from cached rounds…</p>
      )}
      {progress && !progressError && progress.series.length > 0 && (
        <div className="standings-progress">
          <h3>Points by round</h3>
          <ProgressionChart data={progress} />
        </div>
      )}
      {progressError && <p className="dim small">The season progression could not be loaded.</p>}

      <p className="dim small standings-source">
        Standings:{" "}
        <a href={table.license_url ?? "https://creativecommons.org/licenses/by-nc-sa/4.0/"} target="_blank" rel="noreferrer">
          {table.source} · {table.license}
        </a>
        . Results/standings only; replay telemetry is available from 2023.
      </p>
    </section>
  );
}
