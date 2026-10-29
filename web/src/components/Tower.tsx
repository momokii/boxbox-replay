import { formatGap } from "../format";

export interface TowerRow {
  driver: number;
  code: string;
  color: string;
  gap: number | null;
  highlighted: boolean;
  selected: boolean;
}

interface Props {
  rows: TowerRow[];
  onToggle: (driver: number) => void;
}

/** Order is position — no P-numbers needed. */
export default function Tower(p: Props) {
  return (
    <div>
      {p.rows.map((r) => (
        <button
          key={r.driver}
          onClick={() => p.onToggle(r.driver)}
          title="Toggle highlight"
          aria-pressed={r.highlighted}
          className={`tower-row${r.highlighted ? " lit" : ""}${r.selected ? " sel" : ""}`}
        >
          <span className="tower-chip" style={{ background: r.color }} />
          <span className="tower-code">{r.code}</span>
          <span className="tower-gap">{formatGap(r.gap)}</span>
        </button>
      ))}
    </div>
  );
}
