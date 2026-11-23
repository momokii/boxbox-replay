# V4.7.1 close-out — Grid refinement patch

**Release:** `v4.7.1`  
**Baseline:** `v4.7.0`  
**Scope:** Grid race layout, current-clock lap data and metric explanations.

## What changed

### Order directly below the circuit

The order strip is now inside the circuit column immediately below the canvas,
not after the taller feed/desk column. This removes the large blank area under
the circuit and puts the order before the feed/desk on mobile.

### No future laps in the driver modal

`driverLapHistory` now accepts the current model clock and stops at the first
lap after that cutoff. `DriverLapModal` receives the live clock from `GameRace`.

At **Lap 1** the modal now shows:

- `Laps 0/5`;
- `Status Running`;
- “No completed laps yet. Lap 1 is in progress.”

It never renders L2–L5 as if they had happened. A retirement row appears only
after the retirement clock, and `Finished` only after the full model distance.

### Column explanations

All setup, qualifying, grid and race-order headers use the existing accessible
`Info` tooltip:

- **Gap** — seconds behind the leader.
- **Int** — interval to the car directly ahead.
- **Last** — last completed simulated lap.
- **Best** — best completed lap up to the current clock, never future laps.
- **Mode** — Leading = P1; Attacking = within 1 s of the car ahead;
  Defending = within 1 s of the car behind; Clear air = neither.
- **Pos / Team / Player / OVR / Points** — definitions match the model.

### Incident spotlight on the circuit

The latest incident is now drawn on the canvas:

- SC/VSC: amber track overlay;
- crash: red ring at the affected car's last modeled position.

The red event banner and live feed remain; this is a model spotlight, not a
claim of real race control.

## Verification

| Check | Evidence |
|---|---|
| API tests | `.venv/bin/python -m pytest` → **94 passed** |
| Web tests | `cd web && npx vitest run` → **23 files, 107 tests passed** |
| Lint/type/build | ruff clean · `tsc -b` exit 0 · `npm run build` exit 0 |
| Early modal | Lap 1: **0 future rows**, Laps `0/5`, Status `Running` |
| Order layout | order directly below circuit; no blank left column; mobile order before feed/desk |
| Tooltip | Mode header exposes the four-state/1 s rule |
| Incident | VSC track overlay and feed/current event visible |
| 2026 login/data | 25 drivers loaded; no page errors |
| Result card | 1200×630 with v4.7 metrics |

## Screenshots

`80-grid-lap-modal-current.png` and `81-grid-column-tooltip.png` added;
`77`, `78` refreshed. Existing identity/feed/order/mobile captures remain.

## Honest limits

- Headshots are optional OpenF1 assets with a number fallback.
- The live feed and incident spotlight are model-derived, not real race
  control.
- Best/Last/Int/Mode are simulated game values.
