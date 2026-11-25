# V4.7.2 plan — incident expiry and loading feedback

**Target:** `v4.7.2`  
**Baseline:** `v4.7.1`

## Phase 1 — active incident lifecycle

- Add `RACE_EVENT_ACTIVE_SECONDS` and `activeRaceEvent(events, elapsed)`.
- Use it for:
  - the race event banner;
  - the live feed current incident;
  - the canvas SC/VSC overlay and crash ring;
  - the incident playback factor.
- Leave `buildRaceFeed` historical reports intact.
- Add a regression test for active → expired.
- E2E: capture active incident, wait past window, assert banner/ring gone and
  feed history still present.

## Phase 2 — loading feedback

- Add a Grid top indeterminate bar for `loading || loadingSessions ||
  preparing`.
- Add spinner + skeleton rows to the driver roster loading state.
- Add spinner inside `Building circuit…`.
- Respect `prefers-reduced-motion`.
- E2E with a delayed standings response: skeleton/bar visible, then clears.

## Phase 3 — docs/release

- Refresh screenshots for loading, active incident and cleared incident.
- Update README, CLAUDE, architecture/testing, screenshots README,
  `V4_7_2_CLOSEOUT.md`, state files; commit/push/tag `v4.7.2`.

## Acceptance

- No incident visual persists beyond its active window; history remains.
- Grid loading has visible motion and an accessible status.
- Existing data failure/retry behavior and all features stay green.

## Shipped

`v4.7.2` shipped on 2026-11-23. Evidence: 94 pytest + 108 vitest, delayed
standings loading skeleton, active VSC spotlight, cleared event after its
window with history retained, and no page errors; screenshots 82/83/84 added.
