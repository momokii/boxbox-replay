# V4.6 research — Grid race depth and viewing controls

**Date:** 2026-11-22  
**Baseline:** `v4.5.0`  
**Target:** `v4.6.0`  
**Scope:** BoxBox Grid only. No API or data-source change.

## Review questions

1. 1× is still too fast after moving from 8 s/lap to 12 s/lap.
2. A driver needs a proper per-lap view, ideally a modal with statistics for
   each lap, not only the current desk.
3. The downloaded result image could carry more statistics.
4. A VSC says “4.5s added” but the cars do not visually behave differently.
5. Top/Angle is not a meaningful difference; the user wants zoom in/out.
6. The whole flow needs a fresh end-to-end pass, especially for bugs around
   these controls.

## Current code evidence

### Pace

`web/src/game.ts` now exports:

```ts
export const GAME_SECONDS_PER_LAP = 12;
```

`GameRace` uses `gameClockScale(duration, laps)` and the UI says
`1× ≈ 12 s/lap`. A five-lap race is about 60 s. The review still finds this
too fast, which is consistent with the number of things happening at once:
event banner, changing order, driver desk, canvas and controls.

### Per-driver data available

`SimDriver` has `lapTimes`, `startDelay`, `finishTime`, `retiredAt` and
`retiredLap`; `RaceState` can produce a full classification at any clock.
`DriverDesk` currently shows only the current/last lap and comparison deltas.
There is no per-lap function or modal.

`web/src/components/Modal.tsx` is an existing accessible dialog with Escape,
focus trap, focus restoration and background scroll lock. It is the correct
building block; a new modal mechanism is unnecessary.

### Result image

`web/src/gameShareCard.ts` currently draws:

- winner, meeting, laps, seed;
- top 10 plus any player outside it;
- gap/DNF and player badges;
- incidents and disclaimer.

It has no fastest lap, biggest mover, DNF count or player count. The 630 px
canvas has room if the stat strip and table spacing are designed together.

### VSC animation

Events are generated in `simulateRace`; SC/VSC add time to `lapTimes` and the
event banner says “4.5s added to the lap”. The animation maps model time to
progress with a fixed `timeScale`; nothing in the canvas/clock explicitly slows
while the incident is active. The model therefore slows the *lap time*, but the
visual experience is mostly a label. The review is correct: adding seconds to
a lap is not the same as showing the field slowed.

### Top / Angle

`GameCanvas` projects through a single `project()` function. `Angle` rotates
and compresses the same points. There is no zoom state, no wheel handler and no
zoom control. At the fitted scale the difference between Top and Angle is
subtle, and the user cannot inspect a corner or a nearby car.

## Product decisions

### A. 20 s/lap at 1×

Set `GAME_SECONDS_PER_LAP = 20`:

| Laps | Approx. 1× race |
|---|---|
| 3 | 60 s |
| 5 | 100 s |
| 10 | 200 s |

This is a **viewing pace**, not real time. It makes a five-lap race a proper
one-and-a-half-minute session; 2×/4× remain for a quick result. The UI label
must say `1× ≈ 20 s/lap`. The model duration and result are unchanged; only the
wall-clock playback changes.

### B. Per-lap driver modal

Add a pure `driverLapHistory(sim, driverId)` helper:

```ts
{
  lap: number;
  time: number | null;       // null on the retirement lap
  raceTime: number;          // cumulative model time at the lap boundary
  position: number;
  gap: number;
  status: "completed" | "DNF";
  event: "SC" | "VSC" | "CRASH" | null;
}
```

- Active drivers get every lap.
- A retired driver gets laps up to the retirement lap; the final row is `DNF`
  and its `time` is `null` rather than pretending the partial lap was completed.
- `raceTime` includes the driver's start delay.
- The event is attached only to its lap; a crash attaches to its driver.
- The modal uses the existing `Modal` component and shows best lap, average
  completed lap, laps completed, grid slot and finish status, then a table:
  lap, lap time, race time, position, gap, event/status.
- Entry point: a `Lap by lap` button in the driver desk; double-click on a
  tower row/car can open the same modal, but a single click still selects.

### C. More result statistics

Extend `GameCardData` with:

- fastest lap (code, time, lap number);
- biggest mover (grid → finish, only when an actual gain exists);
- player count;
- DNF count.

The card gets a compact four-stat strip between the hero and the table, and
the table explicitly retains the top 10 plus players. The footer keeps the
incident and model-disclaimer lines. No statistic is invented: fastest lap
ignores the partial retirement lap; biggest mover only appears when someone
gained positions.

### D. VSC/SC playback slowdown

Add a pure `incidentPlaybackFactor(kind, since)`:

- SC: `0.35` for the first 12 model seconds after the event, then `1`;
- VSC: `0.45` for the first 8 model seconds, then `1`;
- CRASH: `1` (the retirement is immediate; no claim of a local yellow).

`GameRace` multiplies the normal viewing scale by this factor while the latest
active incident is in its window. The clock and cars slow together, so the
animation visibly settles without changing the model’s result. The event
banner says **“playback slowed”** and the copy keeps the time-loss statement
separate. This is a viewing effect, not a new field-bunching simulation.

### E. Zoom, with a stronger angle

Add `zoom` state to `GameRace` (1×–2.5×, step 0.25) with:

- `−`, `+`, and `Fit` buttons in the canvas header;
- mouse-wheel zoom on the canvas;
- `aria-label`s and an announced percentage;
- hit-testing/hover still using the projected coordinates.

Apply zoom after the Top/Angle projection, centred on the canvas. Make the
illustrative Angle more distinct (`rotation ≈ -0.14 rad`, vertical compression
`0.58`) so it no longer looks almost identical to Top. It remains an
illustrative projection, not measured geometry.

## Acceptance / E2E

- 1× is 20 s/lap; 5-lap race ≈100 s; label and README agree.
- Driver modal opens from the desk, contains every completed lap, shows a
  `DNF`/null time for the retirement lap, and closes with Escape.
- Result image includes fastest lap, biggest mover, players, DNFs and incidents,
  and remains 1200×630.
- VSC visibly slows the animation and says `playback slowed`; the time loss
  remains stated separately.
- Zoom controls work at both views, hit-testing remains correct, and reset to
  fit.
- Desktop and mobile browser passes with no page errors or horizontal overflow.

## Sources

- `web/src/game.ts` — `GAME_SECONDS_PER_LAP`, `gameClockScale`, `RaceSim`,
  `RaceEvent`, `SimDriver`, `raceState`.
- `web/src/components/GameView.tsx` — `DriverDesk`, `GameRace`, `GameCanvas`,
  `GameResult`, current `timeScale`.
- `web/src/gameShareCard.ts` — current result image fields and layout.
- `web/src/components/Modal.tsx` — accessible dialog pattern.
- `web/src/components/game.css` — canvas/desk/table layout.
- `docs/V4_5_CLOSEOUT.md` — v4.5 evidence and stated limits.
