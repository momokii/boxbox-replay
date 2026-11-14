import { useEffect, useMemo, useState } from "react";
import { meaningfulSegments, segmentTone } from "../segments";
import type { Lap } from "../types";

interface Props {
  laps: Lap[];
  sessionName: string;
  driverCode: (driver: number) => string;
}

/** Mini-sector strips; only rendered when the session actually carries them. */
export default function MiniSectors({ laps, sessionName, driverCode }: Props) {
  const isQuali = /qualifying|practice|shootout/i.test(sessionName);
  const usable = useMemo(() => meaningfulSegments(laps), [laps]);
  const drivers = useMemo(
    () =>
      [...new Set(laps.filter((l) => l.segments_sector_1?.length).map((l) => l.driver_number))].sort(
        (a, b) => a - b,
      ),
    [laps],
  );
  const [driver, setDriver] = useState(drivers[0] ?? 0);

  useEffect(() => {
    if (!drivers.includes(driver)) setDriver(drivers[0] ?? 0);
  }, [drivers, driver]);

  if (!isQuali || !usable || !drivers.length) return null;

  const rows = laps
    .filter((lap) => lap.driver_number === driver)
    .sort((a, b) => b.lap_number - a.lap_number)
    .slice(0, 15);

  const cells = (lap: Lap, sector: 1 | 2 | 3) => {
    const values =
      sector === 1
        ? lap.segments_sector_1
        : sector === 2
          ? lap.segments_sector_2
          : lap.segments_sector_3;
    return (values ?? []).map((value, index) => (
      <span
        key={`${sector}-${index}`}
        className={`seg seg-${segmentTone(value)}`}
        title={`S${sector} segment ${index + 1} · ${segmentTone(value)}`}
      />
    ));
  };

  return (
    <section className="mini-sectors" aria-label="Mini sectors">
      <div className="mini-head">
        <h3>Mini-sectors</h3>
        <select value={driver} onChange={(e) => setDriver(Number(e.target.value))}>
          {drivers.map((d) => (
            <option key={d} value={d}>
              {driverCode(d)}
            </option>
          ))}
        </select>
      </div>
      <p className="dim small">
        Green = personal best, purple = session best, yellow = slower, grey = not
        available. Detected from the timing feed; only qualifying and practice carry it.
      </p>
      <div className="mini-rows">
        {rows.map((lap) => (
          <div key={lap.lap_number} className="mini-row">
            <span className="mini-lap">L{lap.lap_number}</span>
            <span className="mini-group">{cells(lap, 1)}</span>
            <span className="mini-group">{cells(lap, 2)}</span>
            <span className="mini-group">{cells(lap, 3)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
