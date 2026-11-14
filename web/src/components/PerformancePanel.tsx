import { useEffect, useState } from "react";
import { api } from "../api";
import { compoundColor } from "../format";
import { formatClock } from "../session";
import { stintSlope } from "../perf";
import { gapAt, type GapTable, type LapMarker } from "../session";
import Info from "./Info";
import { downloadFile, toCsv } from "../export";
import TimelinePanel from "./TimelinePanel";
import WeatherChart from "./WeatherChart";
import LapChart from "./LapChart";
import Modal from "./Modal";
import DegradationList from "./DegradationList";
import RaceControlModal from "./RaceControlModal";
import type { Playback } from "../playbackStore";
import type { Lap, Stint } from "../types";
import type { PitStopSummary } from "../api";

interface Props {
  sessionKey: number;
  laps: Lap[];
  highlight: number[];
  towerOrder: number[];
  driverCode: (n: number) => string;
  onSeek: (t: number) => void;
  duration: number;
  pitSummary: PitStopSummary[];
  overtakeCounts: { driver_number: number; made: number; lost: number }[];
  playback: Playback;
  totalLaps: number;
  colors: Map<number, string>;
  table: GapTable;
  markers: LapMarker[];
}

interface Feed {
  stints: Stint[];
  weather: Record<string, unknown>[];
  radio: Record<string, unknown>[];
  rc: Record<string, unknown>[];
}

