# V4 plan — circuit truth + BoxBox Grid

**Release target:** v4.0.0. Research and boundaries are in
[`V4_RESEARCH.md`](./V4_RESEARCH.md). No feature is claimed until its
acceptance checks pass.

## Goal

Make the replay tell the truth about who is on track and where they are, give
the 3D view a readable sense of scale and place, and add a local race-weekend
game built from real season standings and real circuit shapes.

## Non-goals

- No measured pit-lane geometry or fake elevation from OpenF1.
- No pre-2023 circuit geometry in the game; the archive stays results-only.
- No online play, accounts, AI prediction or hidden “real result”.
- No changes to the free-data policy or the server-side AI key.

## Phase 1 — data truth and exits

**Files:** `web/src/retirements.ts`, `retirements.test.ts`,
`web/src/types.ts`, `web/src/App.tsx`, `SessionMap.tsx`.

1. Add a pure `buildDriverExits(result, laps, start)`:
   - `DNS` exits at 0.
   - `DNF` exits at last lap start + last completed lap duration (or a
     measured median fallback); never at lights out.
   - `DSQ` keeps the car until the recorded finish and then marks it.
   - Drivers missing from result are “OUT” only if the replay/lap evidence
     shows no recent running; otherwise no exit.
2. Pass exits into the 2D and 3D map; hide a car only after `outAt`.
3. Keep tower status tied to exits, not “DNF from the start”.
4. Add a status rail below Replay: `DNF · last lap 40`, `DNS`, `DSQ`.
5. Add a race-control ticker using `/race-control`; no spatial claim.

**Acceptance:** 2026 Canadian GP (11291) has 5 DNF + 1 DNS; retired cars
disappear at their last-lap-derived clock, not at 0, and not at the end. A
classified car is never hidden. Unit tests cover DNS/DNF/DSQ/no-result.

## Phase 2 — 3D/circuit overhaul

**Files:** `web/src/track3d.ts`, `track3d.test.ts`, `Track3D.tsx`,
`SessionMap.tsx`, `index.css`, `App.tsx`.

1. Rebuild pure track geometry:
   - Real relative car/track width in the 100-unit world.
   - Asphalt ribbon, kerbs, edge lines, start/finish, corner markers.
   - Recorded short pit transit ribbon when the feed supports one, otherwise a
     schematic fallback; label the source. Real pit-event badges.
2. Rebuild the car mesh with realistic proportions:
   - 5.6 m length / 2 m width relative to a 12 m track width.
   - front/rear wing, nose, halo, sidepods, wheels, team colour, number/code.
3. Camera modes: **Follow** (default), **Overview**, **Free**.
   - Follow uses the selected/leading car and a smooth chase camera.
   - Overview fits the whole circuit; cars stay true relative size.
   - Free enables OrbitControls.
4. Add a minimap, camera HUD, selected driver readout, and the honest
   “recorded/schematic pit lane / visual track width” note.
5. 2D gets the pit-lane schematic, exit filtering and status chips.
6. Preserve WebGL fallback, lazy chunk, reduced motion and disposal.

**Acceptance:** 1440×900 and 390×844 browser checks; Overview/Follow/Free
transitions; selected car; minimap; 22 cars; DNF cars gone; no WebGL errors;
bundle still lazy; `track3d` tests pass.

## Phase 3 — BoxBox Grid engine

**Files:** `web/src/game.ts`, `game.test.ts`, `web/src/types.ts`.

1. Pure `buildGameDrivers(standings)`:
   - driver 58% points + 42% position;
   - team constructor points normalized;
   - overall 64% driver + 36% team;
   - preserve code/name/team/number; deterministic team colour fallback.
2. Pure qualifying:
   - seeded PRNG (no `Math.random`);
   - stats influence time;
   - AI/player grid order.
3. Pure race:
   - 3/5/10 laps;
   - grid launch, lap pace + seeded variation;
   - continuous `raceSnapshot(elapsed)` for the canvas;
   - final classification, gaps, player markers.
4. Skip qualifying still uses the same model; no uniform random grid.
5. Add a visible model card:
   “64% driver form + 36% team form · seeded variation · not a prediction.”
6. No tyre/pit/reliability claims in v1.

**Acceptance:** unit tests for normalization, duplicate prevention, seed
determinism, grid order, 3/5/10 lap finish, and player badges. Race results
reconcile with finish progress.

## Phase 4 — BoxBox Grid UI

**Files:** `web/src/components/GameView.tsx`, `web/src/game.css`,
`App.tsx`, `Dashboard.tsx`, `index.css`.

1. Full-screen **BoxBox Grid** room, opened from the topbar and Dashboard.
2. Setup:
   - season 2023–2026;
   - Grand Prix (OpenF1 meeting, races only);
   - laps 3/5/10;
   - players 1–4;
   - qualifying run/skip.
3. Driver draft:
   - real standings list with overall, points, team;
   - one driver per player, no duplicates;
   - active player slot; “AI field” for everyone else.
4. Flow: setup → grid → race → result; `Race again`, `New setup`, close.
5. Race canvas:
   - real circuit outline, recorded/schematic pit guide;
   - car markers, player badges P1–P4;
   - timing tower, lap counter, leader;
   - pause/2×/4×/skip.
6. Result: classified table with player markers; no fake real-world framing.
7. Attribution: Jolpica (CC BY-NC-SA 4.0) + OpenF1 circuit; model limitation.

**Acceptance:** 1-player and 4-player local races; duplicate selection blocked;
qualifying skip and run; 3/5/10 laps; retry; mobile layout at 390; keyboard
focus; no page errors.

## Phase 5 — release

1. Update `README.md`, `docs/ARCHITECTURE.md`, `docs/TESTING.md`,
   `docs/screenshots/README.md`, `CLAUDE.md`, `.claude/state/*`.
2. Capture new screenshots:
   - 3D Follow, 3D Overview/minimap, 2D pit lane + status, Grid lobby,
     Grid qualifying/grid, Grid race, Grid result.
3. Run full verification:
   - `pytest`, `vitest`, `ruff`, `tsc`, `npm run build`, `oxlint`;
   - Playwright desktop 1440 and mobile 390;
   - API/browser health; Docker/prod build.
4. Commit in phases; tag `v4.0.0` only when all acceptance checks pass.

## Verification baseline

Current baseline before v4: 93 pytest, 74 vitest, CI green on `v3.13.0`.
Every new test and every new UI flow must be added to the final count and
documented. No screenshot is replaced unless it is re-captured from the new
build.
