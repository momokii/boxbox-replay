import { useEffect, useMemo, useRef, useState } from "react";
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

function checkedLabel(iso?: string): string {
  if (!iso) return "just now";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "just now";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** One selectable driver line + the round tooltip. */
function ProgressionChart({
  data,
  selected,
}: {
  data: ProgressionPayload;
  selected: string[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const series = data.series.filter((s) => selected.includes(s.driver_id));
  if (!data.rounds.length || !series.length) return null;
  const width = 760;
  const height = 260;
  const pad = { l: 42, r: 18, t: 14, b: 34 };
  const max = Math.max(1, ...series.flatMap((s) => s.points));
  const x = (i: number) =>
    pad.l + (data.rounds.length === 1 ? 0 : (i / (data.rounds.length - 1)) * (width - pad.l - pad.r));
  const y = (points: number) => height - pad.b - (points / max) * (height - pad.t - pad.b);
  const hoverRound = hover == null ? null : data.rounds[hover];
  const race = data.races?.find((r) => r.round === hoverRound);
  const leaders = hover == null ? [] : series.map((s) => ({ ...s, value: s.points[hover] ?? 0 }));
  const best = leaders.length ? Math.max(...leaders.map((l) => l.value)) : 0;

  return (
    <div
      className="chart-wrap"
      ref={wrap}
      onPointerMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const ratio = (px - pad.l) / Math.max(1, rect.width - pad.l - pad.r);
        const index = Math.round(ratio * (data.rounds.length - 1));
        setHover(Math.max(0, Math.min(data.rounds.length - 1, index)));
      }}
      onPointerLeave={() => setHover(null)}
    >
      <svg
        className="standings-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Championship points after each round"
      >
        <title>Championship points after each round</title>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
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
            {hover != null && (
              <circle
                cx={x(hover)}
                cy={y(line.points[hover] ?? 0)}
                r="3.5"
                fill={colorFor(line.constructor)}
                stroke="var(--panel)"
                strokeWidth="1.5"
              />
            )}
          </g>
        ))}
        {hover != null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={pad.t}
            y2={height - pad.b}
            stroke="var(--amber)"
            strokeDasharray="3 3"
          />
        )}
      </svg>
      {hover != null && leaders.length > 0 && (
        <div
          className="chart-tip standings-tip"
          style={{ left: Math.min(Math.max(((x(hover) / width) * 100), 10), 78) + "%" }}
        >
          <strong>
            R{hoverRound} {race ? `· ${race.race_name}` : ""}
          </strong>
          {race?.date && <div className="dim small">{race.date}</div>}
          {leaders
            .slice()
            .sort((a, b) => b.value - a.value)
            .map((line) => (
              <div key={line.driver_id}>
                <i style={{ background: colorFor(line.constructor) }} /> {line.code}{" "}
                <b>{line.value.toFixed(1)}</b>
                {best > line.value && <span className="dim"> −{(best - line.value).toFixed(1)}</span>}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

/** Season standings from Jolpica. Separate from replay: no telemetry claims. */
export default function StandingsPanel({ year, meetingName, meetingDate }: Props) {
  const [round, setRound] = useState(0);
  const [table, setTable] = useState<StandingsPayload | null>(null);
  const [progress, setProgress] = useState<ProgressionPayload | null>(null);
  const [tab, setTab] = useState<"drivers" | "constructors">("drivers");
  const [message, setMessage] = useState<string | null>(null);
  const [loadingTable, setLoadingTable] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tableTick, setTableTick] = useState(0);
  const [progressTick, setProgressTick] = useState(0);
  const [resolveTick, setResolveTick] = useState(0);
  const [checkedAt, setCheckedAt] = useState<string | undefined>();
  const [selected, setSelected] = useState<string[]>([]);
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");

  useEffect(() => {
    let live = true;
    setMessage(null);
    setTable(null);
    setProgress(null);
    setRound(0);
    setCheckedAt(undefined);
    const needle = meetingName.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
    const date = meetingDate?.slice(0, 10) ?? "";
    api
      .archiveRaces(year, resolveTick > 0)
      .then((data) => {
        if (!live) return;
        const exact = data.races.find(
          (race) => race.race_name.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim() === needle,
        );
        if (exact) {
          setRound(exact.round);
          return;
        }
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
  }, [year, meetingName, meetingDate, resolveTick]);

  useEffect(() => {
    if (!round) return;
    let live = true;
    setLoadingTable(true);
    api
      .standings(year, round, tableTick > 0)
      .then((result) => {
        if (!live) return;
        setTable(result);
        setCheckedAt(result.fetched_at);
        setMessage(null);
      })
      .catch(() => live && setMessage("The standings source did not answer."))
      .finally(() => live && setLoadingTable(false));
    return () => {
      live = false;
    };
  }, [year, round, tableTick]);

  useEffect(() => {
    if (!round) return;
    let live = true;
    setLoadingProgress(true);
    api
      .standingsProgression(year, round, progressTick > 0)
      .then((result) => {
        if (!live) return;
        setProgress(result);
        setSelected((current) => {
          const available = result.series.map((s) => s.driver_id);
          const kept = current.filter((id) => available.includes(id));
          return kept.length ? kept : available.slice(0, 5);
        });
        setCompareA((current) => (current && result.series.some((s) => s.driver_id === current) ? current : result.series[0]?.driver_id ?? ""));
        setCompareB((current) => (current && result.series.some((s) => s.driver_id === current) ? current : result.series[1]?.driver_id ?? ""));
      })
      .catch(() => undefined)
      .finally(() => live && setLoadingProgress(false));
    return () => {
      live = false;
    };
  }, [year, round, progressTick]);

  useEffect(() => {
    if (refreshing && !loadingTable && !loadingProgress) setRefreshing(false);
  }, [refreshing, loadingTable, loadingProgress]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !checkedAt) return;
      if (Date.now() - Date.parse(checkedAt) > 5 * 60 * 1000) setTableTick((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(onVisible, 5 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [checkedAt]);

  const refresh = () => {
    setRefreshing(true);
    setLoadingTable(true);
    setLoadingProgress(true);
    setResolveTick((n) => n + 1);
    setTableTick((n) => n + 1);
    setProgressTick((n) => n + 1);
  };

  const rows =
    tab === "drivers"
      ? (table?.drivers ?? []).map((row) => ({ ...row, team: row.constructor }))
      : (table?.constructors ?? []).map((row) => ({ ...row, team: row.name }));
  const a = progress?.series.find((s) => s.driver_id === compareA);
  const b = progress?.series.find((s) => s.driver_id === compareB);
  const raceOf = (r: number) => progress?.races?.find((race) => race.round === r);
  const comparison = useMemo(
    () =>
      progress && a && b
        ? progress.rounds.map((r, i) => ({
            round: r,
            race: progress.races?.find((race) => race.round === r)?.race_name ?? `Round ${r}`,
            a: a.points[i] ?? 0,
            b: b.points[i] ?? 0,
          }))
        : [],
    [progress, a, b],
  );

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
        <button type="button" className="primary" onClick={refresh}>
          Retry
        </button>
      </section>
    );
  }

  if (!table) {
    return (
      <section className="standings-panel" aria-busy="true">
        <p className="dim">Loading championship standings…</p>
      </section>
    );
  }

  const series = progress?.series ?? [];
  return (
    <section className="standings-panel" aria-busy={loadingTable || loadingProgress}>
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

      <div className="standings-status">
        <span
          className="dim small"
          title="The archive is revalidated at most hourly; Refresh bypasses the cache and asks the source now."
        >
          Checked {checkedLabel(checkedAt)} · cache ≤1h
        </span>
        <button type="button" className="ghost small" onClick={refresh} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
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
              {rows.map((row) => (
                <tr key={`${row.position}-${row.name}`}>
                  <td>{row.position}</td>
                  <td>
                    <i className="team-dot" style={{ background: colorFor(row.team) }} />
                    {row.name}
                  </td>
                  {tab === "drivers" && <td className="dim">{row.team}</td>}
                  <td>{row.points.toFixed(1)}</td>
                  <td>{row.wins}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="dim">No standings data is stored for this round.</p>
      )}

      <div className="standings-progress">
        <div className="standings-progress-head">
          <h3>Points by round</h3>
          <div className="chart-drivers" aria-label="Drivers shown in the chart">
            <button
              type="button"
              className={selected.length === Math.min(5, series.length) ? "on" : ""}
              onClick={() => setSelected(series.slice(0, 5).map((s) => s.driver_id))}
            >
              Top 5
            </button>
            <button
              type="button"
              className={selected.length === series.length ? "on" : ""}
              onClick={() => setSelected(series.map((s) => s.driver_id))}
            >
              All
            </button>
            {series.map((line) => (
              <button
                key={line.driver_id}
                type="button"
                aria-pressed={selected.includes(line.driver_id)}
                className={selected.includes(line.driver_id) ? "on" : ""}
                style={selected.includes(line.driver_id) ? { borderColor: colorFor(line.constructor) } : undefined}
                onClick={() =>
                  setSelected((current) =>
                    current.includes(line.driver_id)
                      ? current.length > 1
                        ? current.filter((id) => id !== line.driver_id)
                        : current
                      : [...current, line.driver_id],
                  )
                }
              >
                {line.code}
              </button>
            ))}
          </div>
        </div>
        {loadingProgress && !progress && <p className="dim small">Building the season chart from cached rounds…</p>}
        {progress && <ProgressionChart data={progress} selected={selected} />}
      </div>

      {progress && series.length > 1 && (
        <div className="standings-compare">
          <div className="standings-progress-head">
            <h3>Head-to-head</h3>
            <div className="standings-compare-picks">
              <label>
                A
                <select value={compareA} onChange={(e) => setCompareA(e.target.value)}>
                  {series.map((s) => (
                    <option key={s.driver_id} value={s.driver_id}>
                      {s.code} · {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                B
                <select value={compareB} onChange={(e) => setCompareB(e.target.value)}>
                  {series.map((s) => (
                    <option key={s.driver_id} value={s.driver_id}>
                      {s.code} · {s.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <div className="standings-table-scroll" style={{ maxHeight: 260 }}>
            <table className="standings-table mono">
              <thead>
                <tr>
                  <th>Round</th>
                  <th>Race</th>
                  <th>{a?.code ?? "A"}</th>
                  <th>{b?.code ?? "B"}</th>
                  <th>Δ B−A</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((row) => (
                  <tr key={row.round}>
                    <td>R{row.round}</td>
                    <td>{raceOf(row.round)?.race_name ?? row.race}</td>
                    <td>{row.a.toFixed(1)}</td>
                    <td>{row.b.toFixed(1)}</td>
                    <td>{row.b - row.a >= 0 ? "+" : "−"}{Math.abs(row.b - row.a).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
