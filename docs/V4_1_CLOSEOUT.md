# v4.1 close-out — pit-overlay and Grid correction

**Release:** `v4.1.0`, a focused correction of v4.0.0. No data source, API
endpoint or product model changed.

## Fixed

- **Baku 2D pit overlay.** The recorded pit-transit path produced white dashes
  that read as a second racing line. It is removed. Both 2D and 3D now draw a
  short, solid, **schematic** pit lane beside the start/finish section with a
  visible `PIT LANE · schematic` label. No measured pit geometry is claimed.
- **3D Free / Overview car visibility.** True-scale cars remain in Follow.
  Overview and far Free views now show car markers so the field is visible at
  whole-circuit distance; Free close-up keeps the actual car. The extra
  recorded line is gone.
- **BoxBox Grid track positions.** The sideways “legibility stagger” was
  removed. Cars use actual lap progress; human players get an amber ring and a
  P badge, not a fake position.
- **BoxBox Grid clock.** 1× is now about 8 seconds per lap (5 laps ≈ 40 s,
  10 laps ≈ 80 s), with 2×/4× and Skip. The default 5 laps remains; the finish
  transition waits for the simulated distance.
- **Grid scroll.** The Game view scrolls to the stage top on phase changes, so
  the race header and lap counter are visible.

## Boundaries

- Pit lane is schematic; OpenF1 location has no lateral placement and no metric
  width. Track width remains a visual constant. No elevation is invented.
- Grid still supports only 2023–2026 circuits, uses final/current Jolpica
  standings, and does not simulate tyres, pit stops, collisions or reliability.
- The 2D map remains the analytical surface; 3D remains optional/lazy-loaded.

## Verification

- **93 pytest + 93 vitest**
- `ruff`, `tsc`, Vite build, CI
- Baku 2024 (`session_key=9598`) at 1440:
  - 2D: one circuit, one short labelled schematic pit lane, no white dashes
  - 3D Follow: actual car visible
  - 3D Overview/Free: field markers visible, no duplicate circuit line
- BoxBox Grid, Canada 2026:
  - 1× 5-lap race: still on **lap 2/5 after 8 s**; no one-lap finish
  - all race markers stay on the circuit
  - 1- and 2-player, skipped qualifying, result/retry pass
- No page errors in the browser checks.

Screenshots: `docs/screenshots/49`–`60`. Research/plan:
[`V4_1_UI_FIX_RESEARCH.md`](./V4_1_UI_FIX_RESEARCH.md),
[`V4_1_UI_FIX_PLAN.md`](./V4_1_UI_FIX_PLAN.md).
