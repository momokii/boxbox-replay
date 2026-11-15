import { useEffect, useState } from "react";
import { api } from "../api";
import { formatClock } from "../session";
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
  const [hoverBand, setHoverBand] = useState<{ x: number; band: Band } | null>(null);
  const [hoverWeather, setHoverWeather] = useState<{ x: number; t: number; track: number | null; air: number | null } | null>(null);

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
  const bandLabel = (kind: Band["kind"]) =>
    kind === "sc" ? "Safety car" : kind === "vsc" ? "Virtual safety car" : "Red flag";
  const nearestWeather = (t: number) => {
    const points = data.weather.filter((point) => point.track != null);
    if (!points.length) return null;
    return points.reduce((best, point) =>
      Math.abs(point.t - t) < Math.abs(best.t - t) ? point : best,
    );
  };

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

      <div
        className="timeline-track"
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const pct = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 100;
          const t = (pct / 100) * span;
          const near = nearestWeather(t);
          setHoverWeather(
            near
              ? { x: pct, t: near.t, track: near.track ?? null, air: near.air ?? null }
              : null,
          );
          setHoverBand(null);
        }}
        onPointerLeave={() => {
          setHoverWeather(null);
          setHoverBand(null);
        }}
      >
        {bands.map((band, index) => (
          <span
            key={`${band.start}-${index}`}
            className={`timeline-band ${band.kind}`}
            style={{
              left: `${(band.start / span) * 100}%`,
              width: `${Math.max(0.4, ((band.end - band.start) / span) * 100)}%`,
            }}
            onPointerMove={(event) => {
              event.stopPropagation();
              const track = event.currentTarget.parentElement;
              if (!track) return;
              const rect = track.getBoundingClientRect();
              const pct = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 100;
              setHoverBand({ x: pct, band });
              setHoverWeather(null);
            }}
            title={`${bandLabel(band.kind)} · ${formatClock(band.start)}–${formatClock(band.end)}`}
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
        {hoverBand && (
          <div className="chart-tip timeline-tip" style={{ left: `${Math.min(88, Math.max(12, hoverBand.x))}%` }}>
            <strong>{bandLabel(hoverBand.band.kind)}</strong>
            <div>{formatClock(hoverBand.band.start)}–{formatClock(hoverBand.band.end)}</div>
            <div className="dim small">
              {Math.round(hoverBand.band.end - hoverBand.band.start)}s ·{" "}
              {hoverBand.band.kind === "red" ? "session stopped" : "neutralised running"}
            </div>
          </div>
        )}
        {hoverWeather && !hoverBand && (
          <div className="chart-tip timeline-tip" style={{ left: `${Math.min(88, Math.max(12, hoverWeather.x))}%` }}>
            <strong>{formatClock(hoverWeather.t)}</strong>
            <div>Track {hoverWeather.track == null ? "—" : `${hoverWeather.track.toFixed(1)}°C`}</div>
            <div>Air {hoverWeather.air == null ? "—" : `${hoverWeather.air.toFixed(1)}°C`}</div>
          </div>
        )}
      </div>

      <div className="timeline-legend" aria-label="Race-control band legend">
        <span><i style={{ background: "var(--amber)" }} /> VSC</span>
        <span><i style={{ background: "#b388ff" }} /> Safety car</span>
        <span><i style={{ background: "#ff5a52" }} /> Red flag (session stopped)</span>
        <span><i style={{ background: "var(--yellow, #ffd166)" }} /> Yellow flag</span>
      </div>

      <div className="timeline-axis">
        <span>0:00</span>
        <span className="dim">track {minTemp.toFixed(1)}–{maxTemp.toFixed(1)}°C · hover a band or the line</span>
        <span>{Math.floor(span / 60)}:{String(Math.round(span % 60)).padStart(2, "0")}</span>
      </div>
    </section>
  );
}
