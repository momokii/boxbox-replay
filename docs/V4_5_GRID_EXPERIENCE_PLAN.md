# V4.5 plan — Grid viewing pace, two-run qualifying, start lights and result image

**Target:** `v4.5.0`  
**Baseline:** `v4.4.0`  
**Scope:** BoxBox Grid only. No API or data-source change.

## Phase 0 — research and plan

- Record the current 8 s/lap pace, single-attempt qualifying, missing start
  transition and missing result export in
  `V4_5_GRID_EXPERIENCE_RESEARCH.md`.
- Commit this plan before code.

## Phase 1 — pacing + qualifying depth

### 1a. 1× viewing pace

- Add `GAME_SECONDS_PER_LAP = 12` and a pure
  `gameClockScale(duration, laps)` helper in `game.ts`.
- Use it in `GameRace`; update `1× = ~12 s/lap`.
- Tests: 5 laps at 1× completes in 60 s of wall time; scale is positive and
  deterministic.

### 1b. Two qualifying runs

- Extend `QualiRow` with `attempts: number[]`; exactly two seeded times per
  driver; `time` is the best.
- Keep the same sort/position contract and no `Math.random`.
- Tests: two attempts, best equals minimum, order by best, deterministic.
- UI:
  - header: “Two flying laps. The order is set.”
  - progress copy: `Live session · N/field drivers`;
  - summary facts: Pole, Best lap, P2 gap, Player, Runs, Field;
  - wide progress bar (100% of the main column);
  - table adds `Runs` with both attempts and keeps `Lap time` as best;
  - mobile hides Team and Gap before Runs; no horizontal overflow.
  - How panel copy: two flying laps, best counts.

## Phase 2 — start lights

- Change the grid button to **Start race →**.
- In `GameRace`, add a `ready` state and a five-light sequence:
  - lights on one at a time, then out;
  - do not advance the clock until started;
  - disable pause/speed/Skip during the sequence;
  - clear timers on unmount;
  - `role="status"` + `aria-live="polite"`.
- Canvas remains visible at `t=0` during the sequence.
- Tests: pure pacing remains; browser asserts clock is at 0 during lights and
  advances after.

## Phase 3 — result image

- Add `web/src/gameShareCard.ts`:
  - pure `GameCardData`/row selection/format helpers;
  - 1200×630 canvas drawing with winner, meeting, laps, seed, classification,
    incidents and player badges;
  - `downloadGameShareCard()` using `canvas.toBlob` + `<a download>`.
- Add `Download result image` to `GameResult`; catch failures and show an
  inline message.
- Add pure tests for top-10 selection, DNF preservation and determination of
  winner/incidents.
- Browser: download the PNG, verify 1200×630 and inspect it visually.

## Phase 4 — E2E and docs

- Run the complete flow on desktop 1440×900 and mobile 390×844:
  setup → two-run qualifying → grid → start lights → 1× race → event → desk
  → angle → result → result-image download.
- Verify no page errors and no horizontal overflow.
- Refresh `55`, `56`, `57`, `59`, `64`; add start-light and result-card images;
  update `53/54` only if the visible copy changes.
- Update README, CLAUDE.md, architecture, testing, screenshots README,
  `V4_5_CLOSEOUT.md`, `.claude/state/*`; commit per progress; tag `v4.5.0`.

## Acceptance

- 1× is visibly slower: 5-lap race takes about 60 s, not 40 s.
- Qualifying has two attempts per driver, best counts, and the summary card is
  fully composed with no short bar/blank band.
- Start race shows five lights and the clock does not run until lights out.
- Result image downloads as a valid 1200×630 PNG with winner, classification,
  player badges, incidents and the model disclaimer.
- All unit, build, lint, browser and CI checks pass.
