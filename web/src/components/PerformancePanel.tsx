import { useEffect, useState } from "react";
import { api } from "../api";
import { compoundColor } from "../format";
import { stintSlope } from "../perf";
import type { Lap, Stint } from "../types";

interface Props {
  sessionKey: number;
  laps: Lap[];
  highlight: number[];
  towerOrder: number[];
}

interface Feed {
  stints: Stint[];
  weather: Record<string, unknown>[];
  radio: Record<string, unknown>[];
  rc: Record<string, unknown>[];
}

export default function PerformancePanel(p: Props) {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    setFeed(null);
    setError(false);
    Promise.all([
      api.stints(p.sessionKey),
      api.weather(p.sessionKey),
      api.radio(p.sessionKey),
      api.raceControl(p.sessionKey),
    ])
      .then(([stints, weather, radio, rc]) => live && setFeed({ stints, weather, radio, rc }))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [p.sessionKey]);

  if (error) return <p className="dim">Performance feeds unavailable for this session.</p>;
  if (!feed) return <p className="dim">Loading performance…</p>;

  const scope = p.highlight.length ? p.highlight : p.towerOrder.slice(0, 3);
  const scopedStints = feed.stints.filter((s) => scope.includes(s.driver_number));
  const slopes: { key: string; text: string }[] = [];
  let skipped = 0;
  for (const s of scopedStints) {
    const start = s.lap_start ?? 1;
    const end = s.lap_end ?? Number.MAX_SAFE_INTEGER;
    const seg = p.laps.filter(
      (l) => l.driver_number === s.driver_number && l.lap_number >= start && l.lap_number <= end,
    );
    try {
      slopes.push({ key: `${s.driver_number}-${s.lap_start}`, text: `#${s.driver_number} ${s.compound ?? "?"}: +${stintSlope(seg).toFixed(3)}s/lap` });
    } catch {
      skipped += 1;
    }
  }

  const w = (feed.weather as Record<string, number | string>[]).at(-1);
  const byDate = <T extends Record<string, unknown>>(rows: T[]): T[] =>
    [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(-15).reverse();
  const radioRows = byDate(feed.radio as Record<string, string | number>[]);
  const rcRows = byDate(feed.rc as Record<string, string | number | null>[]);

  const maxLap = Math.max(1, ...scopedStints.map((s) => s.lap_end ?? 0));
  const spanOf = (s: { lap_start: number | null; lap_end: number | null }) => {
    const start = s.lap_start ?? 1;
    const end = s.lap_end ?? maxLap;
    return { start, end, open: s.lap_end == null };
  };

  return (
    <div>
      <h3>Degradation slopes</h3>
      <p className="mono">{slopes.length ? slopes.map((s) => s.text).join(" · ") : "Not enough clean laps."}{skipped > 0 && ` (${skipped} short stint${skipped > 1 ? "s" : ""} skipped)`}</p>
      <h3>Stint timeline</h3>
      {scopedStints.map((s, i) => {
        const span = spanOf(s);
        return (
          <div key={i} className="row mono" style={{ fontSize: "0.8rem" }}>
            <span style={{ minWidth: "36px" }}>#{s.driver_number}</span>
            <div style={{ flex: 1, background: "#0B0E13", height: "14px", position: "relative" }}>
              <div
                title={`${s.compound} laps ${span.start}-${span.open ? "→" : span.end}`}
                style={{
                  position: "absolute",
                  left: `${((span.start - 1) / maxLap) * 100}%`,
                  width: `${Math.max(1, ((span.end - span.start + 1) / maxLap) * 100)}%`,
                  top: 0,
                  bottom: 0,
                  background: compoundColor(s.compound),
                }}
              />
            </div>
            <span className="dim">
              {s.compound} {span.start}-{span.open ? "→" : span.end}
            </span>
          </div>
        );
      })}
      {!p.highlight.length && (
        <p className="dim" style={{ fontSize: "0.75rem" }}>
          Showing {scope.length} drivers — highlight in the tower to inspect others.
        </p>
      )}
      {w && (
        <>
          <h3>Weather (latest)</h3>
          <p className="mono">
            Air {Number(w.air_temperature).toFixed(1)}°C · Track {Number(w.track_temperature).toFixed(1)}°C ·
            Humidity {Number(w.humidity).toFixed(0)}% · Rain {Number(w.rainfall).toFixed(0)}mm
          </p>
        </>
      )}
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <h3>Team radio</h3>
          {radioRows.length ? (
            radioRows.map((r, i) => (
              <p key={i} className="dim mono" style={{ fontSize: "0.8rem" }}>
                {String(r.date).slice(11, 19)} — #{r.driver_number} —{" "}
                <a href={String(r.recording_url)} target="_blank" rel="noreferrer">
                  audio
                </a>
              </p>
            ))
          ) : (
            <p className="dim">No radio events.</p>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <h3>Race control</h3>
          {rcRows.length ? (
            rcRows.map((r, i) => (
              <p key={i} className="dim mono" style={{ fontSize: "0.8rem" }}>
                {String(r.date).slice(11, 19)} — {String(r.category)}
                {r.flag ? ` ${r.flag}` : ""}: {String(r.message)}
              </p>
            ))
          ) : (
            <p className="dim">No race-control messages.</p>
          )}
        </div>
      </div>
      <p className="dim">Radio has no transcripts in the API — audio links only, nothing invented.</p>
    </div>
  );
}
