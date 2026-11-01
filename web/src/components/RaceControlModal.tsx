import { useMemo, useState } from "react";
import { formatClock } from "../session";
import Modal from "./Modal";

interface Props {
  open: boolean;
  onClose: () => void;
  rows: Record<string, unknown>[];
  categories: string[];
  onSeek: (t: number) => void;
}

/**
 * Full race-control log: filter by category, search the text, jump to a moment.
 * Everything shown comes straight from the session feed.
 */
export default function RaceControlModal(p: Props) {
  const [category, setCategory] = useState<string>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return p.rows
      .map((r) => ({
        t: Number(r.t ?? 0),
        category: String(r.category ?? "Other"),
        flag: r.flag ? String(r.flag) : "",
        scope: r.scope ? String(r.scope) : "",
        message: String(r.message ?? ""),
        lap: r.lap_number != null ? Number(r.lap_number) : null,
        driver: r.driver_number != null ? Number(r.driver_number) : null,
      }))
      .filter((r) => category === "all" || r.category === category)
      .filter(
        (r) =>
          !q ||
          r.message.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q) ||
          r.flag.toLowerCase().includes(q),
      )
      .sort((a, b) => a.t - b.t);
  }, [p.rows, category, query]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of p.rows) {
      const c = String(r.category ?? "Other");
      m.set(c, (m.get(c) ?? 0) + 1);
    }
    return m;
  }, [p.rows]);

  return (
    <Modal
      open={p.open}
      onClose={p.onClose}
      title="Race control"
      subtitle={`${p.rows.length} messages for this session — click a time to jump the replay`}
      size="wide"
    >
      <div className="row" style={{ marginBottom: 8, gap: 8 }}>
        <input
          type="search"
          placeholder="Search messages, flags or categories…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ minWidth: 260 }}
          aria-label="Search race control"
        />
        <span className="dim small">{filtered.length} shown</span>
      </div>

      <div className="row" style={{ marginBottom: 10 }}>
        <button className={category === "all" ? "chip on" : "chip"} onClick={() => setCategory("all")}>
          All ({p.rows.length})
        </button>
        {p.categories.map((c) => (
          <button key={c} className={category === c ? "chip on" : "chip"} onClick={() => setCategory(c)}>
            {c} ({counts.get(c) ?? 0})
          </button>
        ))}
      </div>

      <div className="laps-wrap" style={{ maxHeight: "52vh" }}>
        <table className="laps mono" style={{ fontSize: "0.82rem" }}>
          <thead>
            <tr>
              <th>Time</th>
              <th>Lap</th>
              <th>Category</th>
              <th>Flag</th>
              <th style={{ textAlign: "left" }}>Message</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={i} onClick={() => p.onSeek(r.t)} style={{ cursor: "pointer" }}>
                <td className="mono">{formatClock(r.t)}</td>
                <td>{r.lap ?? "—"}</td>
                <td>{r.category}</td>
                <td>{r.flag || "—"}</td>
                <td style={{ textAlign: "left", whiteSpace: "normal" }}>{r.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && <p className="dim small">No messages match that filter.</p>}
    </Modal>
  );
}
