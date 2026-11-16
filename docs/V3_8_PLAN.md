# V3.8 — Implementation plan

Release `v3.8.0` — implemented; one commit per phase, docs/screenshots updated with the code.

## Phase 1 — Share card and driver headshots

- Add `angle` to the share-card data and rotate car coordinates by `-(angle)`
  before `layoutTrack`; add a regression test.
- Add `headshot_url` to the driver type; show a lazy remote headshot in the
  driver card with a number fallback on missing/error. Do not rehost images.
- Verify a downloaded card has cars on the circuit and the driver card still
  works when the image 404s.

## Phase 2 — Telemetry and Battle scopes

- Telemetry scope controls: Replay lap / Fixed lap / Full session. Fixed lap
  uses replay lap markers; full session uses 0→duration. Fetch the chosen
  window and label it; keep hover working.
- Battle mode controls: Follow replay (default) / Lap snapshot with lap select
  and Back to replay. Freeze all Battle calculations at the selected marker.
- App passes `lapMarkers`, `duration`, `currentLap`.
- Tests: pure window resolver (replay/fixed/full), and browser checks for
  switching, chart stability and reset.

## Phase 3 — Mini-sector overall/detail

- Add Detail / Overall toggle.
- Overall reduces each sector to its best available status with sector time and
  a count tooltip; keep the documented legend.
- Keep tower-order driver selection and layout.

## Phase 4 — Strategy for non-F1 users

- Add a recommendation banner from the winning option, with the margin and the
  “projected, not live” caveat.
- Add one plain sentence explaining pit loss vs fresh-tyre gain.
- Keep break-even/undercut as secondary details.
- Loading state on every model input change.

## Phase 5 — Docs, screenshots, release

- Update README, ARCHITECTURE, TESTING, DEPLOYMENT, V3 plan, state files.
- Refresh all affected screenshots, including a corrected share card, the
  Telemetry scope, Battle snapshot, Mini overall and Strategy banner.
- Run ruff/pytest/vitest/tsc/build/Playwright; deploy; tag `v3.8.0`.

## Acceptance

- Share-card cars lie on the outline in both themes.
- Telemetry has a stable fixed-lap window and a full-session option; switching
  does not require moving playback.
- Battle can freeze at a lap and return to replay.
- Mini-sectors switch between detail and per-sector overall without breaking
  the legend or driver order.
- Strategy has a clear recommendation and beginner explanation; changing the
  from-lap shows loading.
- Driver headshots appear when available and fall back cleanly.
- 89 pytest and 74 vitest pass; browser flows stay green.
