import { useEffect, useState } from "react";
import { api } from "../api";
import type { SessionTimeline } from "../types";

interface Props {
  sessionKey: number;
  duration: number;
}

interface Band {
  start: number;
  end: number;
  kind: "sc" | "vsc" | "red";
}

function buildBands(data: SessionTimeline): Band[] {
  const bands: Band[] = [];
  let open: { start: number; kind: Band["kind"] } | null = null;
  for (const event of data.events) {
    const message = event.message.toUpperCase();
    if (message.includes("DEPLOYED") || message.includes("RED FLAG")) {
      const kind: Band["kind"] = message.includes("RED FLAG")
        ? "red"
        : message.includes("VSC") || message.includes("VIRTUAL")
          ? "vsc"
          : "sc";
      if (!open) open = { start: event.t, kind };
    } else if (
      open &&
      (message.includes("ENDING") ||
        message.includes("IN THIS LAP") ||
        message.includes("TRACK CLEAR") ||
        message.includes("GREEN"))
    ) {
      bands.push({ start: open.start, end: event.t, kind: open.kind });
      open = null;
    }
  }
  if (open) bands.push({ start: open.start, end: data.duration_s, kind: open.kind });
  return bands;
}

/** Descriptive weather + race-control timeline. No prediction, no invented events. */
export default function TimelinePanel({ sessionKey, duration }: Props) {
  const [data, setData] = useState<SessionTimeline | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .sessionTimeline(sessionKey)
      .then((result) => live && setData(result))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [sessionKey]);

  if (error || !data) return null;
  if (!data.events.length && !data.weather.length) return null;

  const span = Math.max(1, data.duration_s || duration);
  const bands = buildBands(data);
  const temps = data.weather
    .map((point) => point.track)
    .filter((value): value is number => value != null);
  const minTemp = temps.length ? Math.min(...temps) : 0;
  const maxTemp = temps.length ? Math.max(...temps) : 1;
  const range = Math.max(1, maxTemp - minTemp);
  const line = data.weather
    .filter((point) => point.track != null)
    .map((point) => {
      const x = (point.t / span) * 100;
      const y = 28 - ((point.track! - minTemp) / range) * 22;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const markers = data.events
    .filter((event) => /SAFETY CAR|VSC|RED FLAG|YELLOW/i.test(event.message))
    .slice(0, 60);

  return (
    <section className="timeline-panel" aria-label="Weather and race control timeline">
      <div className="timeline-head">
        <h3>Weather &amp; race control</h3>
        <div className="timeline-counts">
          <span>{data.counts.vsc} VSC</span>
          <span>{data.counts.safety_car} SC</span>
          <span>{data.counts.red_flag} red</span>
          <span>{data.counts.yellow} yellow</span>
        </div>
      </div>

      <div className="timeline-track">
        {bands.map((band, index) => (
          <span
            key={`${band.start}-${index}`}
            className={`timeline-band ${band.kind}`}
            style={{
              left: `${(band.start / span) * 100}%`,
              width: `${Math.max(0.4, ((band.end - band.start) / span) * 100)}%`,
            }}
            title={`${band.kind.toUpperCase()} ${Math.round(band.start)}s–${Math.round(band.end)}s`}
          />
        ))}
        {markers.map((event, index) => (
          <span
            key={`${event.t}-${index}`}
            className="timeline-marker"
            style={{ left: `${(event.t / span) * 100}%` }}
            title={`${Math.round(event.t)}s · ${event.category} · ${event.message}`}
          />
        ))}
        {line && (
          <svg className="timeline-weather" viewBox="0 0 100 30" preserveAspectRatio="none">
            <polyline points={line} fill="none" stroke="var(--dim)" strokeWidth="0.6" />
          </svg>
        )}
      </div>

      <div className="timeline-axis">
        <span>0:00</span>
        <span className="dim">track {minTemp.toFixed(1)}–{maxTemp.toFixed(1)}°C</span>
        <span>{Math.floor(span / 60)}:{String(Math.round(span % 60)).padStart(2, "0")}</span>
      </div>
    </section>
  );
}
