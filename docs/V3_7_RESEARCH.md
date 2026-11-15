# V3.7 — Freshness, comparison UX and telemetry fixes: research

**Question.** What needs to change so the data feels current, the charts are
readable and explainable, and the comparison views behave like the rest of the
app?

## 1. Freshness and source limits

- **OpenF1 historical data** is free from 2023 onwards and is the replay source.
  A session's positions/laps are historical once the session ends; the app's
  session cache is intentionally immutable. New sessions/meetings are discovered
  through the year/meeting/session lists, which are cached per year.
- **Jolpica** is the standings/results source and is free for non-commercial use
  under CC BY-NC-SA 4.0. Its docs require a custom User-Agent and limit
  unauthenticated use to **4 req/s and 500 req/h**
  ([terms](https://github.com/jolpica/jolpica-f1/blob/main/TERMS.md),
  [limits](https://github.com/jolpica/jolpica-f1/blob/main/docs/rate_limits.md)).
  The data is volunteer-maintained and has no uptime guarantee, so a "current"
  view needs an explicit freshness signal and a retry path, not a promise of
  real-time data.
- **Decision.** Give Jolpica endpoints a readable `fetched_at`, a `refresh=1`
  bypass, a visible "checked" time and a Refresh action. Keep the one-hour
  cache; auto-revalidate the standings table when the tab becomes visible and
  the cached copy is old. OpenF1 replay data stays historical/immutable; its
  metadata caches are not silently presented as live.

## 2. Mini-sector semantics

OpenF1 documents the `segments_sector_*` values as: `2048` yellow sector,
`2049` green sector, `2051` purple sector, `2064` pitlane, `0` not available,
and `2050`/`2052`/`2068` unspecified. It also states: "Segments are not
available during races" and that the values may not always match the TV colours
([OpenF1 docs](https://openf1.org/docs/)).

**Decision.** Show the documented green/purple/yellow/pitlane values, collapse
everything else to "not available", group cells by S1/S2/S3, label each group,
and explain that the feed only carries this in qualifying/practice. Keep the
placeholder guard (≥95% one value → hide the panel). Use the timing tower order
for the driver selector and default to the followed/selected driver so the
panel does not disagree with the rest of the page.

## 3. Chart tooltips and comparison controls

WCAG 2.2 SC 1.4.13 requires content shown on hover/focus to be dismissible,
hoverable and persistent; tooltips should also be usable with keyboard focus
([W3C](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html)).
The standings chart therefore gets a persistent, pointer-following tooltip with
round/race/context, plus a keyboard-focusable driver selector so the chart is
not hover-only.

**Decision.** Make the standings series selectable (top five by default, all
drivers available), add a per-round tooltip with race/date/points and a
point-by-point head-to-head table, and keep the selected set in component state.

## 4. Archive loading and coverage

The archive's current behaviour clears some state but leaves the old table
visible while the next season/race is fetching. That is a context problem, not
a data problem. The archive should cover every available Jolpica season up to
2026; 2023+ also has replay in the main picker, while the archive remains a
results/standings view.

**Decision.** Add explicit loading states for seasons, races, results and final
standings; disable the dependent selectors while loading; clear the old table
and show the pending season/race name. Default to the latest available season,
with copy explaining the replay boundary.

## 5. Telemetry blank chart

The lab's `useCanvasSize` hook measures its wrapper and canvas on mount, but the
canvas is rendered only inside `{data && ...}`. On first mount the canvas does
not exist, so the hook returns width `0`; when data arrives the canvas mounts
but the hook's `[height]` effect does not rerun. The canvas keeps its default
300×150 buffer and nothing is drawn. The fix is to keep the stage/canvas mounted
and overlay loading/error states; then the existing draw effect can run and the
hover readout works.

## 6. Strategy explainability

"From lap" and "Plan" are modelling terms. Users need to know that the model
freezes the race at the chosen lap, projects only the remaining race time, and
compares stay-out vs pit-now using measured clean-lap pace, tyre wear and pit
loss. It is not a live pit wall and does not simulate rivals, weather or safety
cars. The fetch also needs a visible loading state when the lap/driver changes.

## 7. Comparison views

The duel map currently draws only the two current dots; it does not show the two
lap traces, so the "overlay" is missing. Add both full traces in team colours,
plus an input comparison (throttle/brake/gear/DRS) aligned to the same lap
progress. Battle already exposes gap and pace; its comparison is not an inputs
chart, so the inputs comparison belongs in Duel/Telemetry rather than inventing
a second telemetry surface in Battle.

## 8. Buttons, weather and dashboard context

- Share card / Copy link / Save offline are text-like ghost buttons; give them
  visible button affordances, hover/focus states and titles.
- The Performance weather chart already has a hover tooltip; the red blocks in
  the timeline are **red-flag bands** and need a legend + hover explanation.
- The dashboard has no session, so Full/Focus/Data and the 00:00 clock are
  meaningless there; hide them until a session is open.

## Implementation result (v3.7.0)

- Telemetry stage stays mounted; the canvas measures its container before data
  arrives, so the chart draws and hover works.
- Standings: selectable series (Top 5/All/individual), round tooltips with race
  and date, and a round-by-round head-to-head table.
- Jolpica responses carry a checked time; Refresh bypasses the one-hour cache;
  the archive covers every season through 2026 and shows loading/empty states.
- Strategy explains "model from lap", projected totals and assumptions; changes
  show a loading state.
- Mini-sectors fill the card, use tower order, show S1/S2/S3, lap times and the
  documented colour legend.
- Duel draws both full traces and an inputs chart; Battle shows current inputs.
- Dashboard layout/clock controls hide without a session; player actions are
  real buttons; timeline bands have a legend and hover explanation.

## Sources

1. OpenF1 API docs — segment values, race availability, location, historical
   data: <https://openf1.org/docs/>
2. Jolpica terms — free non-commercial, CC BY-NC-SA 4.0:
   <https://github.com/jolpica/jolpica-f1/blob/main/TERMS.md>
3. Jolpica rate limits — 4/s, 500/h, custom User-Agent:
   <https://github.com/jolpica/jolpica-f1/blob/main/docs/rate_limits.md>
4. W3C WCAG 2.2 SC 1.4.13 — content on hover or focus:
   <https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html>
