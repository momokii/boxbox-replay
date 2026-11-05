import { useEffect, useState } from "react";
import { api } from "../api";

interface Props {
  sessionKey: number;
  sessionLabel: string;
}

interface Answer {
  question: string;
  answer: string;
  grounded_on: string[];
}

const SUGGESTIONS = [
  "Summarise this race in four sentences",
  "Where did the winner lose time on their best lap?",
  "Who had the best strategy, and why?",
  "Who made the most overtakes?",
  "Which drivers retired, and what happened?",
];

/** Grounded Q&A over the measured session data; the key stays on the server. */
export default function AskPanel({ sessionKey, sessionLabel }: Props) {
  const [status, setStatus] = useState<{ ready: boolean; model: string } | null>(null);
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<Answer[]>([]);
  const [busy, setBusy] = useState<"ask" | "recap" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api
      .aiStatus()
      .then((s) => live && setStatus({ ready: s.ready, model: s.model }))
      .catch(() => live && setStatus({ ready: false, model: "" }));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    setHistory([]);
    setError(null);
  }, [sessionKey]);

  const run = async (kind: "ask" | "recap", text: string) => {
    const trimmed = text.trim();
    if (kind === "ask" && (trimmed.length < 3 || trimmed.length > 300)) {
      setError("Keep the question between 3 and 300 characters.");
      return;
    }
    setBusy(kind);
    setError(null);
    try {
      const response =
        kind === "recap" ? await api.aiRecap(sessionKey) : await api.aiAsk(sessionKey, trimmed);
      setHistory((prev) =>
        [
          {
            question: kind === "recap" ? "Race recap" : trimmed,
            answer: response.answer,
            grounded_on: response.grounded_on,
          },
          ...prev,
        ].slice(0, 6),
      );
      if (kind === "ask") setQuestion("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("503")) {
        setError("The AI is turned off on this deployment: set OPENCODE_API_KEY on the server.");
      } else if (message.includes("422")) {
        setError("Keep the question between 3 and 300 characters.");
      } else if (message.includes("502")) {
        setError("The AI provider did not answer. Try again in a moment.");
      } else {
        setError("Could not reach the AI service. Try again in a moment.");
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="ask" aria-label="Ask the race engineer">
      <header className="ask-head">
        <h2>Ask the race engineer</h2>
        <span className="dim small">
          {status?.ready
            ? `Answers are built only from this session's measured data · ${status.model}`
            : status
              ? "AI is not configured on this deployment"
              : "Checking the AI service…"}
        </span>
      </header>

      {status && !status.ready && (
        <p className="duel-note">
          Set <code>OPENCODE_API_KEY</code> (and optionally <code>OPENCODE_MODEL</code>) on the
          server to enable answers. The browser never sees the key.
        </p>
      )}

      {status?.ready && (
        <>
          <div className="ask-actions">
            <button
              type="button"
              className="ask-recap"
              onClick={() => run("recap", "")}
              disabled={busy !== null}
            >
              {busy === "recap" ? "Writing…" : "Write the race recap"}
            </button>
            <span className="dim small">{sessionLabel}</span>
          </div>

          <div className="ask-chips">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                className="chip"
                onClick={() => run("ask", s)}
                disabled={busy !== null}
              >
                {s}
              </button>
            ))}
          </div>

          <form
            className="ask-form"
            onSubmit={(e) => {
              e.preventDefault();
              run("ask", question);
            }}
          >
            <label className="sr-only" htmlFor="ask-question">
              Ask about this race
            </label>
            <input
              id="ask-question"
              className="ask-input"
              value={question}
              maxLength={300}
              placeholder="Ask about this race — strategy, pace, overtakes…"
              onChange={(e) => setQuestion(e.target.value)}
              disabled={busy !== null}
            />
            <button type="submit" className="ask-send" disabled={busy !== null || question.trim().length < 3}>
              {busy === "ask" ? "Thinking…" : "Ask"}
            </button>
          </form>
          {error && <p className="duel-note duel-error">{error}</p>}

          <div className="ask-history">
            {history.map((item, index) => (
              <article key={`${item.question}-${index}`} className="ask-answer">
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
                <footer className="dim small">
                  grounded in: {item.grounded_on.length ? item.grounded_on.join(", ") : "session data"}
                </footer>
              </article>
            ))}
            {history.length === 0 && !busy && (
              <p className="dim small">
                Pick a suggestion or ask your own question. Answers quote the measured data and
                say so when the data cannot answer.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
