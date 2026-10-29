import { useEffect, useState } from "react";
import { api } from "../api";
import { compoundColor } from "../format";
import { formatClock } from "../session";
import { stintSlope } from "../perf";
import Info from "./Info";
import WeatherChart from "./WeatherChart";
import type { Lap, Stint } from "../types";

interface Props {
  sessionKey: number;
  laps: Lap[];
  highlight: number[];
  towerOrder: number[];
  driverCode: (n: number) => string;
  onSeek: (t: number) => void;
  duration: number;
}

interface Feed {
  stints: Stint[];
  weather: Record<string, unknown>[];
  radio: Record<string, unknown>[];
  rc: Record<string, unknown>[];
}

export default function PerformancePanel(p: Props) {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [scope, setScope] = useState<"focus" | "all">("focus");
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    setFeed(null);
    setError(false);
    Promise.all([api.stints(p.sessionKey), api.weather(p.sessionKey), api.radio(p.sessionKey), api.raceControl(p.sessionKey)])
      .then(([stints, weather, radio, rc]) => live && setFeed({ stints, weather, radio, rc }))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [p.sessionKey]);

  if (error) return <p className="dim">Performance feeds unavailable for this session.</p>;
  if (!feed) return <p className="dim">Loading performance data…</p>;

  const focus = p.highlight;
  const allDrivers = [...new Set(feed.stints.map((s) => s.driver_number))];
  const shownDrivers = scope === "focus" ? focus : allDrivers;
  const stints = feed.stints.filter(
    (s) =>
      shownDrivers.includes(s.driver_number) &&
      s.lap_start != null &&
      (s.lap_end == null || s.lap_end >= s.lap_start),
  );
  const maxLap = Math.max(1, ...stints.map((s) => s.lap_end ?? 0));

  const slopeRows = stints.map((s) => {
    const start = s.lap_start ?? 1;
    const end = s.lap_end ?? Number.MAX_SAFE_INTEGER;
    const seg = p.laps.filter(
      (l) => l.driver_number === s.driver_number && l.lap_number >= start && l.lap_number <= end,
    );
    let slope: number | null = null;
    try {
      slope = stintSlope(seg);
    } catch {
      slope = null;
    }
    return { stint: s, slope };
  });

  return (
    <div>
      <div className="row" style={{ marginBottom: 10 }}>
        <button className={scope === "focus" ? "chip on" : "chip"} onClick={() => setScope("focus")}>
          My drivers ({focus.length})
        </button>
        <button className={scope === "all" ? "chip on" : "chip"} onClick={() => setScope("all")}>
          Whole field ({allDrivers.length})
        </button>
        {scope === "focus" && focus.length === 0 && (
          <span className="dim small">No drivers picked — click rows in the timing tower, or switch to Whole field.</span>
        )}
      </div>

      <section className="panel">
        <h3>
          <Info
            label="Stints"
            tip="A stint is one continuous run on a set of tyres. The bar spans the whole race, from lap 1 to the flag."
          />{" "}
          · whole race
        </h3>
        <div className="stint-list">
        {stints.length ? (
          stints.map((s, i) => {
            const start = s.lap_start ?? 1;
            const end = s.lap_end ?? maxLap;
            return (
              <div key={`${s.driver_number}-${i}`} className="row" style={{ fontSize: "0.8rem", marginBottom: 2 }}>
                <span className="mono" style={{ minWidth: 34 }}>{p.driverCode(s.driver_number)}</span>
                <div className="stint-track">
                  <div
                    className="stint-block"
                    title={`${p.driverCode(s.driver_number)} · ${s.compound} · laps ${start}-${s.lap_end ?? "end"}`}
                    style={{
                      left: `${((start - 1) / maxLap) * 100}%`,
                      width: `${Math.max(1, ((end - start + 1) / maxLap) * 100)}%`,
                      background: compoundColor(s.compound),
                    }}
                  />
                </div>
                <span className="dim small" style={{ minWidth: 86 }}>
                  {s.compound} {start}–{s.lap_end ?? "end"}
                </span>
              </div>
            );
          })
        ) : (
          <p className="dim small">No stint data for these drivers.</p>
        )}
        </div>
        {stints.length > 0 && (
          <div className="stint-axis">
            <span>lap 1</span>
            <span>{Math.round(maxLap / 2)}</span>
            <span>{maxLap}</span>
          </div>
        )}
        <p className="dim small">
          Showing {shownDrivers.length} of {new Set(feed.stints.map((s) => s.driver_number)).size} drivers
          {scope === "focus" ? " — highlight drivers in the tower to change this." : "."} Bars are the full race,
          not the replay moment.
        </p>
      </section>

      <section className="panel">
        <h3>
          <Info
            label="Degradation"
            tip="Seconds lost per lap as the tyres wear, fitted on the stint's timed laps only (pit and red-flag laps excluded)."
          />{" "}
          · seconds per lap
        </h3>
        <table className="laps mono" style={{ fontSize: "0.82rem" }}>
          <thead>
            <tr>
              <th>Driver</th>
              <th>Compound</th>
              <th>Laps</th>
              <th>Slope</th>
            </tr>
          </thead>
          <tbody>
            {slopeRows.map(({ stint, slope }) => (
              <tr key={`${stint.driver_number}-${stint.lap_start}`}>
                <td>{p.driverCode(stint.driver_number)}</td>
                <td>{stint.compound ?? "?"}</td>
                <td>
                  {stint.lap_start ?? "?"}–{stint.lap_end ?? "?"}
                </td>
                <td>{slope == null ? "not enough laps" : `+${slope.toFixed(3)}s`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h3>
          <Info
            label="Weather"
            tip="Air and track temperature for the whole session, sampled about once every 15 seconds. Legend shows the last sample."
          />
        </h3>
        <WeatherChart
          points={feed.weather.map((w) => ({
            t: Number(w.t ?? 0),
            air_temperature: w.air_temperature as number | null,
            track_temperature: w.track_temperature as number | null,
            humidity: w.humidity as number | null,
            rainfall: w.rainfall as number | null,
          }))}
          duration={p.duration}
        />
      </section>

      <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
        <section className="panel" style={{ flex: 1, minWidth: 260 }}>
          <h3>
            <Info
              label="Team radio"
              tip="Every team-radio message OpenF1 has for this session. Audio only — the API publishes no transcripts, so none are shown. Click a time to jump the replay there."
            />{" "}
            · all {feed.radio.length} messages
          </h3>
          <div className="event-list">
            {feed.radio.length ? (
              feed.radio.map((r, i) => (
                <button key={i} className="event-row" onClick={() => p.onSeek(Number(r.t ?? 0))}>
                  <span className="mono dim">{formatClock(Number(r.t ?? 0))}</span>
                  <span className="mono">{p.driverCode(Number(r.driver_number))}</span>
                  <a
                    href={String(r.recording_url)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    audio
                  </a>
                </button>
              ))
            ) : (
              <p className="dim small">No radio messages for this session.</p>
            )}
          </div>
        </section>
        <section className="panel" style={{ flex: 1, minWidth: 260 }}>
          <h3>
            <Info
              label="Race control"
              tip="Every steward and race-control message for this session: flags, investigations, penalties. Click a time to jump the replay there."
            />{" "}
            · all {feed.rc.length} messages
          </h3>
          <div className="event-list">
            {feed.rc.length ? (
              feed.rc.map((r, i) => (
                <button key={i} className="event-row rc" onClick={() => p.onSeek(Number(r.t ?? 0))}>
                  <span className="mono dim">{formatClock(Number(r.t ?? 0))}</span>
                  <span className="small">
                    {String(r.category)}
                    {r.flag ? ` ${r.flag}` : ""} — {String(r.message)}
                  </span>
                </button>
              ))
            ) : (
              <p className="dim small">No race-control messages for this session.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
