import { useEffect, useMemo, useRef, useState } from "react";
import { api, type PitStop, type PitStopSummary, type SessionResultRow } from "../api";
import { compoundColor, formatLapTime } from "../format";
import DownloadPanel from "./DownloadPanel";
import { buildSessionDatasets } from "../downloads";
import type { Driver, Geometry, Lap, SessionInfoFull, Stint } from "../types";

interface Props {
  sessionKey: number;
  gpName: string;
  sessName: string;
  info: SessionInfoFull | null;
  drivers: Driver[];
  result: SessionResultRow[];
  laps: Lap[];
  stints: Stint[];
  pitSummary: PitStopSummary[];
  pitStops: PitStop[];
  overtakeCounts: { driver_number: number; made: number; lost: number }[];
  geometry: Geometry | null;
  onClose: () => void;
}

type Mode = "data" | "ai";

function dateLabel(raw: string | undefined): string {
  if (!raw) return "—";
  const date = new Date(raw);
  return Number.isNaN(date.getTime())
    ? raw.slice(0, 10)
    : date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

/** Printable A4 data report. Print/Save as PDF uses the browser's PDF destination. */
export default function SessionReport({
  sessionKey,
  gpName,
  sessName,
  info,
  drivers,
  result,
  laps,
  stints,
  pitSummary,
  pitStops,
  overtakeCounts,
  geometry,
  onClose,
}: Props) {
  const [mode, setMode] = useState<Mode>("data");
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [weather, setWeather] = useState<Record<string, unknown>[]>([]);
  const [control, setControl] = useState<Record<string, unknown>[]>([]);
  const [radio, setRadio] = useState<Record<string, unknown>[]>([]);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const summaryRequested = useRef<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let live = true;
    Promise.all([api.weather(sessionKey), api.raceControl(sessionKey), api.radio(sessionKey)])
      .then(([w, rc, radioRows]) => {
        if (!live) return;
        setWeather(w);
        setControl(rc);
        setRadio(radioRows);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [sessionKey]);

  useEffect(() => {
    if (mode !== "ai") return;
    const key = String(sessionKey);
    if (summaryRequested.current === key) return;
    summaryRequested.current = key;
    let live = true;
    setSummaryBusy(true);
    setSummaryError(null);
    api
      .aiReport(sessionKey)
      .then((data) => live && setSummary(data.answer))
      .catch((error: unknown) => {
        if (!live) return;
        summaryRequested.current = null;
        const message = error instanceof Error ? error.message : "";
        setSummaryError(
          message.includes("429")
            ? "The engineer has reached its usage limit. The data report is unaffected."
            : message.includes("503")
              ? "AI is not configured on this deployment. The data report is unaffected."
              : "The engineer could not write the summary. The data report is unaffected.",
        );
      })
      .finally(() => live && setSummaryBusy(false));
    return () => {
      live = false;
    };
  }, [mode, sessionKey]);

  const isRace = /race|sprint/i.test(sessName);
  const byNumber = useMemo(() => new Map(drivers.map((d) => [d.driver_number, d])), [drivers]);
  const code = (number: number) => byNumber.get(number)?.name_acronym ?? `#${number}`;
  const name = (number: number) => byNumber.get(number)?.full_name ?? code(number);
  const ranked = useMemo(
    () =>
      [...result]
        .filter((row) => row.position != null)
        .sort((a, b) => (a.position ?? 999) - (b.position ?? 999)),
    [result],
  );
  const classified = ranked.length;
  const fastest = useMemo(
    () =>
      laps
        .filter((lap): lap is Lap & { lap_duration: number } => lap.lap_duration != null)
        .sort((a, b) => a.lap_duration - b.lap_duration)[0] ?? null,
    [laps],
  );
  const fastestFive = useMemo(
    () =>
      laps
        .filter((lap) => lap.lap_duration != null)
        .sort((a, b) => (a.lap_duration ?? 0) - (b.lap_duration ?? 0))
        .slice(0, 5),
    [laps],
  );
  const stintRows = useMemo(
    () =>
      ranked
        .map((row) => {
          const mine = stints
            .filter((s) => s.driver_number === row.driver_number)
            .sort((a, b) => (a.stint_number ?? 0) - (b.stint_number ?? 0));
          const pit = pitSummary.find((p) => p.driver_number === row.driver_number);
          const overtakes = overtakeCounts.find((o) => o.driver_number === row.driver_number);
          return { row, mine, pit, overtakes };
        })
        .filter((entry) => entry.mine.length),
    [ranked, stints, pitSummary, overtakeCounts],
  );
  const redFlags = control.filter((event) => /red flag/i.test(String(event.message ?? ""))).length;
  const safetyCars = control.filter((event) => /safety car|virtual safety car/i.test(String(event.message ?? ""))).length;
  const mostOvertakes = [...overtakeCounts].sort((a, b) => b.made - a.made)[0] ?? null;
  const winnerStints = ranked[0]
    ? stints.filter((s) => s.driver_number === ranked[0].driver_number).sort((a, b) => (a.stint_number ?? 0) - (b.stint_number ?? 0))
    : [];
  const retired = result.filter((row) => row.dnf || row.dns || row.dsq);
  const timedStops = pitStops.filter((stop) => stop.stop_duration != null && stop.stop_duration > 0).length;
  const printDisabled = mode === "ai" && (summaryBusy || (!summary && !summaryError));
  const fastestRow = fastest ? byNumber.get(fastest.driver_number) : null;

  const track = useMemo(() => {
    if (!geometry?.outline.length) return null;
    const xs = geometry.outline.map((p) => p[0]);
    const ys = geometry.outline.map((p) => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const width = 720;
    const height = 240;
    const scale = Math.min((width - 20) / Math.max(1, maxX - minX), (height - 20) / Math.max(1, maxY - minY));
    const ox = 10 + (width - 20 - (maxX - minX) * scale) / 2 - minX * scale;
    const oy = 10 + (height - 20 - (maxY - minY) * scale) / 2 + maxY * scale;
    const points = geometry.outline.map(([x, y]) => [
      Number((ox + x * scale).toFixed(1)),
      Number((oy - y * scale).toFixed(1)),
    ] as const);
    return {
      points: points.map(([x, y]) => `${x},${y}`).join(" "),
      first: points[0],
      last: points[points.length - 1],
      width,
      height,
    };
  }, [geometry]);

  const range = weather
    .map((point) => Number(point.track_temperature))
    .filter((value) => Number.isFinite(value));

  const datasets = buildSessionDatasets({
    laps,
    stints,
    weather,
    control,
    radio,
    pitStops,
    pitSummary,
    overtakeCounts,
    result,
  });

  return (
    <div className="report-overlay" role="dialog" aria-modal="true" aria-label="Session report">
      <div className="report-controls">
        <div>
          <strong>Session report</strong>
          <span className="dim small"> · {gpName} · {sessName}</span>
        </div>
        <div className="seg" role="group" aria-label="Report mode">
          <button type="button" aria-pressed={mode === "data"} onClick={() => setMode("data")}>
            Data
          </button>
          <button type="button" aria-pressed={mode === "ai"} onClick={() => setMode("ai")}>
            AI-enhanced
          </button>
        </div>
        <button type="button" className="player-action" onClick={() => setDownloadOpen(true)}>
          Download data
        </button>
        <button type="button" className="primary" onClick={() => window.print()} disabled={printDisabled} title={printDisabled ? "Wait for the AI analysis to finish" : "Print or save the report as PDF"}>
          {printDisabled ? "Generating…" : "Print / Save PDF"}
        </button>
        <button type="button" className="archive-close" onClick={onClose} aria-label="Close report">
          Close ✕
        </button>
        <span className="report-mode-help">
          Data mode is measured tables only. AI-enhanced adds a three-part
          analysis; the tables never change.
        </span>
      </div>

      <article className="report-sheet">
        <header className="report-title">
          <div>
            <span className="report-kicker">BoxBox Replay · session report</span>
            <h1>{gpName}</h1>
            <p>{sessName} · {dateLabel(info?.date_start)} · {info?.total_laps ?? ranked.length} laps · {info?.drivers ?? drivers.length} drivers</p>
          </div>
          <div className="report-mode-stamp">{mode === "ai" ? "AI-enhanced" : "Data report"}</div>
        </header>

        {track && (
          <section className="report-track" aria-label="Circuit outline">
            <svg viewBox={`0 0 ${track.width} ${track.height}`} role="img" aria-label="Circuit outline">
              <polygon points={track.points} fill="none" stroke="#263140" strokeWidth="3" strokeLinejoin="round" />
              <line x1={track.last[0]} y1={track.last[1]} x2={track.first[0]} y2={track.first[1]} stroke="#263140" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <p className="report-caption">Circuit outline from the session’s own telemetry. No track map is inferred or downloaded.</p>
          </section>
        )}

        <section className="report-grid">
          <div className="report-card">
            <span>{isRace ? "Winner" : "Session leader"}</span>
            <strong>{ranked[0] ? name(ranked[0].driver_number) : "—"}</strong>
            <small>{ranked[0] ? code(ranked[0].driver_number) : ""}</small>
          </div>
          <div className="report-card">
            <span>Fastest lap</span>
            <strong>{fastest ? formatLapTime(fastest.lap_duration) : "—"}</strong>
            <small>{fastest ? `${code(fastest.driver_number)} · lap ${fastest.lap_number}` : "no timed laps"}</small>
          </div>
          <div className="report-card">
            <span>Classification</span>
            <strong>{classified}/{drivers.length}</strong>
            <small>classified finishers</small>
          </div>
          <div className="report-card">
            <span>Pit visits</span>
            <strong>{pitSummary.reduce((sum, p) => sum + p.stops, 0)}</strong>
            <small>{timedStops ? `${timedStops} with a timed stationary stop` : "no timed stops published"}</small>
          </div>
          <div className="report-card">
            <span>Race control</span>
            <strong>{redFlags} red · {safetyCars} SC/VSC</strong>
            <small>from the timing feed</small>
          </div>
          <div className="report-card">
            <span>Weather</span>
            <strong>{range.length ? `${Math.min(...range).toFixed(1)}–${Math.max(...range).toFixed(1)}°C` : "—"}</strong>
            <small>track temperature</small>
          </div>
        </section>

        <section className="report-highlights">
          <h2>Key takeaways</h2>
          <ul>
            <li>
              <strong>{ranked[0] ? name(ranked[0].driver_number) : "No classified winner"}</strong>
              {ranked[0] ? ` won from P${ranked[0].position}; ${classified} of ${drivers.length} drivers were classified.` : " is not available in this feed."}
            </li>
            <li>
              <strong>Fastest lap:</strong>{" "}
              {fastest ? `${fastestRow?.full_name ?? code(fastest.driver_number)} · ${formatLapTime(fastest.lap_duration)} on lap ${fastest.lap_number}.` : "no timed lap was published."}
            </li>
            <li>
              <strong>Tyres and pits:</strong>{" "}
              {winnerStints.length
                ? `${name(ranked[0].driver_number)} ran ${winnerStints.map((s) => s.compound ?? "?").join(" → ")}; the feed recorded ${pitSummary.reduce((sum, p) => sum + p.stops, 0)} pit visits${timedStops ? ` (${timedStops} with a timed stationary stop)` : " with no timed stationary stops"}.`
                : `The feed recorded ${pitSummary.reduce((sum, p) => sum + p.stops, 0)} pit visits${timedStops ? `, ${timedStops} timed` : ", none timed"}.`}
            </li>
            <li>
              <strong>Overtaking:</strong>{" "}
              {mostOvertakes ? `${code(mostOvertakes.driver_number)} led the feed with ${mostOvertakes.made} made and ${mostOvertakes.lost} lost (counts may be incomplete).` : "no overtake counts were published."}
            </li>
            <li>
              <strong>Race control:</strong> {redFlags} red flag(s), {safetyCars} safety-car/VSC message(s).
            </li>
          </ul>
        </section>

        <section className="report-section">
          <h2>Classification</h2>
          <table className="report-table">
            <thead>
              <tr><th>Pos</th><th>Driver</th><th>Team</th><th>Gap / status</th><th>Points</th></tr>
            </thead>
            <tbody>
              {ranked.map((row) => {
                const driver = byNumber.get(row.driver_number);
                return (
                  <tr key={row.driver_number}>
                    <td>{row.position}</td>
                    <td>{driver?.full_name ?? code(row.driver_number)} <span className="dim">({code(row.driver_number)})</span></td>
                    <td>{driver?.team_name ?? "—"}</td>
                    <td>{row.dnf ? "DNF" : row.dns ? "DNS" : row.dsq ? "DSQ" : row.gap_text ?? "—"}</td>
                    <td>{row.points ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {retired.length > 0 && (
            <p className="report-caption">
              Not classified: {retired.map((row) => `${code(row.driver_number)}${row.dnf ? " (DNF)" : row.dns ? " (DNS)" : " (DSQ)"}`).join(", ")}.
            </p>
          )}
        </section>

        <section className="report-section">
          <h2>Tyres &amp; pit stops</h2>
          <table className="report-table">
            <thead>
              <tr><th>Pos</th><th>Driver</th><th>Stints</th><th>Stops</th><th>Best stop</th><th>Overtakes</th></tr>
            </thead>
            <tbody>
              {stintRows.slice(0, 10).map(({ row, mine, pit, overtakes }) => (
                <tr key={row.driver_number}>
                  <td>{row.position ?? "—"}</td>
                  <td>{code(row.driver_number)}</td>
                  <td className="report-compounds">
                    {mine.map((s) => (
                      <span key={s.stint_number}>
                        <i style={{ background: compoundColor(s.compound ?? "") }} />
                        {s.compound ?? "?"} {s.lap_start ?? "—"}–{s.lap_end ?? "—"}
                      </span>
                    ))}
                  </td>
                  <td>{pit?.stops ?? "—"}</td>
                  <td>{pit?.best_stop_s == null ? "—" : `${pit.best_stop_s.toFixed(1)}s`}</td>
                  <td>{overtakes ? `${overtakes.made} / ${overtakes.lost}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="report-caption">Stints are continuous tyre runs. Best stop is the fastest stationary time, not the full pit-lane loss. Overtakes are feed counts and may be incomplete.</p>
        </section>

        <section className="report-section">
          <h2>Fastest laps</h2>
          <table className="report-table">
            <thead>
              <tr><th>#</th><th>Driver</th><th>Lap</th><th>Time</th></tr>
            </thead>
            <tbody>
              {fastestFive.map((lap, index) => (
                <tr key={`${lap.driver_number}-${lap.lap_number}`}>
                  <td>{index + 1}</td>
                  <td>{name(lap.driver_number)}</td>
                  <td>{lap.lap_number}</td>
                  <td>{formatLapTime(lap.lap_duration)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {mode === "ai" && (
          <section className="report-ai">
            <h2>Engineer’s analysis</h2>
            {summaryBusy && <p>Asking the engineer…</p>}
            {summaryError && <p className="report-note">{summaryError}</p>}
            {summary && <p>{summary}</p>}
            <p className="report-caption">
              AI analysis generated from the same session facts: what decided it,
              the tyre/pit story, and what the data cannot show. The tables above
              remain the measured source of truth.
            </p>
          </section>
        )}

        <aside className="report-glossary">
          <h2>How to read this report</h2>
          <p>
            <strong>Classification</strong> is the official session order; “gap/status”
            is the recorded gap or a retirement reason, not a computed pace value.
            <strong>Fastest lap</strong> is the quickest timed lap in the session.
            <strong>Stint</strong> is a continuous run on one tyre set; a
            <strong>stop</strong> is a recorded pit visit and <strong>best stop</strong>
            is stationary time, not the full pit-lane loss. <strong>Overtakes</strong>
            are feed counts and may be incomplete. <strong>SC/VSC</strong> and red flags
            are race-control messages, not inferred incidents.
          </p>
          <p>
            Percentage/pace data is only as good as the published feed. If a channel
            is missing or internally inconsistent, the report says so rather than
            filling the gap.
          </p>
        </aside>

        <footer className="report-footer">
          <span>BoxBox Replay · free, open-source · data: OpenF1</span>
          <span>Generated {new Date().toLocaleString()}</span>
        </footer>
      </article>
      <DownloadPanel
        open={downloadOpen}
        onClose={() => setDownloadOpen(false)}
        sessionKey={sessionKey}
        sessionName={`${gpName} ${sessName}`}
        datasets={datasets}
      />
    </div>
  );
}
