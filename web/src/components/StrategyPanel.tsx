import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { formatLapTime } from "../format";
import type { Driver, StrategyResult } from "../types";
import Info from "./Info";

interface Props {
  sessionKey: number;
  drivers: Driver[];
  codes: Map<number, string>;
  labels: Map<number, string>;
  colors: Map<number, string>;
  defaultDriver: number;
  currentLap: number;
  totalLaps: number;
}

/**
 * v3 strategy model. The server computes every total; this panel only renders
 * them and exposes the inputs/assumptions that produced them.
 */
export default function StrategyPanel(p: Props) {
  const startLap = Math.max(1, Math.min(p.totalLaps || 1, p.currentLap || 1));
  const [driver, setDriver] = useState(p.defaultDriver || p.drivers[0]?.driver_number || 0);
  const [fromLap, setFromLap] = useState(startLap);
  const [pitLoss, setPitLoss] = useState<string>("");
  const [result, setResult] = useState<StrategyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [explain, setExplain] = useState<string | null>(null);
  const [explainBusy, setExplainBusy] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);

  useEffect(() => {
    if (p.defaultDriver) setDriver(p.defaultDriver);
  }, [p.defaultDriver]);

  useEffect(() => {
    setFromLap(Math.max(1, Math.min(p.totalLaps || 1, startLap)));
  }, [p.sessionKey, startLap, p.totalLaps]);

  const remaining = Math.max(1, (p.totalLaps || 1) - fromLap + 1);

  useEffect(() => {
    setExplain(null);
    setExplainError(null);
  }, [driver, fromLap, pitLoss]);

  useEffect(() => {
    if (!p.sessionKey || !driver) return;
    let live = true;
    setLoading(true);
    setError(null);
    api
      .strategy({
        session_key: p.sessionKey,
        driver_number: driver,
        from_lap: fromLap,
        laps_remaining: remaining,
        pit_loss_s: pitLoss.trim() === "" ? undefined : Number(pitLoss),
      })
      .then((data) => live && setResult(data))
      .catch((err: unknown) => {
        if (!live) return;
        setResult(null);
        const message = err instanceof Error ? err.message : "";
        setError(
          message.includes("404")
            ? "No laps or stints for this driver in this session."
            : message.includes("422")
              ? "Those inputs are outside the model's bounds."
              : "The strategy model could not run for this session.",
        );
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [p.sessionKey, driver, fromLap, remaining, pitLoss]);

  const assumptions = result?.assumptions ?? [];
  const coverage = result?.coverage ?? {};
  const color = useMemo(() => p.colors.get(driver) ?? "var(--ink)", [p.colors, driver]);

  return (
    <section className="strategy" aria-label="Strategy model" aria-busy={loading}>
      <header className="strategy-head">
        <div>
          <h2>
            Strategy projection{" "}
            <Info
              label="model details"
              children="?"
              tip="A transparent stay-vs-pit projection over this session's clean laps, stints and pit-lane times. It does not simulate safety cars, weather, rivals or a live pit wall."
            />
          </h2>
          <p className="dim small">
            Pick a lap, then compare the projected remaining race time of staying out
            versus pitting now. Lower is better; every total comes from measured laps.
          </p>
        </div>
        <span className="strategy-badge">v3 · model</span>
      </header>

      <div className="strategy-controls">
        <label className="dim small">
          Driver{" "}
          <select value={driver} onChange={(e) => setDriver(Number(e.target.value))}>
            {p.drivers.map((d) => (
              <option key={d.driver_number} value={d.driver_number}>
                #{d.driver_number} {d.name_acronym}
              </option>
            ))}
          </select>
        </label>
        <label className="dim small">
          Model from lap{" "}
          <input
            type="number"
            min={1}
            max={p.totalLaps || 1}
            value={fromLap}
            onChange={(e) => setFromLap(Math.max(1, Math.min(p.totalLaps || 1, Number(e.target.value))))}
            aria-describedby="strategy-from-lap-help"
          />
        </label>
        <label className="dim small">
          Laps remaining <strong>{remaining}</strong>
        </label>
        <label className="dim small">
          Pit-loss time{" "}
          <input
            type="number"
            step="0.1"
            min="5"
            max="60"
            placeholder={result?.pit_loss_s != null ? result.pit_loss_s.toFixed(1) : "derived"}
            value={pitLoss}
            onChange={(e) => setPitLoss(e.target.value)}
          />{" "}
          s
        </label>
      </div>

      <p id="strategy-from-lap-help" className="dim small">
        <strong>Model from lap</strong> freezes the race at that lap: only laps and
        stints up to it are used, and the remaining laps are projected. It is not
        the lap where a stop is scheduled.
      </p>

      {error && <p className="duel-note duel-error">{error}</p>}
      {loading && <p className="dim small">Updating the projection for lap {fromLap}…</p>}
      {!result && !error && !loading && <p className="dim">Running the model…</p>}

      {result && !result.measurable && (
        <div className="empty">
          <p>Not enough clean data to model this driver.</p>
          <p className="dim small">{result.reason ?? "No usable laps."}</p>
        </div>
      )}

      {result?.measurable && (
        <>
          <div className="strategy-meta">
            <span style={{ color }}>{p.labels.get(driver) ?? `#${driver}`}</span>
            <span className="dim">
              pit loss {result.pit_loss_s?.toFixed(1)}s ({result.pit_loss_source})
            </span>
            <span className="dim">
              clean laps {String(coverage.clean ?? "—")} · excluded{" "}
              {String(coverage.excluded ?? "—")}
            </span>
          </div>

          <p className="dim small strategy-table-help">
            Each option is projected remaining race time from lap {fromLap} to the
            finish. <strong>Stay out</strong> keeps the current tyres;{" "}
            <strong>pit now</strong> pays the pit loss and uses fresh tyres. Δ is
            the gap to the fastest option.
          </p>
          {(() => {
            const best = result.options.find((option) => option.rank === 1);
            if (!best) return null;
            const runnerUp = result.options.find((option) => option.rank === 2);
            return (
              <div className="strategy-recommendation" aria-live="polite">
                <span className="strategy-recommendation-kicker">Projected recommendation</span>
                <strong>{best.label}</strong>
                <p>
                  At lap {fromLap}, the model projects{" "}
                  <b>{formatLapTime(best.total_s)}</b> of remaining race time for
                  this option
                  {runnerUp ? (
                    <>
                      , {(runnerUp.total_s - best.total_s).toFixed(1)}s less than{" "}
                      {runnerUp.label.toLowerCase()}
                    </>
                  ) : null}
                  . This is a projection from measured laps, not a team call.
                </p>
              </div>
            );
          })()}

          <table className="strategy-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Option</th>
                <th scope="col">Projected total</th>
                <th scope="col">Δ best</th>
              </tr>
            </thead>
            <tbody>
              {result.options.map((option) => (
                <tr key={option.id} className={option.rank === 1 ? "best" : ""}>
                  <td>{option.rank}</td>
                  <td>{option.label}</td>
                  <td className="mono">{formatLapTime(option.total_s)}</td>
                  <td className="mono">
                    {option.delta_to_best_s === 0 ? "—" : `+${option.delta_to_best_s.toFixed(2)}s`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="strategy-facts">
            <p>
              <Info
                label="Break-even"
                tip="The pit loss at which the best stop equals staying out. Below this number the stop pays off; above it, staying out is faster."
              />{" "}
              break-even pit loss{" "}
              <strong>
                {result.break_even_pit_loss_s == null
                  ? "—"
                  : result.break_even_pit_loss_s <= 0
                    ? "not reachable"
                    : `${result.break_even_pit_loss_s.toFixed(1)}s`}
              </strong>
              {result.break_even_pit_loss_s != null && result.break_even_pit_loss_s <= 0 && (
                <span className="dim">
                  {" "}
                  — even a free stop would not pay back at this pace
                </span>
              )}
            </p>
            <p>
              <Info
                label="Undercut"
                tip="Laps needed for the fresh-tyre gain to repay the pit loss at the current pace difference. An estimate, not a rival simulation."
              />{" "}
              undercut{" "}
              <strong>
                {result.undercut
                  ? `~${result.undercut.laps_needed} laps`
                  : "not measurable"}
              </strong>
            </p>
            {result.traffic_on_exit && (
              <p className="warn small">
                Traffic on exit: {result.traffic_penalty_s?.toFixed(1)}s penalty included in the totals.
              </p>
            )}
          </div>

          <div className="strategy-explain">
            <button
              type="button"
              className="pit-explain-btn"
              disabled={explainBusy}
              onClick={async () => {
                setExplainBusy(true);
                setExplainError(null);
                try {
                  const reply = await api.aiExplain({
                    session_key: p.sessionKey,
                    kind: "strategy",
                    subject: {
                      driver,
                      from_lap: fromLap,
                      laps_remaining: remaining,
                      pit_loss_s: pitLoss.trim() === "" ? undefined : Number(pitLoss),
                    },
                  });
                  setExplain(reply.answer);
                } catch (err: unknown) {
                  const message = err instanceof Error ? err.message : "";
                  setExplainError(
                    message.includes("429")
                      ? "The engineer has reached its usage limit. Try again after it resets."
                      : message.includes("503")
                        ? "The AI is not configured on this deployment."
                        : "The engineer did not answer. The model above is unaffected.",
                  );
                } finally {
                  setExplainBusy(false);
                }
              }}
            >
              {explainBusy ? "Asking the engineer…" : "Explain this strategy"}
            </button>
            {explainError && <p className="small warn">{explainError}</p>}
            {explain && (
              <div className="pit-explain-note">
                <p>{explain}</p>
                <footer className="dim small">
                  AI explanation · the numbers above are the source of truth
                </footer>
              </div>
            )}
          </div>

          <div className="strategy-method">
            <h3>How this is measured</h3>
            <ul>
              <li>
                In plain terms: a pit stop costs time, but fresh tyres are usually
                faster; the model adds both effects over the laps remaining.
              </li>
              <li>Only clean green-flag laps are used; pit-in/out and safety-car windows are excluded.</li>
              <li>Pace and tyre wear come from this driver's stints in this session.</li>
              <li>Pit loss is the measured pit-lane time (or the value you enter), not a team radio claim.</li>
              <li>The model assumes no safety car, rain, traffic beyond the measured exit penalty, or rival strategy.</li>
              <li>“Projected total” is the remaining race time, not a lap time or a guarantee.</li>
            </ul>
          </div>
          <details className="strategy-assumptions">
            <summary>Assumptions and limits</summary>
            <ul>
              {assumptions.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
