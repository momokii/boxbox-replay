import { compoundColor } from "../format";
import type { Stint } from "../types";

export interface DegRow {
  stint: Stint;
  slope: number | null;
}

export interface DegGroup {
  driver: number;
  rows: DegRow[];
}

interface Props {
  groups: DegGroup[];
  driverCode: (n: number) => string;
  driverColor?: (n: number) => string;
  /** Units at full bar width; when omitted it adapts to the data shown. */
  scaleMax?: number;
  /** Show at most this many drivers (undefined = every driver). */
  maxGroups?: number;
  note?: React.ReactNode;
}

/**
 * Wear per stint, grouped by driver.
 *
 * The same grouping is used inline (capped) and in the full view (complete), so
 * a driver with three stints reads as one entry rather than three.
 */
export default function DegradationList(p: Props) {
  const shown = p.maxGroups == null ? p.groups : p.groups.slice(0, p.maxGroups);
  if (!shown.length) return <p className="dim small">No stint has enough timed laps to measure wear.</p>;

  // Wear rates span an order of magnitude between drivers, so a single axis
  // leaves most bars as slivers. Bars are scaled per driver (their steepest
  // stint fills the width) and the absolute rate is always printed.
  const scaleFor = (rows: DegRow[]) =>
    p.scaleMax ?? Math.max(0.05, ...rows.map((r) => Math.abs(r.slope ?? 0)));

  return (
    <div className="deg-bars">
      {shown.map((g) => {
        const worst = Math.max(...g.rows.map((r) => r.slope ?? 0));
        const groupScale = scaleFor(g.rows);
        return (
          <div key={g.driver} className="deg-group">
            <div className="deg-group-head">
              <span
                className="mono"
                style={{ fontSize: "0.84rem", color: p.driverColor?.(g.driver) ?? "var(--ink)" }}
              >
                {p.driverCode(g.driver)}
              </span>
              <span className="dim small">
                {g.rows.length} stint{g.rows.length > 1 ? "s" : ""} · steepest +{worst.toFixed(3)}s/lap
              </span>
            </div>
            {g.rows.map(({ stint, slope }) => {
              const width = slope == null ? 0 : Math.min(100, (Math.max(0, slope) / groupScale) * 100);
              return (
                <div key={`${stint.driver_number}-${stint.lap_start}`} className="deg-row">
                  <span className="row" style={{ gap: 5 }}>
                    <i className="tower-chip" style={{ background: compoundColor(stint.compound) }} />
                    <span className="dim small">{stint.compound ?? "?"}</span>
                  </span>
                  <span className="dim small mono">
                    L{stint.lap_start ?? "?"}–{stint.lap_end ?? "?"}
                  </span>
                  <span className="deg-track">
                    <span
                      className="deg-bar"
                      style={{
                        width: `${slope == null ? 0 : Math.max(2, width)}%`,
                        background: compoundColor(stint.compound),
                        opacity: slope == null ? 0.25 : 0.85,
                      }}
                    />
                  </span>
                  <span className="mono small" style={{ textAlign: "right" }}>
                    {slope == null ? "too few laps" : `+${slope.toFixed(3)}s`}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
      <p className="dim small" style={{ marginTop: 6 }}>
        Bars are scaled <strong>within each driver</strong> — their steepest stint fills the width — and the
        absolute rate is printed on the right. Compare across drivers by number, not by bar length.
      </p>
      {p.note && (
        <p className="dim small" style={{ marginTop: 2 }}>
          {p.note}
        </p>
      )}
    </div>
  );
}
