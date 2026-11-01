# UI plan v2 — depth per driver, three-way battles, readable wear, sortable tables

## Findings from the current build

- **Driver card "last laps" ignores the replay clock**: it uses the session's
  final five laps (`laps.slice(-5)`), so it never changes while you play. It must
  be the five laps ending at the playhead.
- **Best lap shows a time but not the lap**; tyre age does track the playhead but
  nothing says so.
- **Everything on the card is a summary**: pit stops, overtakes and stints have
  no way to open the underlying rows.
- **Battle is hard-wired to two drivers**; there is no path to a third.
- **Degradation full view repeats drivers** without grouping, and nothing
  explains how to read a wear slope.
- **Tables are unsorted**; lap times cannot be ordered by time or sector.

## Research notes

- Sortable tables: put a real `<button>` inside the header cell, expose
  `aria-sort` on the `<th>` with `ascending`/`descending`, keep the indicator
  visible, and default numeric columns to descending (slowest first is rarely
  useful, slowest-lap hunting is). Source: MDN `aria-sort` semantics.
- Modal dialogs interrupt, so they must be an explicit user action and must trap
  focus / restore it (NN/g). The existing `Modal` already does this.
- For multi-driver comparison, the readable pattern is "one anchor, deltas to
  the anchor": a single reference keeps charts legible as drivers are added.

## Plan (one commit per step)

1. **Driver card, corrected and deeper**
   - Last five laps *up to the playhead*, labelled with the lap range.
   - Best lap shows its lap number; tyre shows the lap it refers to.
   - Four detail buttons open modals: stints & wear, all laps, overtakes, pit
     stops — each with the full rows for that driver.
2. **Battle with up to three drivers**
   - A is the anchor; B and C optional. Relative-gap chart plots B−A and C−A.
   - Pace deltas are measured against A; the head-to-head panel becomes a
     pairwise matrix (A–B, A–C, B–C) so no information is lost.
3. **Degradation grouped by driver with a reading guide**
   - Group stints per driver, one header row per driver (total wear, stints) and
     its stints beneath; inline list stays capped, full view lists everything.
   - Add a plain-language "how to read this" block: what a slope is, what makes
     it big, why some stints say "too few laps".
4. **Sortable tables**
   - Shared hook + accessible headers (`aria-sort`, real buttons, visible
     indicator). Applied to lap times (time, S1, S2, S3), degradation (wear,
     laps), pit stops (stop time), overtakes (time, position).
   - Numeric columns open descending; text columns ascending; stable tie-break.

## Verification

`pytest`, `vitest`, `tsc`, `oxlint`, and screenshots of every new surface,
plus a frame-timing check to confirm playback still runs at 60 fps.


## Shipped (verified)

| Step | What landed |
|---|---|
| 1 | Driver card laps follow the playhead (L21–L25 at lap 25), best lap names its lap (L50), tyre badge says the lap it refers to, and four drill-downs: stints & wear, all laps, overtakes, pit stops (red-flag "stops" filtered with a note) |
| 2 | Battle takes an anchor plus up to two challengers; relative-gap chart draws one line per challenger, pace deltas are measured against the anchor, and head-to-head became a pairwise matrix |
| 3 | Degradation grouped per driver (header with stint count and steepest rate), one bar per stint, scale 0–0.6 s/lap, plus a "How to read this" guide explaining slope, comparison, thresholds and "too few laps" |
| 4 | Sortable tables with real buttons and `aria-sort`: lap times (lap, driver, time, S1–S3 — fastest first), degradation in the modal, pit stops; stable ordering, empties always last, 5 new unit tests |

Measured after the work: playback still holds 60 fps (p50 16.7 ms, p95 16.8 ms)
and no page errors on any of the new surfaces.
