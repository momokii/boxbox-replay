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

export default function Tower(p: Props) {
  return (
    <div>
      {p.rows.map((r, i) => (
        <button
          key={r.driver}
          onClick={() => p.onToggle(r.driver)}
          title="Toggle highlight"
          style={{
            display: "flex",
            width: "100%",
            alignItems: "center",
            gap: "8px",
            padding: "6px 8px",
            marginBottom: "4px",
            background: r.highlighted ? "#1d2532" : "transparent",
            border: "1px solid #2A3342",
            borderLeft: r.selected ? "3px solid #FFB224" : "3px solid transparent",
            color: "inherit",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span className="dim mono">P{i + 1}</span>
          <span
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "2px",
              background: r.color,
              flexShrink: 0,
            }}
          />
          <span className="mono" style={{ minWidth: "52px" }}>
            {r.code}
          </span>
          <span className="mono dim" style={{ marginLeft: "auto" }}>
            {formatGap(r.gap)}
          </span>
        </button>
      ))}
    </div>
  );
}
