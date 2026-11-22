# V4.2 Grid UX + 3D plan

**Release target:** `v4.2.0`. Focused UX/game-flow pass on the v4.1 engine.

## Phase 1 — Qualifying phase

**Files:** `web/src/components/GameView.tsx`, `game.css`.

- Add `"qualifying"` to the Game phase union.
- `begin()` shows qualifying when checked; skipped mode goes straight to grid.
- `GameQuali`: single flying-lap session, pole, full order, lap time, gap,
  player badge, “Continue to grid”; same seeded grid as the race.
- Keep the model caption explicit; no Q1/Q2/Q3 claim.

**Acceptance:** checked qualifying shows a qualifying screen before the grid;
skipped qualifying shows the skipped-grid state; both reach the same grid.

## Phase 2 — Grid hover + pace/intention + lap strip

**Files:** `GameView.tsx`, `game.css`.

- Store marker screen positions in `GameCanvas`; add pointer move/leave.
- Hover card: driver, player/AI, position, lap, simulated pace, gap and mode:
  - Leading / Attacking / Defending / Clear air.
- No invented km/h; pace is the Grid speed readout.
- Add a lap strip in `GameRace`, one marker per lap plus `Lap n/N`.
- Keep exact on-circuit markers and player rings.

**Acceptance:** hover works at 1440; a 5-lap 1× race shows each lap and finishes
only at the full distance.

## Phase 3 — 3D selected-driver card

**Files:** `Track3D.tsx`, `SessionMap.tsx`, `index.css`.

- Reuse the existing `hoverInfo` data for the selected 3D driver.
- Add a compact HUD card with code, position, gap, tyre and speed/loading.
- Keep Follow/Overview/Free markers and the schematic pit guide.

**Acceptance:** select a driver in 3D; card matches the tower/2D data; no
WebGL/page errors; mobile remains usable.

## Phase 4 — verification and release

- Full `pytest` + `vitest` + `ruff` + `tsc` + build.
- Browser E2E: qualifying → grid → race → result; skipped qualifying;
  1- and 2-player; hover; lap strip; 1×/4×; Baku 2D/3D; mobile.
- Replace screenshots 55/56/57/61/62; update README/closeout/docs/state.
- Commit per phase; tag `v4.2.0`.

## Completion status

Shipped as `v4.2.0`. Verification and screenshots are recorded in
[`V4_2_CLOSEOUT.md`](./V4_2_CLOSEOUT.md).
