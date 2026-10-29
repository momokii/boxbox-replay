import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { formatLapTime } from "./format";
import { sectorFlags } from "./sectors";
import type { Driver, Meeting, SessionInfo } from "./types";
import "./index.css";

function useAsync<T>(key: string, fn: () => Promise<T>): { data: T | null; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    let live = true;
    setError(null);
    ref
      .current()
      .then((d) => live && setData(d))
      .catch((e) => live && setError(String(e)));
    return () => {
      live = false;
    };
  }, [key]);
  return { data, error };
}

export default function App() {
  const years = useAsync("years", api.years);
  const [yearSel, setYearSel] = useState<number | null>(null);
  const [meetingKey, setMeetingKey] = useState<number | null>(null);
  const [sessionKey, setSessionKey] = useState<number | null>(null);
  const [highlight, setHighlight] = useState<number[]>([]);
  const [selected, setSelected] = useState<{ driver: number; lap: number } | null>(null);
  const year = yearSel ?? years.data?.[years.data.length - 1] ?? null;

  const resetSession = () => {
    setSessionKey(null);
    setHighlight([]);
    setSelected(null);
  };

  const meetings = useAsync(`meetings:${year ?? "none"}`, () =>
    year ? api.meetings(year) : Promise.resolve([]),
  );

  const sessions = useAsync(`sessions:${year ?? "none"}:${meetingKey ?? "none"}`, () =>
    year && meetingKey ? api.sessions(year, meetingKey) : Promise.resolve([]),
  );

  const sessionKeys = useMemo(
    () => (sessions.data ?? []).map((s) => s.session_key),
    [sessions.data],
  );
  const status = useAsync(`status:${sessionKeys.join(",")}`, () =>
    sessionKeys.length ? api.sessionStatus(sessionKeys) : Promise.resolve({}),
  );

  const drivers = useAsync(`drivers:${sessionKey ?? "none"}`, () =>
    sessionKey ? api.drivers(sessionKey) : Promise.resolve([]),
  );
  const laps = useAsync(`laps:${sessionKey ?? "none"}`, () =>
    sessionKey ? api.laps(sessionKey) : Promise.resolve([]),
  );

  const flagged = useMemo(() => (laps.data ? sectorFlags(laps.data) : []), [laps.data]);
  const visible = useMemo(
    () => (highlight.length ? flagged.filter((l) => highlight.includes(l.driver_number)) : flagged),
    [flagged, highlight],
  );
  const driverLabel = (d: Driver) => `#${d.driver_number} ${d.name_acronym}`;
  const reasons: Record<string, string> = status.data ?? {};

  return (
    <>
      <header className="topbar">
        <h1>
          BoxBox <span className="accent">Replay</span>
        </h1>
        <span className="dim">Night Pit-Wall · R0 shell — replay arrives in R1</span>
      </header>

      <div className="pickers">
        <label>
          Season
          <select value={year ?? ""} onChange={(e) => { setYearSel(Number(e.target.value)); setMeetingKey(null); resetSession(); }}>
            <option value="">—</option>
            {(years.data ?? []).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label>
          Grand Prix
          <select
            value={meetingKey ?? ""}
            onChange={(e) => { setMeetingKey(Number(e.target.value)); resetSession(); }}
            disabled={!meetings.data?.length}
          >
            <option value="">—</option>
            {(meetings.data ?? []).map((m: Meeting) => (
              <option key={m.meeting_key} value={m.meeting_key}>
                {m.meeting_name} · {m.location}
              </option>
            ))}
          </select>
        </label>
        <label>
          Session
          <select
            value={sessionKey ?? ""}
            onChange={(e) => setSessionKey(Number(e.target.value))}
            disabled={!sessions.data?.length}
          >
            <option value="">—</option>
            {(sessions.data ?? []).map((s: SessionInfo) => {
              const reason = reasons[String(s.session_key)];
              return (
                <option key={s.session_key} value={s.session_key} disabled={reason !== undefined && reason !== ""}>
                  {s.session_name} ({s.date_start.slice(0, 10)})
                  {reason ? ` — ${reason}` : ""}
                </option>
              );
            })}
          </select>
        </label>
        <label>
          Highlight drivers (optional, all shown by default)
          <select
            multiple
            size={4}
            value={highlight.map(String)}
            disabled={!drivers.data?.length}
            onChange={(e) =>
              setHighlight(Array.from(e.target.selectedOptions).map((o) => Number(o.value)))
            }
          >
            {(drivers.data ?? []).map((d: Driver) => (
              <option key={d.driver_number} value={d.driver_number}>
                {driverLabel(d)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <main className="layout">
        <section className="rail">
          <h2>Lap table</h2>
          {laps.error && <p>Failed to load laps: {laps.error}</p>}
          <table className="laps mono">
            <thead>
              <tr>
                <th>Lap</th>
                <th>Driver</th>
                <th>Time</th>
                <th>S1</th>
                <th>S2</th>
                <th>S3</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((l: (typeof visible)[number]) => {
                const sel = selected?.driver === l.driver_number && selected?.lap === l.lap_number;
                const cls = (f: string) =>
                  f === "session" ? "sector-session" : f === "personal" ? "sector-personal" : "";
                return (
                  <tr
                    key={`${l.driver_number}-${l.lap_number}`}
                    className={sel ? "selected" : ""}
                    onClick={() => setSelected({ driver: l.driver_number, lap: l.lap_number })}
                    style={{ cursor: "pointer" }}
                  >
                    <td>{l.lap_number}</td>
                    <td>#{l.driver_number}</td>
                    <td>{formatLapTime(l.lap_duration)}</td>
                    <td className={cls(l.s1)}>{formatLapTime(l.duration_sector_1)}</td>
                    <td className={cls(l.s2)}>{formatLapTime(l.duration_sector_2)}</td>
                    <td className={cls(l.s3)}>{formatLapTime(l.duration_sector_3)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {selected && (
            <p>
              Loaded lap: <strong>#{selected.driver}</strong> lap {selected.lap}
              <span className="dim"> — replay arrives in R1</span>
            </p>
          )}
        </section>
        <section className="stage">
          <h2>Replay stage</h2>
          <p className="dim">Canvas map lands in R1. Selected session: {sessionKey ?? "—"}</p>
        </section>
        <section className="engineer">
          <h2>Race engineer</h2>
          <p className="dim">On-trigger coach lands in R3.</p>
        </section>
      </main>
    </>
  );
}
