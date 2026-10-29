/** Pit-wall formatting: M:SS.mmm, always 3 decimals, em dash when unmeasurable. */
export function formatLapTime(seconds: number | null | undefined): string {
  if (seconds == null || Number.isNaN(seconds)) return "—";
  const total = Number(seconds);
  const minutes = Math.floor(total / 60);
  return `${minutes}:${(total - minutes * 60).toFixed(3).padStart(6, "0")}`;
}

/** Signed gap: +0.184, — when unknown. */
export function formatGap(seconds: number | null | undefined): string {
  if (seconds == null || Number.isNaN(seconds)) return "—";
  const v = Number(seconds);
  return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(3)}`;
}

/** "1" -> "#1 VER" label lookup helpers operate on plain numbers. */
export function driverTag(driverNumber: number): string {
  return `#${driverNumber}`;
}

export const SECTOR_PURPLE = "#C678DD";
export const SECTOR_GREEN = "#2BD97B";
export const AMBER = "#FFB224";

const COMPOUND_COLORS: Record<string, string> = {
  SOFT: "#E80020",
  MEDIUM: "#FFD12E",
  HARD: "#F5F5F5",
  INTERMEDIATE: "#43B02A",
  WET: "#2E6BFF",
};

export function compoundColor(compound: string | null | undefined): string {
  return COMPOUND_COLORS[(compound ?? "").toUpperCase()] ?? "#8A94A6";
}

export function teamColor(raw: string | null | undefined): string {
  const hex = (raw ?? "").replace("#", "");
  return hex.length === 6 ? `#${hex}` : "#8A94A6";
}