export default function PerformancePanel(p: Props) {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [scope, setScope] = useState<"focus" | "all">("all");
  const [degModal, setDegModal] = useState(false);
  const [rcModal, setRcModal] = useState(false);
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

  const pitByDriver = new Map<number, number[]>();
  for (const s of p.pitSummary) pitByDriver.set(s.driver_number, s.laps);
  const pitByDriverSummary = new Map(p.pitSummary.map((s) => [s.driver_number, s]));
  const overtakesByDriver = new Map(p.overtakeCounts.map((o) => [o.driver_number, o]));

  // Race control: categories for the filter chips in the full view.
  const rcCategories = [...new Set(feed.rc.map((r) => String(r.category ?? "Other")))].sort();

  const byDriver = [...new Set(stints.map((s) => s.driver_number))]
    .sort((x, y) => x - y)
    .map((driver) => ({
      driver,
      stints: stints
        .filter((s) => s.driver_number === driver)
        .sort((x, y) => (x.lap_start ?? 0) - (y.lap_start ?? 0)),
    }));

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

  const degGroups = (() => {
    const valid = slopeRows.filter(({ stint }) => (stint.lap_end ?? 0) > (stint.lap_start ?? 0));
    const byDriver = new Map<number, { driver: number; rows: typeof valid }>();
    for (const row of valid) {
      const entry = byDriver.get(row.stint.driver_number) ?? { driver: row.stint.driver_number, rows: [] };
      entry.rows.push(row);
      byDriver.set(row.stint.driver_number, entry);
    }
    return [...byDriver.values()]
      .map((g) => ({ ...g, rows: g.rows.sort((x, y) => (y.slope ?? -1) - (x.slope ?? -1)) }))
      .sort((x, y) => (y.rows[0]?.slope ?? -1) - (x.rows[0]?.slope ?? -1));
  })();


  return (
    <div>
      <TimelinePanel sessionKey={p.sessionKey} duration={p.duration} />

      <div className="export-actions">
        <span className="dim small">Export this session (client-side, no new requests):</span>
        <button
          type="button"
          className="chip"
          onClick={() =>
            downloadFile(
              `boxbox-${p.sessionKey}-laps.csv`,
              toCsv(p.laps as unknown as Record<string, unknown>[], [
                { key: "driver_number", label: "driver_number" },
                { key: "lap_number", label: "lap_number" },
                { key: "lap_duration", label: "lap_time_s" },
                { key: "duration_sector_1", label: "sector_1_s" },
                { key: "duration_sector_2", label: "sector_2_s" },
                { key: "duration_sector_3", label: "sector_3_s" },
                { key: "is_pit_out_lap", label: "pit_out_lap" },
              ]),
            )
          }
        >
          Laps CSV
        </button>
        <button
          type="button"
          className="chip"
          disabled={!feed.stints.length}
          onClick={() =>
            downloadFile(
              `boxbox-${p.sessionKey}-stints.csv`,
              toCsv(feed.stints as unknown as Record<string, unknown>[], [
                { key: "driver_number", label: "driver_number" },
                { key: "stint_number", label: "stint_number" },
                { key: "lap_start", label: "lap_start" },
                { key: "lap_end", label: "lap_end" },
                { key: "compound", label: "compound" },
                { key: "tyre_age_at_start", label: "tyre_age_at_start" },
              ]),
            )
          }
        >
          Stints CSV
        </button>
      </div>
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
            tip="One row per driver. Each coloured block is a stint: one continuous run on a set of tyres. Hover a block for the compound and lap range."
          />{" "}
          · whole race
        </h3>
        <div className="stint-list">
        {byDriver.length ? (
          byDriver.map(({ driver, stints: driverStints }) => (
            <div key={driver} className="stint-row" style={{ fontSize: "0.8rem" }}>
              <span
                className="mono"
                style={{ minWidth: 34, color: p.colors.get(driver) ?? "var(--ink)" }}
              >
                {p.driverCode(driver)}
              </span>
              <div className="stint-track">
                {driverStints.map((s, i) => {
                  const start = s.lap_start ?? 1;
                  const end = s.lap_end ?? maxLap;
                  const compound = s.compound ?? "?";
                  const age = s.tyre_age_at_start;
                  const startT = p.markers.find((m) => m.lap_number === start)?.t;
                  const gap = startT != null ? gapAt(p.table, driver, startT) : null;
                  const ageText =
                    age == null ? "" : ` · tyres ${age}→${age + Math.max(0, end - start)} laps`;
                  const gapText =
                    gap == null ? " · gap —" : ` · gap +${gap.toFixed(3)}s at the start`;
                  return (
                    <div
                      key={i}
                      className="stint-block"
                      title={`${p.driverCode(driver)} · ${compound} · laps ${start}–${end}${ageText}${gapText}`}
                      style={{
                        left: `${((start - 1) / maxLap) * 100}%`,
                        width: `${Math.max(0.6, ((end - start + 1) / maxLap) * 100)}%`,
                        background: compoundColor(compound),
                      }}
                    />
                  );
                })}
                {(pitByDriver.get(driver) ?? []).map((lap) => (
                  <span
                    key={`pit-${lap}`}
                    className="pit-notch"
                    style={{ left: `${((lap - 1) / maxLap) * 100}%` }}
                    title={`${p.driverCode(driver)} pit stop after lap ${lap}`}
                  />
                ))}
              </div>
              <span className="dim small" style={{ minWidth: 96 }}>
                {driverStints.length} stint{driverStints.length > 1 ? "s" : ""} ·{" "}
                {[...new Set(driverStints.map((s) => s.compound ?? "?"))].join("/")}
              </span>
              <span className="dim small" style={{ minWidth: 190 }}>
                {(() => {
                  const pit = pitByDriverSummary.get(driver);
                  const ov = overtakesByDriver.get(driver);
                  const stopText = pit
                    ? `${pit.stops} stop${pit.stops > 1 ? "s" : ""}${
                        pit.best_stop_s != null ? ` · best ${pit.best_stop_s.toFixed(1)}s` : ""
                      }`
                    : "no stops recorded";
                  const ovText = ov ? `${ov.made} overtakes · ${ov.lost} lost` : "";
                  return [stopText, ovText].filter(Boolean).join(" · ");
                })()}
              </span>
            </div>
          ))
        ) : (
          <p className="dim small">No stint data for these drivers.</p>
        )}
        </div>
        <div className="legend" style={{ marginTop: 6 }}>
          {["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"].map((c) => (
            <span key={c}>
              <i style={{ background: compoundColor(c) }} />
              {c.toLowerCase()}
            </span>
          ))}
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
            tip="Seconds lost per lap as a tyre ages, fitted on the timed laps of each stint (pit and red-flag laps excluded). A longer bar means the tyres fall off faster."
          />{" "}
          · seconds per lap, one bar per stint
        </h3>
        <div className="row" style={{ justifyContent: "flex-end", marginBottom: 6 }}>
          <button className="disclosure" onClick={() => setDegModal(true)}>
            Full view
          </button>
        </div>
        <DegradationList
          groups={degGroups}
          driverCode={p.driverCode}
          driverColor={(n) => p.colors.get(n) ?? "var(--ink)"}
          maxGroups={scope === "all" ? 10 : 40}
          note={
            <>
              Grouped by driver — one bar per stint.
              {scope === "all" &&
                ` Showing the ${Math.min(10, degGroups.length)} highest-wear drivers of ${degGroups.length}; Full view lists every driver.`}
            </>
          }
        />
      </section>

      <section className="panel">
        <h3>
          <Info
            label="Lap times over the race"
            tip="Every timed lap for the drivers in scope, in lap order. Spikes are traffic, mistakes or pit in/out laps. Hover for exact times."
          />
        </h3>
        <LapChart
          playback={p.playback}
          laps={p.laps}
          drivers={shownDrivers}
          codes={new Map(p.towerOrder.map((d) => [d, p.driverCode(d)]))}
          colors={p.colors}
          totalLaps={p.totalLaps}
        />
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
          <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
            <h3>
              <Info
                label="Race control"
                tip="Every steward and race-control message for this session: flags, investigations, penalties. Click a time to jump the replay there."
              />{" "}
              · all {feed.rc.length} messages
            </h3>
            <button className="disclosure" onClick={() => setRcModal(true)}>
              Full view
            </button>
          </div>
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

      <RaceControlModal
        open={rcModal}
        onClose={() => setRcModal(false)}
        rows={feed.rc}
        categories={rcCategories}
        onSeek={p.onSeek}
      />

      <Modal
        open={degModal}
        onClose={() => setDegModal(false)}
        title="Stint degradation"
        subtitle="Lap times per stint with the fitted wear rate"
        size="wide"
      >
        <h3>Lap times · {scope === "focus" ? "your drivers" : "highest-wear drivers"}</h3>
        <LapChart
          playback={p.playback}
          laps={p.laps}
          drivers={scope === "focus" ? shownDrivers : degGroups.slice(0, 6).map((g) => g.driver)}
          codes={new Map(p.towerOrder.map((d) => [d, p.driverCode(d)]))}
          colors={p.colors}
          totalLaps={p.totalLaps}
          labels={new Map(p.towerOrder.map((d) => [d, p.driverCode(d)]))}
        />
        <p className="dim small">
          {scope === "focus"
            ? "One line per selected driver."
            : "The six highest-wear drivers, so the chart stays readable; the list below covers every driver."}
        </p>
        <div style={{ marginTop: 12 }}>
          <h3>Wear by driver · every stint</h3>
          <DegradationList
            groups={degGroups}
            driverCode={p.driverCode}
            driverColor={(n) => p.colors.get(n) ?? "var(--ink)"}
          />
        </div>
        <p className="dim small">
          The chart plots every timed lap; a rising line within one compound is the tyre going off. Single-lap
          spikes are traffic, mistakes or in/out laps, not wear.
        </p>
      </Modal>
    </div>
  );
}
