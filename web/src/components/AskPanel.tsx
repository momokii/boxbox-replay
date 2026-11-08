import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import {
  clearChat,
  loadChat,
  saveChat,
  type ChatMessage,
} from "../chatStore";

interface Props {
  sessionKey: number;
  sessionLabel: string;
}

const SUGGESTIONS = [
  "Summarise this race in four sentences",
  "Where did the winner lose time on their best lap?",
  "Who had the fastest and slowest pit stop?",
  "Who made the most overtakes?",
  "Which drivers retired, and what happened?",
];

const MAX_QUESTION = 400;

/** Chat with the race engineer, grounded in this session; the key stays server-side. */
export default function AskPanel({ sessionKey, sessionLabel }: Props) {
  const [status, setStatus] = useState<{ ready: boolean; model: string } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<"ask" | "recap" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [showJump, setShowJump] = useState(false);
  const stickRef = useRef(true);

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
    setMessages(loadChat(sessionKey));
    setInput("");
    setError(null);
    stickRef.current = true;
    requestAnimationFrame(() => {
      scrollToBottom(false);
      setShowJump(false);
    });
  }, [sessionKey]);

  const scrollToBottom = (smooth = true) => {
    const el = threadRef.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth && !reduced ? "smooth" : "auto" });
  };

  const nearBottom = () => {
    const el = threadRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };

  useEffect(() => {
    // A new turn should not yank a reader who scrolled up to re-read something.
    if (!stickRef.current) {
      setShowJump(true);
      return;
    }
    const el = threadRef.current;
    if (!el) return;
    // Instant, in a frame: smooth scrolling during a layout change can stall.
    const frame = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
      setShowJump(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [messages, busy, status?.ready]);

  const remember = (next: ChatMessage[]) => {
    setMessages(next);
    saveChat(sessionKey, next);
  };

  const fail = (err: unknown) => {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("503")) {
      setError("The AI is turned off on this deployment: set OPENCODE_API_KEY on the server.");
    } else if (message.includes("422")) {
      setError("That question is outside the length the engineer accepts (3–400 characters).");
    } else if (message.includes("502")) {
      setError("The engineer did not answer this time. Your question is kept — try again.");
    } else {
      setError("Could not reach the AI service. Try again in a moment.");
    }
  };

  const send = async (text: string, base: ChatMessage[] = messages) => {
    const question = text.trim();
    if (busy || question.length < 3) return;
    if (question.length > MAX_QUESTION) {
      setError(`Keep the question under ${MAX_QUESTION} characters.`);
      return;
    }
    const next: ChatMessage[] = [...base, { role: "user", content: question }];
    stickRef.current = true;
    remember(next);
    setInput("");
    setBusy("ask");
    setError(null);
    try {
      const reply = await api.aiChat(
        sessionKey,
        next.map(({ role, content }) => ({ role, content })),
      );
      remember([
        ...next,
        { role: "assistant", content: reply.answer, grounded_on: reply.grounded_on },
      ]);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  const recap = async () => {
    if (busy) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: "Race recap" }];
    stickRef.current = true;
    remember(next);
    setBusy("recap");
    setError(null);
    try {
      const reply = await api.aiRecap(sessionKey);
      remember([
        ...next,
        { role: "assistant", content: reply.answer, grounded_on: reply.grounded_on },
      ]);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  const retry = async () => {
    if (busy) return;
    const lastIndex = messages.map((m) => m.role).lastIndexOf("user");
    if (lastIndex < 0) return;
    // Re-send the failed question on top of the turns before it, with no duplicate.
    const base = messages.slice(0, lastIndex);
    setMessages(base);
    await send(messages[lastIndex].content, base);
  };

  const grow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  };

  const empty = messages.length === 0;

  return (
    <section className="ask" aria-label="Ask the race engineer">
      <header className="ask-head">
        <div>
          <h2>Ask the race engineer</h2>
          <span className="dim small">
            {status?.ready
              ? `Grounded in this session's timings · ${status.model}`
              : status
                ? "AI is not configured on this deployment"
                : "Checking the AI service…"}
          </span>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            className={confirmClear ? "dash-link danger" : "dash-link"}
            onClick={() => {
              if (confirmClear) {
                clearChat(sessionKey);
                setMessages([]);
                setError(null);
                setConfirmClear(false);
              } else {
                setConfirmClear(true);
              }
            }}
            onBlur={() => setConfirmClear(false)}
          >
            {confirmClear ? "Confirm clear" : "Clear chat"}
          </button>
        )}
      </header>

      {status && !status.ready && (
        <p className="duel-note">
          Set <code>OPENCODE_API_KEY</code> (and optionally <code>OPENCODE_MODEL</code>) on the
          server to enable answers. The browser never sees the key.
        </p>
      )}

      <details className="ask-help">
        <summary>What this can and cannot do</summary>
        <ul>
          <li>
            <b>It reads this session's timings only</b> — classification, sectors, pace, pit
            stops, tyre plans, overtakes, weather and race-control notes. No news, video or
            anything outside the replay.
          </li>
          <li>
            <b>It keeps the thread.</b> Follow-up questions use the earlier turns, so you can
            ask “and on which lap?” without repeating the first question.
          </li>
          <li>
            <b>It says when it cannot answer</b>, and it declines questions that are not about
            this race or F1 — politely, in the app's voice.
          </li>
          <li>
            <b>Private by default.</b> The conversation lives in this tab only, is wiped when
            the tab closes, and can be cleared with the button above. Answers are cached on
            the server; the API key never reaches the browser.
          </li>
        </ul>
      </details>

      {status?.ready && (
        <div className="ask-chat">
          <div
            className="ask-thread"
            ref={threadRef}
            role="log"
            aria-live="polite"
            aria-label="Conversation with the race engineer"
            onScroll={() => {
              const near = nearBottom();
              stickRef.current = near;
              setShowJump(!near);
            }}
          >
            {empty && !busy && !error && (
              <div className="ask-empty">
                <p className="ask-empty-title">Ask about {sessionLabel}</p>
                <p className="dim small">
                  Strategy, pace, pit stops, retirements — follow-ups keep the thread. Answers
                  use this session's timings only.
                </p>
              </div>
            )}

            {messages.map((message, index) => (
              <article
                key={index}
                className={message.role === "user" ? "ask-turn user" : "ask-turn engineer"}
              >
                <span className="ask-role">
                  {message.role === "user" ? "You" : "Race engineer"}
                </span>
                <p>{message.content}</p>
                {message.role === "assistant" &&
                message.grounded_on?.length &&
                index === messages.length - 1 ? (
                  <footer className="dim small">
                    grounded in: {message.grounded_on.join(", ")}
                  </footer>
                ) : null}
              </article>
            ))}

            {busy && (
              <div className="ask-turn engineer ask-typing">
                <span className="ask-role">Race engineer</span>
                <p className="dim small">
                  <span className="spinner" aria-hidden="true" />
                  {busy === "recap" ? "Writing the recap…" : "Thinking…"}
                </p>
              </div>
            )}

            {error && (
              <div className="ask-error">
                <p>{error}</p>
                <button type="button" className="dash-link" onClick={retry} disabled={busy !== null}>
                  Retry
                </button>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {showJump && (
            <button type="button" className="ask-jump" onClick={() => scrollToBottom()}>
              Newest ↓
            </button>
          )}

          <div className="ask-composer">
            <div className="ask-suggest" aria-label="Suggested questions">
              <button
                type="button"
                className="ask-prompt recap"
                onClick={recap}
                disabled={busy !== null}
              >
                Race recap
              </button>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="ask-prompt"
                  onClick={() => send(s)}
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
                send(input);
              }}
            >
              <label className="sr-only" htmlFor="ask-question">
                Ask about this race
              </label>
              <textarea
                id="ask-question"
                ref={inputRef}
                className="ask-input"
                value={input}
                rows={1}
                maxLength={MAX_QUESTION}
                placeholder="Ask about this race…"
                onChange={(e) => {
                  setInput(e.target.value);
                  grow(e.target);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                disabled={busy !== null}
              />
              <button
                type="submit"
                className="ask-send"
                disabled={busy !== null || input.trim().length < 3}
              >
                {busy === "ask" ? "Thinking…" : "Send"}
              </button>
            </form>
            <p className="ask-hint">
              Enter to send · Shift+Enter for a new line · {input.length}/{MAX_QUESTION}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
