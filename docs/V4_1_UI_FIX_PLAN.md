# V4.1 UI fix plan

**Release target:** `v4.1.0`. This is a focused correction of v4.0.0 based on
the screenshots in the user report. Research is in
[`V4_1_UI_FIX_RESEARCH.md`](./V4_1_UI_FIX_RESEARCH.md).

## Phase 1 — pit overlay semantics

**Files:** `web/src/pitlane.ts`, `pitlane.test.ts`, `SessionMap.tsx`,
`Track3D.tsx`, `index.css`, docs.

- Remove the recorded pit-transit path from the rendered map. It was ambiguous
  and could read as a second circuit.
- Build a **short schematic lane** parallel to the start/finish section:
  - solid line/ribbon, not dashed;
  - explicit `PIT LANE · schematic` label;
  - no raw or recorded coordinates presented as measured geometry.
- Keep the active pit **transit ring** on the 2D car markers from real pit
  events; the ring is an event indicator, not a lane.
- Remove the old “recorded transit (approximate)” note.

**Acceptance:** Baku 2D has one track ribbon and one short labelled pit lane;
3D has no second circuit ribbon.

## Phase 2 — 3D Free / Overview car visibility

**Files:** `Track3D.tsx`, `index.css`.

- Keep actual 3D cars in Follow.
- Show car markers in Overview **and Free** while the camera is far from the
  focus; hide markers when Free is close enough to read the car itself.
- Selected/focused label remains.
- No camera or pit geometry that implies measured width/elevation.

**Acceptance:** Baku 3D Free shows the field as markers at whole-circuit zoom;
Follow shows the car; no WebGL/page errors.

## Phase 3 — Grid race correctness

**Files:** `GameView.tsx`, `game.ts` tests if needed.

- Remove the lateral marker stagger entirely. Cars must sit on the circuit at
  their actual lap progress.
- Use an amber ring/badge for human players; do not move them sideways.
- Slow 1× to ≈8 s per lap (`laps * 8` target); keep 2×/4×.
- Keep default 5 laps; ensure the finish transition fires only at the simulated
  duration and the lap counter matches.
- Scroll the Game view to the top on phase changes.
- Keep tower/order as the disambiguation surface for a tight pack.

**Acceptance:** 5-lap 1× race runs ≈40 s; every marker stays on the asphalt;
result arrives only after 5 laps; 1/2-player and skipped-qualifying flows pass.

## Phase 4 — verification and release

- Unit tests: pit schematic, game lap/finish, no duplicate players.
- `pytest` (unchanged API) + `vitest` + `ruff` + `tsc` + build.
- Browser: Baku 2024 2D/3D Free/Follow/Overview, Grid 1×/2-player/skip, 390 px.
- New screenshots replace the affected v4 images; README/docs/state updated.
- Commit per phase; tag `v4.1.0`; CI green; production health.

## Explicit non-goals

- No measured pit lane, track width or elevation.
- No pre-2023 Grid circuits.
- No tyre/pit/collision/reliability game model.
- No new server endpoint or paid data.


## Completion status

Shipped as `v4.1.0`. See [`V4_1_CLOSEOUT.md`](./V4_1_CLOSEOUT.md) for the
final browser evidence and screenshots 49–60.
