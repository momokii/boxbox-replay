/**
 * Battles at the current replay frame: adjacent drivers in classification
 * order whose gaps are within a threshold. A live snapshot, not a historical
 * list — the interval feed is too sparse for reliable back-scanning.
 */

export interface GapRow {
  driver: number;
  gap: number | null;
}

export interface Battle {
  a: number;
  b: number;
  gap: number;
}

/** Sort by gap, compare neighbours, keep pairs within `threshold` seconds. */
export function currentBattles(rows: GapRow[], threshold = 1.0): Battle[] {
  const ranked = rows
    .filter((row): row is { driver: number; gap: number } => row.gap != null && Number.isFinite(row.gap))
    .sort((x, y) => x.gap - y.gap);
  const battles: Battle[] = [];
  for (let i = 0; i < ranked.length - 1; i += 1) {
    const a = ranked[i];
    const b = ranked[i + 1];
    const gap = b.gap - a.gap;
    if (gap <= threshold) battles.push({ a: a.driver, b: b.driver, gap });
  }
  return battles.sort((x, y) => x.gap - y.gap);
}
