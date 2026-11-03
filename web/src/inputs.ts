/**
 * Sampling helpers for the inputs strip. Pure, so the canvas and the readout
 * always quote the same sample.
 */

/** Index of the last sample at or before `t` (binary search, -1 when empty). */
export function sampleIndex(times: number[], t: number): number {
  if (!times.length) return -1;
  if (t <= times[0]) return 0;
  if (t >= times[times.length - 1]) return times.length - 1;
  let lo = 0;
  let hi = times.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** DRS is open for the codes the feed uses (8 and above); null means unknown. */
export function drsState(code: number | null | undefined): "open" | "closed" | "unknown" {
  if (code == null) return "unknown";
  return code >= 8 ? "open" : "closed";
}
