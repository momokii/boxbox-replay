# V4.7.1 plan — Grid refinement patch

**Target:** `v4.7.1`  
**Baseline:** `v4.7.0`

## Phase 1 — layout

- Move the order section inside `.game-canvas-wrap` so it starts directly
  below the circuit instead of waiting for the taller feed/desk column.
- Preserve the order-before-feed mobile stacking.
- Recheck the desktop blank area and mobile no-overflow.

## Phase 2 — current-clock lap data

- Add `elapsed` to `driverLapHistory`; stop at the first lap whose model time is
  after the cutoff.
- Pass `elapsed` to `DriverLapModal`.
- Status is `Running`, `DNF` or `Finished` from the current clock.
- Empty state at Lap 1: “No completed laps yet. Lap 1 is in progress.”
- Add an early-clock regression test.

## Phase 3 — metric explanations

- Use `Info` for every setup, qualifying, grid and race-order column.
- Explain Gap, Int, Last, Best, Mode (including the 1 s rule), Pos, Team and
  Player.
- Verify hover and keyboard focus show the portal tooltip.

## Phase 4 — incident on the circuit

- Pass the latest event to `GameCanvas`.
- Draw an amber track overlay for SC/VSC.
- Draw a red crash ring at the affected car's last modeled position.
- Keep the feed/banner labels; this is a model spotlight, not data.

## Phase 5 — E2E/release

- Desktop and mobile: no blank column, current-lap modal, header tooltip,
  VSC/crash spotlight, order metrics, result card, loading failure paths.
- Refresh screenshots 76–81; update README/CLAUDE/architecture/testing/
  screenshots README/closeout/state; commit and tag `v4.7.1`.

## Acceptance

- At Lap 1 the modal shows no future lap rows.
- Order begins below the circuit with no large empty gap.
- Column explanations are available on hover/focus.
- Incidents are visible on the circuit, not only in a red text banner.
- All existing tests/build/CI pass.
