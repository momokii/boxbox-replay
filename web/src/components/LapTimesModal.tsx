import { useMemo, useState } from "react";
import { driverLabel, formatLapTime } from "../format";
import type { Driver, Lap, Playback } from "../types";
import LapChart from "./LapChart";
import SortHeader from "./SortHeader";
import { useSort, useSortedRows } from "../sort";

interface FlaggedLap extends Lap {
  s1: string;
  s2: string;
  s3: string;
}

interface Props {
  laps: FlaggedLap[];
  drivers: Driver[];
  totalLaps: number;
  colors: Map<number, string>;
  playback: Playback;
}

/**
 * Full lap-time view.
 *
 * Pick any number of drivers: the chart compares them, and every row carries the
 * driver's colour so a mixed table stays readable.
 */
export default function LapTimesModal(p: Props) {
  const [selected, setSelected] = useState<number[]>([]);
  // Lap order by default: it is the axis people compare on.
  const { state, toggle } = useSort({ key: "lap", dir: "asc" });

  const active = selected;
  const toggleDriver = (n: number) =>
    setSelected((cur) => (cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n]));

  const base = useMemo(
    () => (active.length ? p.laps.filter((l) => active.includes(l.driver_number)) : p.laps),
    [p.laps, active],
  );
  const rows = useSortedRows(
    base,
    (l, key) => {
      if (key === "driver") return l.driver_number;
      if (key === "lap") return l.lap_number;
      if (key === "time") return l.lap_duration;
      if (key === "s1") return l.duration_sector_1;
      if (key === "s2") return l.duration_sector_2;
      if (key === "s3") return l.duration_sector_3;
      return l.lap_number;
    },
    state,
  ).slice(0, 1500);

  const meta = useMemo(() => {
    const m = new Map<number, Driver>();
    for (const d of p.drivers) m.set(d.driver_number, d);
    return m;
  }, [p.drivers]);

  const label = (n: number) => {
    const d = meta.get(n);
    return driverLabel(d?.name_acronym, d?.full_name);
  };
  const colour = (n: number) => p.colors.get(n) ?? "#8A94A6";

  return (
    <div>
      <div className="row" style={{ marginBottom: 10 }}>
        <button className={active.length === 0 ? "chip on" : "chip"} onClick={() => setSelected([])}>
          All drivers
        </button>
        {p.drivers.map((d) => {
          const on = active.includes(d.driver_number);
          return (
            <button
              key={d.driver_number}
              className={on ? "chip on" : "chip"}
              aria-pressed={on}
              onClick={() => toggleDriver(d.driver_number)}
            >
              <i style={{ background: colour(d.driver_number) }} />
              {d.name_acronym}
            </button>
          );
        })}
      </div>

      {active.length > 0 && (
        <div className="panel" style={{ marginBottom: 12 }}>
          <h3>
            Lap times over the race ·{" "}
            {active.map((n) => meta.get(n)?.name_acronym ?? `#${n}`).join(" vs ")}
          </h3>
          <LapChart
            playback={p.playback}
            laps={p.laps}
            drivers={active}
            codes={new Map(p.drivers.map((d) => [d.driver_number, d.name_acronym]))}
            colors={p.colors}
            totalLaps={p.totalLaps}
          />
          <p className="dim small">
            One line per selected driver, every timed lap. Compare the shape: a line that sits lower is faster; a
            spike is traffic, a mistake or a pit lap.
          </p>
        </div>
      )}

      <p className="dim small">
        {rows.length} laps shown
        {active.length === 0
          ? " — pick one or more drivers to compare their pace above."
          : active.length === 1
            ? ` — ${label(active[0])} only. Add another driver to compare.`
            : ` — comparing ${active.length} drivers.`}
      </p>

      <div className="laps-wrap" style={{ maxHeight: "46vh" }}>
        <table className="laps mono">
          <thead>
            <tr>
              <SortHeader label="Lap" column="lap" state={state} onSort={toggle} />
              <SortHeader label="Driver" column="driver" state={state} onSort={toggle} />
              <SortHeader label="Time" column="time" state={state} onSort={toggle} />
              <SortHeader label="S1" column="s1" state={state} onSort={toggle} />
              <SortHeader label="S2" column="s2" state={state} onSort={toggle} />
              <SortHeader label="S3" column="s3" state={state} onSort={toggle} />
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => {
              const cls = (f: string) =>
                f === "session" ? "sector-session" : f === "personal" ? "sector-personal" : "";
              const on = active.includes(l.driver_number);
              return (
                <tr
                  key={`${l.driver_number}-${l.lap_number}`}
                  className={on ? "driver-marked" : undefined}
                  style={on ? { boxShadow: `inset 3px 0 0 ${colour(l.driver_number)}` } : undefined}
                >
                  <td>{l.lap_number}</td>
                  <td>
                    <span className="driver-cell">
                      <i className="tower-chip" style={{ background: colour(l.driver_number) }} />
                      {label(l.driver_number)}
                    </span>
                  </td>
                  <td>{formatLapTime(l.lap_duration)}</td>
                  <td className={cls(l.s1)}>{formatLapTime(l.duration_sector_1)}</td>
                  <td className={cls(l.s2)}>{formatLapTime(l.duration_sector_2)}</td>
                  <td className={cls(l.s3)}>{formatLapTime(l.duration_sector_3)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
