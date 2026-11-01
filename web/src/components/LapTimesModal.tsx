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
 * Full lap-time view: filter to one driver (or all), read every sector, and see
 * the pace chart above the same rows.
 */
export default function LapTimesModal(p: Props) {
  const [driver, setDriver] = useState<number | "all">("all");
  const { state, toggle } = useSort();

  const base = useMemo(
    () => (driver === "all" ? p.laps : p.laps.filter((l) => l.driver_number === driver)),
    [p.laps, driver],
  );
  const rows = useSortedRows(base, (l, key) => {
    if (key === "driver") return l.driver_number;
    if (key === "lap") return l.lap_number;
    if (key === "time") return l.lap_duration;
    if (key === "s1") return l.duration_sector_1;
    if (key === "s2") return l.duration_sector_2;
    if (key === "s3") return l.duration_sector_3;
    return l.lap_number;
  }, state).slice(0, 1200);
  const chartDrivers = driver === "all" ? [] : [driver];

  const meta = useMemo(() => {
    const m = new Map<number, Driver>();
    for (const d of p.drivers) m.set(d.driver_number, d);
    return m;
  }, [p.drivers]);

  const label = (n: number) => {
    const d = meta.get(n);
    return driverLabel(d?.name_acronym, d?.full_name);
  };

  return (
    <div>
      <div className="row" style={{ marginBottom: 10 }}>
        <button className={driver === "all" ? "chip on" : "chip"} onClick={() => setDriver("all")}>
          All drivers
        </button>
        {p.drivers.map((d) => (
          <button
            key={d.driver_number}
            className={driver === d.driver_number ? "chip on" : "chip"}
            onClick={() => setDriver(d.driver_number)}
          >
            <i style={{ background: p.colors.get(d.driver_number) }} />
            {d.name_acronym}
          </button>
        ))}
      </div>

      {chartDrivers.length > 0 && (
        <div className="panel" style={{ marginBottom: 12 }}>
          <h3>Lap times over the race · {label(chartDrivers[0])}</h3>
          <LapChart
            playback={p.playback}
            laps={p.laps}
            drivers={chartDrivers}
            codes={new Map(p.drivers.map((d) => [d.driver_number, d.name_acronym]))}
            colors={p.colors}
            totalLaps={p.totalLaps}
          />
        </div>
      )}

      <p className="dim small">
        {rows.length} laps shown
        {driver === "all" ? " — pick a driver to see their pace chart above." : "."}
      </p>

      <div className="laps-wrap" style={{ maxHeight: "46vh" }}>
        <table className="laps mono">
          <thead>
            <tr>
              {/* Fastest-first is what people come for, so these open ascending. */}
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
              return (
                <tr key={`${l.driver_number}-${l.lap_number}`}>
                  <td>{l.lap_number}</td>
                  <td>{label(l.driver_number)}</td>
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
