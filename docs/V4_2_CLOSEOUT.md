# v4.2 close-out — Grid UX + 3D selected HUD

**Release:** `v4.2.0`, a focused UX/game-flow pass on v4.1. No API, data
source or model change.

## Shipped

### Qualifying

Checking **Run qualifying** now opens a single flying-lap qualifying session
with pole, the complete order, lap times, gaps and player badges. The same
seeded grid feeds the race; **Continue to grid** makes the hand-off explicit.
Skipping qualifying still produces the same seeded grid and shows the
“Qualifying skipped” grid state. No fake Q1/Q2/Q3.

### Grid hover and pace/intention

The 2D Grid canvas now has pointer hit-testing and a driver hover card:

- position and player/AI identity;
- current lap and gap;
- simulated pace/lap time;
- race mode: **Leading / Attacking / Defending / Clear air**.

No km/h is shown because Grid is a time model; pace is the defensible readout.
The timing tower remains authoritative.

### Lap clarity

The race header has a lap strip with one segment per lap plus `Lap n/N`. At
1× a lap takes about 8 s (5 laps ≈ 40 s); the result waits for the simulated
distance. This addresses the “one lap and done” ambiguity.

### 3D

The selected driver now gets a 3D HUD card using the same 2D replay data:
position, gap, tyre, and the existing live speed/loading state. Follow/
Overview/Free markers remain; the pit guide is still labelled schematic.

## Verification

- **93 pytest + 93 vitest**
- `ruff`, `tsc`, Vite build, CI
- Browser:
  - qualifying session → grid → race → result;
  - hover card at 1440 with `ANT · P1 · lap 3 · Leading · Pace 1:28.62`;
  - lap strip at 8 s shows Lap 2/5; result only after 5 laps;
  - 3D selected card: `LEC · P1 · gap +0.000 · MEDIUM · 92 km/h`;
  - Baku 2D/3D Free/Follow; no page/WebGL errors.
- Screenshots: `docs/screenshots/55`, `56`, `57`, `61`, `62`.

## Boundaries

- Grid remains 2023–2026, local, final/current standings, 64% driver/36% team
  + seeded variation; no tyres, pit stops, collisions or reliability.
- Grid pace is not a real km/h channel.
- Qualifying is one simulated flying lap, not a three-part elimination.
- 3D remains a true-relative-scale visual with a schematic pit guide and no
  measured width/elevation.
