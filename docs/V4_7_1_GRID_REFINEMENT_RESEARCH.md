# V4.7.1 research — Grid layout, future data and metric explanations

**Date:** 2026-11-23  
**Baseline:** `v4.7.0`  
**Target:** `v4.7.1` (patch)  
**Scope:** Grid race presentation and lap data correctness.

## Problems from review

1. The race page has a large empty area under the circuit; the live incident
   just appears as a static red banner.
2. Clicking a driver at **Lap 1/5** shows all five lap rows and a “Finished”
   status. That is future data presented as if it had happened.
3. Race columns such as `Int`, `Last`, `Best` and `Mode` have no explanation.

## Cause

### Empty area

`v4.7.0` moved the order after the race grid. The grid row height is the
maximum of the circuit and the side column (feed + desk). The order then began
below the taller side column, leaving the left column empty from the bottom of
the circuit to the order. The order also ends up after the feed on mobile.

### Future laps

`driverLapHistory(sim, driverId)` defaulted to `sim.duration` and returned all
simulated laps. `GameRace` called it without the current clock, so the modal
showed L1–L5 at the first lap. It also derived `Finished` from the full history.

### Missing explanations

The order table was introduced with short headers only. `Info` already exists
as the app's inline explainer with hover/focus and a portal bubble, but the
Grid headers did not use it.

### Static incident

The event banner and feed updated, but the circuit itself had no incident
state. A VSC or crash therefore looked like text beside an unchanged map.

## Fix

- Put the order **inside the circuit column**, directly below the canvas. This
  removes the left-column gap and puts order before the feed/desk on mobile.
- Add an `elapsed` cutoff to `driverLapHistory`; the modal only exposes
  completed laps. At Lap 1 it says “No completed laps yet. Lap 1 is in
  progress.” Status is `Running`/`DNF`/`Finished` according to the current
  clock, never future state.
- Use `Info` for race/qualifying/grid/setup headers:
  - Gap: seconds behind leader.
  - Int: interval to the car ahead.
  - Last: last completed simulated lap.
  - Best: best completed lap up to now.
  - Mode: Leading / Attacking / Defending / Clear air, with the 1 s rule.
- Draw the latest incident on the circuit:
  - SC/VSC: a clearly visible amber track overlay.
  - Crash: a red ring at the retired car's last modeled position.
- Keep the v4.6.1 bounded standings/retry and optional bounded headshots.

## Verification

- Early modal at Lap 1 has **0 future rows**, `0/5`, `Running`.
- At a completed lap it shows only the completed rows.
- Mode header tooltip contains the four definitions.
- Race layout has no empty left column before the order.
- 94 pytest + 107 vitest; desktop/mobile browser checks; no page errors.

## Sources

- `web/src/game.ts` — `driverLapHistory`.
- `web/src/components/GameView.tsx` — `GameRace`, `DriverLapModal`, `Info`.
- `web/src/components/game.css` — race/order layout and feed.
- Review captures — large blank, early modal, order metric headers.
