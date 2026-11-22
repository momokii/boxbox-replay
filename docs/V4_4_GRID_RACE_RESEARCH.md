# V4.4 research — Grid race desk, incidents and angles

**Date:** 2026-11-22. **Baseline:** v4.3.0.

## Current gaps

### 1. “How it works” is hidden

The setup screen has a tiny `Model` box in the lineup column:
“64% driver form + 36% team form + seeded variation”. It does not explain:

- which standings are used for a completed vs current season;
- that driver form is 58% points + 42% championship position;
- that team form is normalized constructor points;
- how qualifying/skip and the seeded race differ;
- that the race includes modelled incidents (after v4.4) and is not a prediction.

The qualifying summary card also leaves the right half empty: the session
status/pole text is left-aligned and the rest of the full-width card is blank.

### 2. Grid has hover, but no focus/compare desk

Clicking a car or tower row does nothing. Hover shows pace/gap/mode, but there
is no persistent driver panel, no last-lap/current-pace history and no
A-vs-B comparison. The existing replay has this pattern (selected driver card
and tower drill-down); Grid should become the same kind of observation surface
without inventing km/h.

### 3. No race incidents

The current race is deterministic pace + random noise. It has no safety car,
VSC, crash or retirement, so a 5-lap game can feel like a procession.

### 4. Flat circuit

The Grid circuit is top-down only. The replay 3D grew camera context; the Grid
deserves at least an angled/broadcast view while keeping a readable top-down
mode.

## Decisions

1. **How-it-works panel** on the setup screen with the full formula, data
   provenance, qualifying choice and incident disclosure. Fill the qualifying
   summary with pole/fastest/field/player facts so no half-card is empty.
2. **Driver desk**: click a car or tower row to select it; persistent live
   stats (position, lap, gap, current/last pace, race mode, overall/team). A
   compare select adds A/B deltas. This uses the existing simulated values; no
   fabricated speed.
3. **Seeded incidents**: SC, VSC and crash/retirement. They are generated from
   the same PRNG, affect the simulated race and appear as a race-control
   banner. A crash retires a car; SC/VSC add a field-wide time loss. The UI
   labels these as game events, not real race control.
4. **Circuit angle**: a `Top / Angle` toggle in Grid. Both views use the same
   projected points and hit-test map; the angle is illustrative, not extra
   data.
5. No change to the real replay/3D data boundaries.

## Scope and limits

- Grid stays 2023–2026, 1–4 local players, 3/5/10 laps, final/current standings.
- No tyre/pit/collision physics; incidents are seeded game events.
- No km/h in Grid; pace/gap/mode are the honest readouts.
- Every event is deterministic for a seed, so “Race again” can be reproduced
  by the same setup.
