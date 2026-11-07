import { useMemo, useState } from "react";
import type { RecentSetup } from "../recents";

interface Props {
  recents: RecentSetup[];
  onOpenRecent: (recent: RecentSetup) => void;
  onRemoveRecent: (session: number) => void;
  onClearRecents: () => void;
  onSurprise: () => void;
  surprising: boolean;
}

/**
 * Landing view when no session is chosen. It never forces a session: the user
 * opens a recent one, rolls the dice, or uses the pickers above.
 */
export default function Dashboard({
  recents,
  onOpenRecent,
  onRemoveRecent,
  onClearRecents,
  onSurprise,
  surprising,
}: Props) {
  const [filter, setFilter] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return recents;
    return recents.filter((recent) =>
      `${recent.label} ${recent.sub} ${recent.year}`.toLowerCase().includes(needle),
    );
  }, [recents, filter]);

  return (
    <div className="dash">
      <header className="dash-hero">
        <p className="dash-kicker">Historical F1 · 2023 to today</p>
        <h1>Watch any race again, one frame at a time.</h1>
        <p className="dash-lede">
          Every car on the circuit, live gaps, telemetry, strategy — then ask the race engineer
          what actually happened. Pick a session above, continue where you left off, or let the
          app choose for you.
        </p>
      </header>

      <section className="dash-section" aria-label="Recently opened sessions">
        <div className="dash-section-head">
          <h2>
            Continue
            {recents.length > 0 && <span className="dash-count">{recents.length}</span>}
          </h2>
          <div className="dash-head-actions">
            {recents.length > 4 && (
              <input
                className="dash-filter"
                type="search"
                value={filter}
                placeholder="Filter sessions…"
                aria-label="Filter recent sessions"
                onChange={(e) => setFilter(e.target.value)}
              />
            )}
            {recents.length > 0 && (
              <button
                type="button"
                className={confirmClear ? "dash-link danger" : "dash-link"}
                onClick={() => {
                  if (confirmClear) {
                    onClearRecents();
                    setConfirmClear(false);
                    setFilter("");
                  } else {
                    setConfirmClear(true);
                  }
                }}
                onBlur={() => setConfirmClear(false)}
              >
                {confirmClear ? "Confirm clear" : "Clear list"}
              </button>
            )}
          </div>
        </div>

        {recents.length === 0 ? (
          <p className="dim small">
            Sessions you open are remembered here, on this device only. Open one and it will be
            one click away next time.
          </p>
        ) : shown.length === 0 ? (
          <p className="dim small">No session matches “{filter}”.</p>
        ) : (
          <ul className={recents.length > 4 ? "dash-recents scroll" : "dash-recents"}>
            {shown.map((recent) => (
              <li key={recent.session} className="dash-recent">
                <button
                  type="button"
                  className="dash-recent-open"
                  onClick={() => onOpenRecent(recent)}
                >
                  <span className="dash-recent-title">{recent.label}</span>
                  <span className="dash-recent-sub">{recent.sub}</span>
                </button>
                <button
                  type="button"
                  className="dash-recent-remove"
                  aria-label={`Remove ${recent.label}, ${recent.sub}, from the list`}
                  title="Remove from this list"
                  onClick={() => onRemoveRecent(recent.session)}
                >
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
                    <path
                      d="M4 4l8 8M12 4l-8 8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="dash-section" aria-label="Random session">
        <div className="dash-section-head">
          <h2>Can’t decide?</h2>
        </div>
        <div className="dash-lucky">
          <div>
            <p className="dash-lucky-title">Roll the dice</p>
            <p className="dim small">
              A random season, circuit and session that has telemetry — anything from 2023 to
              today, races and qualifying alike.
            </p>
          </div>
          <button type="button" className="dash-surprise" onClick={onSurprise} disabled={surprising}>
            {surprising ? "Looking for one…" : "Surprise me"}
          </button>
        </div>
      </section>

      <section className="dash-section dash-how">
        <h2>How it works</h2>
        <ol>
          <li>
            <b>Choose a session.</b> Races, qualifying or practice, back to 2023.
          </li>
          <li>
            <b>Watch it back.</b> Play, scrub or jump to a lap; follow any driver.
          </li>
          <li>
            <b>Dig in.</b> Compare laps, replay a duel, read the inputs, ask the engineer.
          </li>
        </ol>
        <p className="dim small">
          Data comes from the free OpenF1 historical feed. The first time you open a race it
          builds a local cache in about a minute; after that it is instant.
        </p>
      </section>
    </div>
  );
}
