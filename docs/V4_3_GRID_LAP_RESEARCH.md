# V4.3 research — Grid lap geometry and qualifying visibility

**Date:** 2026-11-22. **Baseline:** v4.2.0.

## 1. The lap bug is a position-mapping bug

`GameCanvas` draws a car with:

```ts
const pt = sample(row.progress / p.sim.laps);
```

`row.progress` is measured in **laps** (0…5), but dividing it by `sim.laps` maps
the whole race onto a single 0…1 circuit. At lap 2 of 5 the car is at 20–40% of
the circuit, not somewhere on its second lap. Over five laps the cars complete
**one physical circuit**, divided into five sectors. The screenshot is right:
the lap counter says `Lap 2/5` while the car has not completed one circuit.

**Fix:** map each completed lap back onto the circuit:

```ts
const pt = sample(lapFraction(row.progress)); // progress % 1
```

The pure helper `lapFraction` will be tested with `0.0`, `1.0`, `2.25`, `4.9`,
`5.0` and a negative guard.

## 2. Why qualifying still feels like “nothing”

The phase exists in v4.2, but the user-facing difference is weak:

- the setup control is a checkbox (`Run qualifying`);
- the main button always says `Set the grid`;
- the qualifying screen is a static result table, not a session;
- skipping and running both land on a similar-looking grid table.

The data path is real (`simulateQualifying` → `GameQuali` → `GameGrid`), but the
screen does not make the hand-off legible. V4.3 will:

1. replace the checkbox with explicit **Run / Skip** segmented buttons;
2. change the start button to `Run qualifying →` or `Set the seeded grid →`;
3. make the qualifying screen a short live session: rows appear in order,
   with a progress count and a disabled Continue until the session completes;
4. keep the skipped state explicit in the grid header.

No new model or fake Q1/Q2/Q3.

## 3. Discoverability

The Grid hover card works, but nothing on the race screen tells a new user that
cars are hoverable. Add a visible hint under the circuit: “Hover a car for
position, pace, gap and race mode.” The timing tower stays authoritative.

## 4. Scope

- Fix the lap-to-track mapping.
- Make qualifying run/skip and the hand-off visible.
- Add the hover hint.
- Re-run both E2E paths, 1× and 4×, desktop and mobile.
- Do not change 3D in this pass; the user explicitly said “just it is what it
  is for now.”

## Acceptance

- five laps cross the circuit **five times**; lap 2 is visibly on the circuit,
  not 20% into the only lap;
- hover card still works;
- checked/unchecked qualifying produce visibly distinct paths:
  - Run → live qualifying session → Continue → grid
  - Skip → explicit skipped grid
- 93+ tests/build/CI green.
