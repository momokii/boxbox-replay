import { useEffect, useState } from "react";
import { api } from "../api";
import { formatLapTime } from "../format";
import SpeedStrip from "./SpeedStrip";
import type { Playback } from "../playbackStore";
import type { Driver, Lap, LapPoint } from "../types";
import { teamColor } from "../format";

interface Props {
  playback: Playback;
  sessionKey: number;
  drivers: Driver[];
  laps: Lap[];
  refProp: { driver: number; lap: number } | null;
}

const NOISE = 0.05;

function useCar(sessionKey: number, driver: number, lap: number) {
  const [data, setData] = useState<LapPoint[] | null>(null);
  const [error, setError] = useState(false);
  const key = `${sessionKey}:${driver}:${lap}`;
  useEffect(() => {
    let live = true;
    setData(null);
    setError(false);
    api
      .car(sessionKey, driver, lap)
      .then((d) => live && setData(d))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [key]);
  return { data, error };
}

export default function BattlePanel(p: Props) {
  const ref = p.refProp;
  const [chalDriver, setChalDriver] = useState<number | null>(null);
  const [chalLap, setChalLap] = useState<number>(ref?.lap ?? 1);
  const chal =
    chalDriver ?? p.drivers.find((d) => d.driver_number !== ref?.driver)?.driver_number ?? ref?.driver ?? 0;

  const refCar = useCar(p.sessionKey, ref?.driver ?? 0, ref?.lap ?? 0);
  const chalCar = useCar(p.sessionKey, chal, chalLap);

  if (!ref) return <p className="dim">Pick a session with timed laps first.</p>;

  const refTime = p.laps.find((l) => l.driver_number === ref.driver && l.lap_number === ref.lap)?.lap_duration;
  const chalTime = p.laps.find((l) => l.driver_number === chal && l.lap_number === chalLap)?.lap_duration;
  const delta = refTime != null && chalTime != null ? chalTime - refTime : null;

  const toSeries = (label: string, color: string, car: LapPoint[] | null) =>
    car && car.length
      ? [{ label, color, t: car.map((c) => c.t), speed: car.map((c) => c.speed) }]
      : [];
  const series = [
    ...toSeries(`#${ref.driver}`, teamColor(p.drivers.find((d) => d.driver_number === ref.driver)?.team_colour), refCar.data),
    ...toSeries(`#${chal}`, teamColor(p.drivers.find((d) => d.driver_number === chal)?.team_colour), chalCar.data),
  ];

  return (
    <div>
      <div className="row">
        <span>
          Reference: <strong>#{ref.driver}</strong> lap {ref.lap}
        </span>
        <label className="dim">
          Challenger{" "}
          <select value={chal} onChange={(e) => setChalDriver(Number(e.target.value))}>
            {p.drivers.map((d) => (
              <option key={d.driver_number} value={d.driver_number}>
                #{d.driver_number} {d.name_acronym}
              </option>
            ))}
          </select>
        </label>
        <label className="dim">
          Lap{" "}
          <input
            type="number"
            min={1}
            value={chalLap}
            onChange={(e) => setChalLap(Number(e.target.value))}
            style={{ width: "70px" }}
          />
        </label>
        {delta != null && (
          <span className="mono">
            Delta: {delta >= 0 ? "+" : "−"}
            {Math.abs(delta).toFixed(3)}s ({Math.abs(delta) < NOISE ? "noise" : "real"})
          </span>
        )}
      </div>
      {(refCar.error || chalCar.error) && <p className="dim">Telemetry missing for one of these laps.</p>}
      <p className="dim mono">
        {refTime != null && `ref ${formatLapTime(refTime)}`}
        {chalTime != null && ` · chal ${formatLapTime(chalTime)}`}
      </p>
      <SpeedStrip playback={p.playback} series={series} cursor={null} />
    </div>
  );
}
