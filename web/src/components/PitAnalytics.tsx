import { useMemo } from "react";
import type { PitStop } from "../api";
import { pitStats } from "../pitstats";

interface Props {
  stops: PitStop[];
  overtakeCounts: { driver_number: number; made: number; lost: number }[];
  driverCode: (driver: number) => string;
}

/** Descriptive pit-crew and overtake summaries from cached feeds. */
export default function PitAnalytics({ stops, overtakeCounts, driverCode }: Props) {
  const stats = useMemo(() => pitStats(stops), [stops]);
  const quickest = useMemo(
    () =>
      stops
        .filter((stop) => stop.stop_duration != null && stop.stop_duration > 0)
        .sort((a, b) => (a.stop_duration ?? 0) - (b.stop_duration ?? 0))
        .slice(0, 6),
    [stops],
  );
  const overtakes = useMemo(
    () => [...overtakeCounts].sort((a, b) => b.made - a.made).slice(0, 5),
    [overtakeCounts],
  );
  if (!stats.count && !overtakeCounts.length) return null;

  return (
    <section className="pit-analytics" aria-label="Pit crew and overtakes">
      <h3>Pit crews &amp; overtakes</h3>
      <p className="dim small">
        <strong>Timed stops</strong> are recorded pit visits with a stationary
        duration; <strong>median</strong> and <strong>best</strong> describe those
        stationary times, not the full pit-lane loss. Stops above 1.5× the median
        are flagged as outliers. <strong>Overtakes made/lost</strong> are timing-feed
        counts and may be incomplete.
      </p>
      <div className="pit-analytics-grid">
        <div>
          <p className="dim small">
            {stats.count} timed stops · median{" "}
            {stats.median == null ? "—" : `${stats.median.toFixed(2)}s`} · best{" "}
            {stats.best == null ? "—" : `${stats.best.toFixed(2)}s`}
          </p>
          {stats.count === 0 && (
            <p className="dim small">
              The feed did not publish timed pit stops for this session, so median
              and best are unavailable rather than zero.
            </p>
          )}
          <table className="laps mono">
            <thead>
              <tr><th>Driver</th><th>Lap</th><th>Stationary</th></tr>
            </thead>
            <tbody>
              {quickest.map((stop, index) => (
                <tr
                  key={`${stop.driver_number}-${stop.lap_number}-${index}`}
                  title={`${driverCode(stop.driver_number)} · lap ${stop.lap_number ?? "—"} · ${stop.stop_duration?.toFixed(2)}s stationary`}
                >
                  <td>{driverCode(stop.driver_number)}</td>
                  <td className="dim">L{stop.lap_number ?? "—"}</td>
                  <td>{stop.stop_duration?.toFixed(2)}s</td>
                </tr>
              ))}
            </tbody>
          </table>
          {stats.outliers.length > 0 && (
            <p className="dim small">
              Outliers (&gt;1.5× median):{" "}
              {stats.outliers
                .map((stop) => `${driverCode(stop.driver_number)} ${stop.stop_duration?.toFixed(1)}s`)
                .join(", ")}
            </p>
          )}
        </div>
        <div>
          <p className="dim small">Most overtakes (feed count, may be incomplete)</p>
          {stats.count === 0 && (
            <p className="dim small">
              The feed did not publish timed pit stops for this session, so median
              and best are unavailable rather than zero.
            </p>
          )}
          <table className="laps mono">
            <thead>
              <tr><th>Driver</th><th>Made</th><th>Lost</th></tr>
            </thead>
            <tbody>
              {overtakes.map((row) => (
                <tr key={row.driver_number}>
                  <td>{driverCode(row.driver_number)}</td>
                  <td>{row.made} made</td>
                  <td className="dim">{row.lost} lost</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
