import { useEffect, useMemo, useRef, useState } from "react";
import { api, type PitStopSummary, type SessionResultRow } from "../api";
import { compoundColor, formatLapTime } from "../format";
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
    Promise.all([api.weather(sessionKey), api.raceControl(sessionKey)])
      .then(([w, rc]) => {
        if (!live) return;
        setWeather(w);
        setControl(rc);
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
      .aiRecap(sessionKey)
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
    return {
      points: geometry.outline.map(([x, y]) => `${(ox + x * scale).toFixed(1)},${(oy - y * scale).toFixed(1)}`).join(" "),
      width,
      height,
    };
  }, [geometry]);

  const range = weather
    .map((point) => Number(point.track_temperature))
    .filter((value) => Number.isFinite(value));

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
        <button type="button" className="primary" onClick={() => window.print()}>
          Print / Save PDF
        </button>
        <button type="button" className="archive-close" onClick={onClose} aria-label="Close report">
          Close ✕
        </button>
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
              <polyline points={track.points} fill="none" stroke="#263140" strokeWidth="3" strokeLinejoin="round" />
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
            <span>Pit stops</span>
            <strong>{pitSummary.reduce((sum, p) => sum + p.stops, 0)}</strong>
            <small>recorded stops</small>
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
            <h2>Engineer’s summary</h2>
            {summaryBusy && <p>Asking the engineer…</p>}
            {summaryError && <p className="report-note">{summaryError}</p>}
            {summary && <p>{summary}</p>}
            <p className="report-caption">AI narrative generated from the same session facts. The tables above are the measured source of truth.</p>
          </section>
        )}

        <footer className="report-footer">
          <span>BoxBox Replay · free, open-source · data: OpenF1</span>
          <span>Generated {new Date().toLocaleString()}</span>
        </footer>
      </article>
    </div>
  );
}
