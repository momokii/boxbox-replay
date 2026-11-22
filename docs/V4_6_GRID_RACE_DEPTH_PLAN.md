# V4.6 plan — calmer viewing, per-lap depth and circuit controls

**Target:** `v4.6.0`  
**Baseline:** `v4.5.0`  
**Scope:** BoxBox Grid only. No API or data-source change.

## Phase 0 — research and plan

- Document the current 12 s/lap pace, missing per-lap view, result-card stats,
  VSC playback problem and missing zoom in
  `V4_6_GRID_RACE_DEPTH_RESEARCH.md`.
- Commit this plan before code.

## Phase 1 — 1× and per-lap data

- Change `GAME_SECONDS_PER_LAP` to `20`; update `gameClockScale` tests and
  labels (`1× ≈ 20 s/lap`).
- Add `DriverLapStat` and `driverLapHistory(sim, driverId)` to `game.ts`:
  completed laps, cumulative race time, position, gap, retirement row with
  `time: null`, and incident kind.
- Tests:
  - 5 laps at 1× = 100 wall seconds;
  - all laps present for a finisher;
  - retirement history ends on the DNF lap with null time;
  - positions are non-zero and race time is monotonic.
- UI:
  - `Lap by lap` button in `DriverDesk`;
  - `DriverLapModal` using the existing `Modal` component;
  - best/avg/laps/grid/status summary + per-lap table;
  - double-click on a tower row opens the same modal;
  - responsive table.

## Phase 2 — result image statistics

- Extend `GameCardData` with fastest lap, biggest mover, player count and DNF
  count.
- Compute fastest lap over completed laps only; biggest mover only when a
  driver gained at least one position.
- Draw a four-stat strip above the classification; keep top 10 + players and
  the incident/disclaimer footer.
- Tests for the new fields and DNF preservation.
- Browser: download and inspect the 1200×630 PNG.

## Phase 3 — VSC visual slowdown

- Add `incidentPlaybackFactor(kind, since)`:
  - SC `0.35` for 12 model seconds;
  - VSC `0.45` for 8 model seconds;
  - crash/none `1`.
- Multiply `gameClockScale` by the factor while the latest incident is active.
- Add `playback slowed` to the event banner; keep the stated time loss.
- Test the pure factor; browser checks the VSC clock/cars visibly slow.

## Phase 4 — zoom and angle

- Add `zoom` state (1–2.5, step 0.25) to `GameRace`.
- Add `− / + / Fit` controls in the canvas header and wheel zoom.
- Apply zoom after the Top/Angle projection; keep hit-testing/hover on the
  same projected coordinates.
- Make the Angle rotation/compression more pronounced.
- Browser: zoom in/out, hover/click, angle, reset; no overflow on mobile.

## Phase 5 — E2E, release and docs

- Full flow at 1440×900 and 390×844:
  setup → two-run qualifying → grid → start lights → 1× → VSC slowdown →
  driver modal → zoom/angle → result → result-image download.
- Check no page errors, no horizontal overflow, focus/Escape on the modal.
- Refresh screenshots: 55, 56, 57, 59, 64, 66, 67, 69, 70, 72; add per-lap
  modal, zoom and enriched result-card captures.
- Update README, CLAUDE.md, architecture, testing, screenshots README,
  `V4_6_CLOSEOUT.md`, `.claude/state/*`; commit per progress; tag `v4.6.0`.

## Acceptance

- 1× is 20 s/lap (5 laps ≈100 s).
- Driver modal exposes per-lap stats including a truthful DNF row.
- Result image has winner/classification plus fastest lap, biggest mover,
  players, DNFs and incidents.
- VSC visibly slows playback and labels it; the model time loss remains.
- Zoom controls work in Top and Angle and hit-testing stays correct.
- All tests, builds, browser checks and CI pass.

## Shipped

`v4.6.0` shipped on 2026-11-22. Evidence and screenshots are in
[`V4_6_CLOSEOUT.md`](V4_6_CLOSEOUT.md): 93 pytest + 105 vitest, a Baku 2024
browser pass with two-run qualifying, lights gating, VSC playback slowdown,
per-lap modal, zoom/pan, result download and no page errors. The external
Jolpica and Docker registries were unreachable during the run; the browser
fixture used cached actual 2024 standings, and the container was updated from
the verified `web/dist` build.
