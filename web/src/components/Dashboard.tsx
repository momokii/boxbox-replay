import { useState } from "react";
import type { Meeting } from "../types";
import type { RecentSetup } from "../recents";

interface Props {
  recents: RecentSetup[];
  meetings: Meeting[];
  year: number | null;
  loadingMeetings: boolean;
  onOpenRecent: (recent: RecentSetup) => void;
  onRemoveRecent: (session: number) => void;
  onClearRecents: () => void;
  onOpenMeeting: (meeting: Meeting) => void;
}

/** Curated meetings first, then the newest ones, without duplicates. */
function suggestions(meetings: Meeting[]): Meeting[] {
  const wanted = ["Monaco", "British", "Italian", "Japanese", "Belgian", "Singapore"];
  const picked: Meeting[] = [];
  for (const name of wanted) {
    const hit = meetings.find((m) => m.meeting_name?.includes(name));
    if (hit) picked.push(hit);
  }
  for (const meeting of [...meetings].reverse()) {
    if (picked.length >= 3) break;
    if (!picked.includes(meeting)) picked.push(meeting);
  }
  return picked.slice(0, 3);
}

/**
 * Landing view when no session is chosen. It never forces a session: the user
 * opens a recent one, a suggestion, or uses the pickers above.
 */
export default function Dashboard({
  recents,
  meetings,
  year,
  loadingMeetings,
  onOpenRecent,
  onRemoveRecent,
  onClearRecents,
  onOpenMeeting,
}: Props) {
  const [confirmClear, setConfirmClear] = useState(false);
  // Do not offer something that is already in Continue.
  const seen = new Set(recents.map((recent) => recent.meeting));
  const picks = suggestions(meetings.filter((meeting) => !seen.has(meeting.meeting_key)));

  return (
    <div className="dash">
      <header className="dash-hero">
        <p className="dash-kicker">Historical F1 · 2023 to today</p>
        <h1>Watch any race again, one frame at a time.</h1>
        <p className="dash-lede">
          Every car on the circuit, live gaps, telemetry, strategy — then ask the race engineer
          what actually happened. Pick a session above, or continue with one you had open.
        </p>
      </header>

      <section className="dash-section" aria-label="Recently opened sessions">
        <div className="dash-section-head">
          <h2>Continue</h2>
          {recents.length > 0 && (
            <button
              type="button"
              className="dash-link"
              onClick={() => {
                if (confirmClear) {
                  onClearRecents();
                  setConfirmClear(false);
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
        {recents.length === 0 ? (
          <p className="dim small">
            Sessions you open are remembered here. Nothing is stored on the server, and you can
            remove any entry.
          </p>
        ) : (
          <ul className="dash-recents">
            {recents.map((recent) => (
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
                  aria-label={`Remove ${recent.label} ${recent.sub} from the list`}
                  title="Remove from this list"
                  onClick={() => onRemoveRecent(recent.session)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="dash-section" aria-label="Suggested sessions">
        <div className="dash-section-head">
          <h2>Start somewhere{year ? ` in ${year}` : ""}</h2>
          {loadingMeetings && <span className="dim small">Loading calendar…</span>}
        </div>
        <div className="dash-grid">
          {picks.map((meeting) => (
            <button
              key={meeting.meeting_key}
              type="button"
              className="dash-card"
              onClick={() => onOpenMeeting(meeting)}
            >
              <span className="dash-card-title">{meeting.meeting_name}</span>
              <span className="dash-card-sub">
                {[meeting.location, (meeting.date_start ?? "").slice(0, 10)].filter(Boolean).join(" · ")}
              </span>
              <span className="dash-card-action">Open the race →</span>
            </button>
          ))}
          {!loadingMeetings && picks.length === 0 && (
            <p className="dim small">Pick a season above to see its calendar.</p>
          )}
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
