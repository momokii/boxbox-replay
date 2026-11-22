# V4.2 research — Grid UX and 3D review

**Date:** 2026-11-22. **Baseline:** v4.1.0, commit `ee570c4` / tag `v4.1.0`.

## What the current code actually does

### Qualifying

`GameView.begin()` calls `simulateQualifying()` and immediately sets
`phase = "grid"`. The `quali` checkbox is only passed to `GameGrid` for its
heading. There is no qualifying screen, no timer, no live order and no
“Continue” step. This matches the report: checking qualifying produces nothing
visible beyond a normal grid.

### Grid race clock

`GameRace` maps simulation duration to wall time with
`duration / max(8, laps * 8)`, so 1× is about 8 s per lap. A fresh browser run
on the current tree produced:

| wall time | leader / lap |
|---|---|
| 0 s | Lap 1/5 |
| 8 s | Lap 2/5 |
| 16 s | Lap 3/5 |
| 24 s | Lap 4/5 |
| 32 s | Lap 5/5 |
| ~40 s | result |

The “one lap and done” report is therefore **not reproducible on the current
v4.1 bundle**. Likely causes for seeing it: an older cached bundle, 4× speed,
or pressing Skip. V4.2 adds a visible lap strip/progress so the state is
unambiguous, and a build-version line in the Grid footer.

### Grid canvas interactivity

`GameCanvas` is a draw-only canvas. There are no pointer handlers, no screen
position map, no hover card and no driver readout. The race is a pure time
model, so there is no per-car speed channel like OpenF1 replay telemetry.
The honest interactive data is:

- race position and gap;
- current lap;
- the simulated lap time/pace;
- player/AI identity;
- a derived race mode: attacking / defending / clear air.

Do **not** invent a real km/h speed for the game. Pace and gap are the
defensible readouts. A “model speed” can be added later only with a visible
nominal-circuit assumption.

### 3D

- Follow shows the actual low-poly car; Overview/Free show markers at
  whole-circuit distance.
- Free can orbit; selected car label exists.
- Missing: a selected-driver telemetry card in 3D. The 2D map has hover info
  (`pos/gap/tyre/speed`); 3D should reuse the same data instead of making the
  user go back to the tower.

## Decisions

1. **Add a real qualifying phase** for the first version: a single simulated
   flying-lap session, with pole, full order, gaps, player markers and a
   “Continue to grid” step. Skip still produces the same seeded grid but shows
   the explicit “Qualifying skipped” grid state. No fake Q1/Q2/Q3.
2. **Add Grid hover** to the 2D race canvas: position, player/AI, current lap,
   simulated pace, gap and race mode. No fictitious km/h.
3. **Add a lap strip** to the race header: one segment per selected lap, filled
   by leader progress, plus a `Lap n/N` readout. This makes “one lap” visually
   impossible to miss.
4. **3D selected card**: reuse `hoverInfo` from the 2D map for selected-driver
   position, gap, tyre and speed; put it in the 3D HUD. Keep the camera modes
   and markers as the honest scale solution.
5. Recheck the full Grid E2E path: setup → qualifying (or skipped grid) → race
   (1× and 4×) → result → retry/new setup; 1- and 2-player; mobile.

## Out of scope

- Real driving input, pit stops, tyre compounds, reliability or collision
  simulation in Grid.
- A fabricated km/h speed for the game; only pace/gap/mode.
- A full Q1/Q2/Q3 elimination format.
- Measured pit-lane geometry, elevation or track width in 3D.
EOF
cat > docs/V4_2_GRID_UX_PLAN.md <<'EOF'
# V4.2 Grid UX + 3D plan

**Release target:** `v4.2.0`. Focused UX/game-flow pass on the v4.1 engine.

## Phase 1 — Qualifying phase

**Files:** `web/src/components/GameView.tsx`, `game.css`, `game.ts` tests if
needed.

- Add `"qualifying"` to the Game phase union.
- `begin()` shows qualifying when checked; skipped mode goes straight to the
  grid.
- `GameQuali`:
  - single flying-lap session;
  - pole, full order, lap time, gap, player badge;
  - “Continue to grid”;
  - source/model caption.
- Do not change the seeded `simulateQualifying` math.

**Acceptance:** checked qualifying shows a qualifying screen before the grid;
skipped qualifying shows the skipped-grid state; both reach the same seeded
grid.

## Phase 2 — Grid hover + pace/intention + lap strip

**Files:** `GameView.tsx`, `game.css`, pure helper tests if extracted.

- Store marker screen positions in `GameCanvas`; add pointer move/leave.
- Hover card: driver code, player/AI, position, current lap, gap, simulated
  pace, and mode:
  - attacking if within 1 s of the car ahead;
  - defending if within 1 s of the car behind;
  - clear air otherwise; leader = leading.
- No invented km/h.
- Add a lap strip in `GameRace`: one marker per lap, filled by leader progress,
  plus `Lap n/N`.
- Keep exact on-circuit markers and player rings.

**Acceptance:** hover a car at 1440 and 390 shows a correct card; the tower
remains the authoritative list; a 5-lap 1× race shows each lap and finishes
only at the full distance.

## Phase 3 — 3D selected-driver card

**Files:** `Track3D.tsx`, `SessionMap.tsx`, `index.css`.

- Reuse the existing `hoverInfo` data for the selected 3D driver.
- Add a compact HUD card with code, position, gap, tyre and speed/loading.
- Keep Follow/Overview/Free markers and no duplicate pit line.

**Acceptance:** select a driver in 3D; card matches the 2D driver card/tower;
no page/WebGL errors; mobile remains usable.

## Phase 4 — verification and release

- Full `pytest` + `vitest` + `ruff` + `tsc` + build.
- Browser E2E:
  - 1-player run qualifying → grid → race → result;
  - 2-player skipped qualifying → race;
  - hover card;
  - lap strip;
  - 1× and 4×;
  - Baku 2D/3D; mobile 390.
- Replace screenshots for Grid qualifying/race/hover and 3D selected card.
- Update README/closeout/docs/state; commit per phase; tag `v4.2.0`.
EOF
cd /home/kelanach/Public/main-linux-kelanach/code-berkah-titipan-tuhan/code/personal_prjct/boxbox-replay && git add docs/V4_2_GRID_UX_RESEARCH.md docs/V4_2_GRID_UX_PLAN.md && git commit -q -m "docs(v4.2): audit Grid qualifying, hover, lap state and 3D selected HUD" && git log -1 --oneline