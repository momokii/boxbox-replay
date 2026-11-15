import { useEffect, useMemo, useState } from "react";
import { formatLapTime } from "../format";
import { meaningfulSegments, segmentTone } from "../segments";
import type { Lap } from "../types";

interface Props {
  laps: Lap[];
  sessionName: string;
  driverCode: (driver: number) => string;
  driverOrder: number[];
  preferred: number | null;
}

const TONE_LABEL: Record<string, string> = {
  purple: "session best",
  green: "personal best",
  yellow: "slower",
  pit: "pit lane",
  none: "not available",
};

/** Mini-sector strips; only rendered when the session actually carries them. */
export default function MiniSectors({ laps, sessionName, driverCode, driverOrder, preferred }: Props) {
  const isQuali = /qualifying|practice|shootout/i.test(sessionName);
  const usable = useMemo(() => meaningfulSegments(laps), [laps]);
  const drivers = useMemo(() => {
    const present = new Set(
      laps.filter((l) => l.segments_sector_1?.length).map((l) => l.driver_number),
    );
    const ordered = driverOrder.filter((d) => present.has(d));
    const rest = [...present].filter((d) => !ordered.includes(d)).sort((a, b) => a - b);
    return [...ordered, ...rest];
  }, [laps, driverOrder]);
  const [driver, setDriver] = useState(0);

  useEffect(() => {
    const next = preferred != null && drivers.includes(preferred) ? preferred : drivers[0] ?? 0;
    setDriver(next);
  }, [drivers, preferred]);

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
    const list = values ?? [];
    return (
      <div
        className="mini-group"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, list.length)}, minmax(0, 1fr))` }}
      >
        {list.map((value, index) => {
          const tone = segmentTone(value);
          return (
            <span
              key={`${sector}-${index}`}
              className={`mini-seg mini-seg-${tone}`}
              title={`S${sector} mini-sector ${index + 1}: ${TONE_LABEL[tone]} (raw ${value})`}
              aria-label={`Sector ${sector}, mini-sector ${index + 1}, ${TONE_LABEL[tone]}`}
            />
          );
        })}
      </div>
    );
  };

  return (
    <section className="mini-sectors" aria-label="Mini sectors">
      <div className="mini-head">
        <div>
          <h3>Mini-sectors</h3>
          <p className="dim small">
            The timing feed's segment colours for this driver. Only qualifying and
            practice carry them; a race shows nothing rather than a placeholder.
          </p>
        </div>
        <label className="mini-driver">
          Driver
          <select value={driver} onChange={(e) => setDriver(Number(e.target.value))}>
            {drivers.map((d) => (
              <option key={d} value={d}>
                {driverCode(d)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mini-legend" aria-label="Mini-sector legend">
        <span><i className="mini-seg mini-seg-purple" /> session best</span>
        <span><i className="mini-seg mini-seg-green" /> personal best</span>
        <span><i className="mini-seg mini-seg-yellow" /> slower</span>
        <span><i className="mini-seg mini-seg-pit" /> pit lane</span>
        <span><i className="mini-seg mini-seg-none" /> not available</span>
      </div>
      <div className="mini-table" role="table" aria-label={`Mini-sectors for ${driverCode(driver)}`}>
        <div className="mini-row mini-header" role="row">
          <span>Lap</span>
          <span>Time</span>
          <span>S1</span>
          <span>S2</span>
          <span>S3</span>
        </div>
        {rows.map((lap) => (
          <div key={lap.lap_number} className="mini-row" role="row">
            <span className="mini-lap">L{lap.lap_number}</span>
            <span className="mini-time mono">{formatLapTime(lap.lap_duration)}</span>
            {cells(lap, 1)}
            {cells(lap, 2)}
            {cells(lap, 3)}
          </div>
        ))}
      </div>
      <p className="dim small mini-note">
        <strong>How to read it:</strong> OpenF1 sends a colour per mini-sector;
        purple is the session's best, green a personal best, yellow slower. The
        feed says the colours may not always match the TV broadcast, and a grey
        block means the feed did not publish a usable value.
      </p>
    </section>
  );
}
