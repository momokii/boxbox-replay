import { useState } from "react";
import { api } from "../api";

interface Pair {
  driver: number;
  lap: number;
}

interface Props {
  sessionKey: number;
  selfLap: Pair | null;
  rivalLap: Pair | null;
  corner: string | null;
  driverName: (n: number) => string;
}

interface Asked {
  loss: number | null;
  flagged: boolean;
  confidence: string;
  answer: string | null;
  llm: boolean;
  basis: string;
}

export default function CoachPanel(p: Props) {
  const [asked, setAsked] = useState<Record<string, Asked>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!p.corner) return <p className="dim">Click a corner diamond on the map.</p>;
  if (!p.selfLap || !p.rivalLap)
    return <p className="dim">Need two timed laps (pick a lap in the table).</p>;

  const key = `${p.corner}:${p.selfLap.driver}:${p.selfLap.lap}:${p.rivalLap.driver}:${p.rivalLap.lap}`;
  const cached = asked[key];

  const ask = async () => {
    if (cached || pending) return;
    setPending(true);
    setError(null);
    try {
      const loss = await api.cornerLoss({
        session_key: p.sessionKey,
        ref: { driver: p.rivalLap!.driver, lap: p.rivalLap!.lap },
        chal: { driver: p.selfLap!.driver, lap: p.selfLap!.lap },
        corner: p.corner!,
      });
      const reply = await api.coachAsk({
        driver: p.driverName(p.selfLap!.driver),
        lap: p.selfLap!.lap,
        ref_driver: p.driverName(p.rivalLap!.driver),
        ref_lap: p.rivalLap!.lap,
        corner: p.corner!,
        loss_s: loss.loss_s,
        lap_delta_s: null,
      });
      setAsked((a) => ({
        ...a,
        [key]: {
          loss: loss.loss_s,
          flagged: loss.flagged,
          confidence: reply.confidence,
          answer: reply.answer,
          llm: reply.llm,
          basis: reply.basis,
        },
      }));
    } catch (e) {
      setError(String(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <div>
      <p>
        Corner <strong>{p.corner}</strong> · #{p.selfLap.driver} lap {p.selfLap.lap} vs #
        {p.rivalLap.driver} lap {p.rivalLap.lap}
      </p>
      {!cached && (
        <button className="primary" onClick={ask} disabled={pending}>
          {pending ? "Asking…" : "Ask engineer"}
        </button>
      )}
      {error && <p>Coach failed: {error}</p>}
      {cached && (
        <>
          <p className="mono">
            Corner loss: {cached.loss == null ? "no overlap" : `${cached.loss >= 0 ? "+" : "−"}${Math.abs(cached.loss).toFixed(3)}s`}
            {cached.flagged ? " · flagged" : ""}
          </p>
          {cached.answer ? (
            <p style={{ whiteSpace: "pre-wrap" }}>{cached.answer}</p>
          ) : (
            <p className="dim">
              LLM unreachable from this deployment — measured loss above stands as-is.
            </p>
          )}
          <p className="dim mono">
            [{cached.confidence}] {cached.basis}
          </p>
        </>
      )}
    </div>
  );
}
