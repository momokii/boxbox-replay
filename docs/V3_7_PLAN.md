# V3.7 — Implementation plan

Release: `v3.7.0`. One commit per phase; docs/screenshots updated with the code.

## Phase 1 — Data freshness and archive

**Backend (`jolpica.py`, `api/main.py`)**
- Add `refresh` support to the cached fetch: bypass and rewrite the cache, but
  keep the 1-hour default TTL and 4/s + 500/h limits.
- Return `fetched_at` (ISO UTC) on standings, progression, archive seasons,
  races and results.
- Progression also returns race context (`round`, `race_name`, `date`).
- Extend tests for refresh, metadata and empty data.

**Frontend (`api.ts`, `types.ts`, `StandingsPanel.tsx`, `ArchiveView.tsx`)**
- Show "Checked HH:MM" and a Refresh button on Standings and Archive.
- Auto-refresh the standings table when the tab becomes visible and the cached
  copy is older than five minutes (manual Refresh remains).
- Archive includes all seasons through the latest (2026). Default to the latest
  season; copy explains that 2023+ replay lives in the picker.
- Explicit loading states for seasons, races, results, standings; disable
  dependent selects and clear stale tables.

## Phase 2 — Standings comparison

- Add driver selection to the chart: top five by default, "All", and individual
  driver chips (minimum one).
- Add a per-round tooltip: round, race name/date, selected drivers' points and
  delta to the best selected driver; keyboard-focusable panel.
- Add a head-to-head section below the chart: two driver selects and a
  round-by-round table with A/B points and Δ.
- Keep the full table and the Drivers/Teams switch.

## Phase 3 — Telemetry, archive, dashboard, buttons, weather

- Telemetry: keep the stage/canvas mounted; overlay loading/error; fix blank
  chart; ensure hover draws a crosshair and a readable tooltip/readout.
- Dashboard: hide layout switch and clock when no session is open.
- Share card / Copy link / Save offline: real button styling, hover/focus and
  titles; keep offline state.
- Timeline: add a legend for VSC/SC/red flag/yellow and a custom hover tooltip;
  explain that red = red flag/session stopped. Weather chart hover remains and
  gets a test.

## Phase 4 — Strategy, mini-sectors, duel

- Strategy: plain-language explanation of "from lap", "option", remaining time,
  pit loss, assumptions; always-visible "how it is measured"; loading state on
  every input change.
- Mini-sectors: full-width responsive layout; S1/S2/S3 headers; driver order
  from the tower and default to followed/selected driver; legend with OpenF1
  semantics; cell tooltips and lap times.
- Duel: draw both full lap traces as a colour overlay; add an aligned inputs
  comparison (throttle/brake/gear/DRS) for A/B with a hover readout.

## Phase 5 — AI quality and release

- AI: add a salient "key facts" line (winner, fastest lap, pit-stop count, SC
  count), explicit "section is authoritative; never claim absence" instruction,
  and measured-vs-model wording. Test the prompt/fact bundle.
- Docs: README latest release, ARCHITECTURE, TESTING, DEPLOYMENT, state files,
  V3 plan; refresh screenshots affected by the UI.
- Verify: ruff + pytest, tsc + vitest, build, Playwright desktop/mobile/offline,
  CI, deploy.

## Acceptance

- No blank Telemetry chart; hovering shows values for each selected driver.
- Standings chart tooltips show round/race/date and points; driver selection and
  head-to-head work; refresh shows a checked time.
- Archive switching shows loading context and never displays the previous
  season's table as if it were the new one.
- Dashboard has no session layout/clock controls.
- Strategy copy explains the model and shows loading while re-running.
- Mini-sectors use the panel width, drivers match tower order/selection, legend
  matches OpenF1 values.
- Duel map has both traces and an inputs comparison.
- Share/copy/save look and behave like buttons; red flag bands are explained.
- 87+ pytest and 68+ vitest pass; browser audit has no page errors.
