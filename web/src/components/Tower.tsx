import { formatGap } from "../format";

export interface TowerRow {
  driver: number;
  code: string;
  color: string;
  gap: number | null;
  position?: number | null;
  highlighted: boolean;
  selected: boolean;
  status?: "DNF" | "DNS" | "DSQ" | null;
}

interface Props {
  rows: TowerRow[];
  onToggle: (driver: number) => void;
}

/** Order is position — no P-numbers needed. */
export default function Tower(p: Props) {
  return (
    <div>
      {p.rows.map((r, i) => (
        <button
          key={r.driver}
          onClick={() => p.onToggle(r.driver)}
          title="Toggle highlight"
          aria-pressed={r.highlighted}
          className={`tower-row${r.highlighted ? " lit" : ""}${r.selected ? " sel" : ""}`}
        >
          <span className="tower-pos">{r.status ? "" : i + 1}</span>
          <span className="tower-chip" style={{ background: r.color }} />
          <span className="tower-code">{r.code}</span>
          {r.status ? (
            <span className="tower-gap dim">{r.status}</span>
          ) : (
            <span className={r.gap == null ? "tower-gap pending" : "tower-gap"}>{formatGap(r.gap)}</span>
          )}
        </button>
      ))}
    </div>
  );
}
