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
  const [view, setView] = useState<"detail" | "overall">("detail");

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

  const sectorTime = (lap: Lap, sector: 1 | 2 | 3) =>
    sector === 1 ? lap.duration_sector_1 : sector === 2 ? lap.duration_sector_2 : lap.duration_sector_3;
  const bestFor = (sector: 1 | 2 | 3, driverOnly: boolean) => {
    let best: number | null = null;
    for (const lap of laps) {
      if (driverOnly && lap.driver_number !== driver) continue;
      const value = sectorTime(lap, sector);
      if (value != null && (best == null || value < best)) best = value;
    }
    return best;
  };
  const sessionBest = {
    1: bestFor(1, false),
    2: bestFor(2, false),
    3: bestFor(3, false),
  };
  const personalBest = {
    1: bestFor(1, true),
    2: bestFor(2, true),
    3: bestFor(3, true),
  };
  const summary = (lap: Lap, sector: 1 | 2 | 3) => {
    const time = sectorTime(lap, sector);
    const tone =
      time == null
        ? "none"
        : sessionBest[sector] != null && Math.abs(time - sessionBest[sector]!) < 1e-6
          ? "purple"
          : personalBest[sector] != null && Math.abs(time - personalBest[sector]!) < 1e-6
            ? "green"
            : "yellow";
    return { tone, time };
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
        <div className="mini-controls">
          <div className="seg" role="group" aria-label="Mini-sector detail level">
            <button type="button" aria-pressed={view === "detail"} onClick={() => setView("detail")}>
              Detail
            </button>
            <button type="button" aria-pressed={view === "overall"} onClick={() => setView("overall")}>
              Overall
            </button>
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
            {view === "detail" ? (
              <>{cells(lap, 1)}{cells(lap, 2)}{cells(lap, 3)}</>
            ) : (
              ([1, 2, 3] as const).map((sector) => {
                const s = summary(lap, sector);
                return (
                  <span
                    key={sector}
                    className={`mini-overall-cell mini-seg-${s.tone}`}
                    title={`S${sector}: ${s.time == null ? "no time" : formatLapTime(s.time)} · ${TONE_LABEL[s.tone]} (session ${formatLapTime(sessionBest[sector])}, personal ${formatLapTime(personalBest[sector])})`}
                  >
                    {formatLapTime(s.time)}
                  </span>
                );
              })
            )}
          </div>
        ))}
      </div>
      <p className="dim small mini-note">
        <strong>How to read it:</strong> OpenF1 sends a colour per mini-sector;
        purple is the session's best, green a personal best, yellow slower. The
        feed says the colours may not always match the TV broadcast, and a grey
        block means the feed did not publish a usable value. Overall shows the
        sector time, coloured against the session and personal sector bests;
        Detail shows every mini-sector tick.
      </p>
    </section>
  );
}
