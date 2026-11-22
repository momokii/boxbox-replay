# V4.1 research — the three reported race-screen flaws

**Date:** 2026-11-22. **Scope:** visual/UX correction pass only; no new data
source and no change to the v4 game model.

## 1. 3D Free — car invisible and a second line

Observed: Baku 2024, `3D · Free`, lap 4/51. The camera fits the whole circuit;
an `#81 PIA` label is visible but no car body is readable, and a thin extra line
appears alongside the circuit.

Root causes:

- The car is deliberately true-scale (5.6 m) inside a 100-unit circuit world.
  At a whole-circuit orbit it is a handful of pixels. Overview already solved
  this with car markers, but `Free` did not show those markers.
- The extra line is the **recorded pit-transit guide**. The guide was drawn as a
  second ribbon without a strong visual grammar, so it reads as a duplicated
  circuit. OpenF1's own docs say `/location` is approximate and lacks lateral
  placement; a recorded transit is not a measured pit lane.

## 2. 2D — white dashes inside the circuit

Observed: Baku 2024, 2D map. A cluster of white dashes sits alongside the
racing line near T15/T16.

Root cause: the same recorded pit-transit overlay, drawn with
`setLineDash([7, 5])` on a dark map. The dashes have no label attached to the
mark themselves; only a small note at the bottom says “recorded transit
(approximate)”. It is visually indistinguishable from a second racing line.

This is not a data problem. It is a **visual semantics** problem. The previous
2D map had no extra line; adding an ambiguous one made the map worse.

## 3. BoxBox Grid race — markers off-circuit and the wrong clock

Observed: Australian GP, `1 player`, `1×`, 5 laps. The player marker/cars are
clustered around a red-boxed section; the race appears to be over quickly even
though 5 laps are selected.

Root causes:

- The renderer added a **perpendicular “legibility stagger”** based on race
  position: `lateral = (position - field/2) * 3.2`. This intentionally moved
  cars off the centreline to separate a tight pack. That is a false spatial
  claim and exactly why the cars looked outside the circuit.
- The animation clock is `sim.duration / (laps * 2.3)`: a 5-lap race advances
  roughly 39× simulation time, so 1× finished in ~11 s. The lap counter can
  tick from 1 to 2 quickly and the result arrives before the user expects.
- The race screen was scrollable from the setup table, so the stage header could
  be off-screen when the race started. That compounded the “where did it go?”
  impression.

## Decisions

1. **No recorded pit path in v4.1.** Draw a short schematic lane at the
   start/finish straight, solid, labelled “PIT LANE · schematic”, in both 2D and
   3D. The phrase “recorded transit (approximate)” is removed. This is honest:
   OpenF1 has no lateral pit geometry.
2. **Car markers in Overview and Free**, actual 3D car in Follow. Free starts
   with the same camera and shows the markers; zooming close hides markers when
   the car itself is readable.
3. **No lateral offset in Grid.** Cars use their actual lap progress; the tower
   is the disambiguation surface. Player markers get an amber ring, not a
   fictitious position.
4. **1× = 8 s per lap** (5 laps ≈ 40 s, 10 ≈ 80 s), with 2×/4× available. The
   default remains 5 laps. The finish transition only fires at the sim duration.
5. Scroll to the stage top on every Grid phase change; the race header must be
   visible when the race starts.

## Acceptance evidence

- Baku 2024 2D: **one** circuit ribbon, one short solid schematic pit lane with
  visible label, no white dashes elsewhere.
- Baku 2024 3D Free: car markers visible at whole-circuit distance; no second
  circuit ribbon; Follow shows the true-scale car.
- Grid 1×: 5-lap race lasts ≈40 s (not one lap), no marker is artificially
  displaced off the asphalt, and the header/lap counter are visible.
- 1- and 2-player Grid paths still pass; skipped qualifying still works.
