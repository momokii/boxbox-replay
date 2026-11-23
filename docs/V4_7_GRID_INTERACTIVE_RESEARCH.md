# V4.7 research — driver identity, race timing strip and live model feed

**Date:** 2026-11-23  
**Baseline:** `v4.6.1`  
**Target:** `v4.7.0`  
**Scope:** BoxBox Grid UI/interaction. No real-race control or new telemetry.

## Review problems

1. Driver hovers show only a code and timing values. The user wants the **full
   name, team and headshot** as a proper identity card.
2. The race screen puts the order in a narrow right column with only a gap.
   The user wants the order **below the circuit**, richer per-driver metrics,
   and the freed right column used for a **live incident/report** highlight.
3. Result images should reflect the richer metrics where they are honest.
4. The previous data-loading failure must not return: no request may leave the
   Grid stuck.

## Evidence in the current code

### Identity data exists

`web/src/types.ts` already defines the OpenF1 `Driver` shape:

```ts
export interface Driver {
  driver_number: number;
  name_acronym: string;
  team_name: string;
  team_colour: string;
  full_name?: string | null;
  country_code?: string | null;
  headshot_url?: string | null;
}
```

`web/src/api.ts` already exposes `drivers(sessionKey)`. The replay driver card
uses `headshot_url` with `referrerPolicy="no-referrer"` and a number fallback
(`web/src/components/DriverCard.tsx`). The Grid does not call this endpoint or
render the image.

Jolpica/standings supply `driver_id`, `code`, `name`, `number`, `constructor`;
`GameDriver` carries `number`, `name`, `code`, `team` and `color`. Matching by
OpenF1 `driver_number` first and `name_acronym` second is the existing data
model; no fabricated person data is needed.

### Current race composition

`GameRace` currently uses:

```tsx
<div className="game-race-grid">
  <div className="game-canvas-wrap">…circuit…</div>
  <aside className="game-tower">
    <DriverDesk />
    <h3>Order</h3>
    <table># / Driver / Gap</table>
  </aside>
</div>
```

The order is a 310 px column. It has only `#`, `Driver` code and `Gap`. The
circuit and desk already have hover data; the tower rows do not.

`raceState` exposes position, progress, lap, gap, player and retired. `RaceSim`
exposes `lapTimes`, `baseLap`, `duration` and events. Those support honest
**last lap**, **best lap**, **interval to car ahead** and **mode** without new
telemetry.

### Current feed/event data

`simulateRace` emits seeded `SC`, `VSC` and `CRASH` events with `t`, `lap`,
`kind`, `label` and optional `driverId`. `raceState` can be evaluated at any
model clock. That is enough to build a **model race feed** from leader changes,
position gains and incidents. It must be labelled as a simulated feed, not real
race control.

### Design direction

Keep the existing pit-wall identity: near-black timing surface, amber focus,
Barlow Condensed display, JetBrains Mono data, team-color accents. Do not turn
the race into a generic dashboard of identical cards. The order is a **timing
strip**: dense, tabular, readable at a glance. The live feed is a narrow
**race-control notice board**, not another card grid.

```
┌──────────────────────────────────────────────┬───────────────────┐
│ CIRCUIT · TOP/ANGLE · zoom/pan               │ LIVE MODEL FEED   │
│                                              │ event + 3 reports │
│                                              │                   │
├──────────────────────────────────────────────┤ DRIVER DESK       │
│ ORDER · pos driver gap int last best mode    │ selected/compare  │
└──────────────────────────────────────────────┴───────────────────┘
```

On mobile the circuit, live feed, order and desk stack in that order.

Hovering any driver — qualifying, grid, live order or canvas — opens an
identity card with headshot, full name, team, position and player badge. The
card follows the pointer, stays inside the viewport, and uses a number/initials
fallback when OpenF1 has no usable headshot.

## Product decisions

### Hover identity

- Fetch OpenF1 drivers once per selected race session (`api.drivers`).
- Match by number, then code; never display a wrong image.
- Show full name, team, code, position, player/AI and image.
- Use image fallback; no rehosting.
- Keyboard focus on a row shows the same card at the row.
- A failed driver-media request never blocks the game.

### Race layout and metrics

Move the order below the circuit. Keep the right column for:

1. **Live model feed** — latest incident plus up to three model reports;
2. **Driver desk** — existing selected/compare panel.

Order columns:

| Pos | Driver | Team | Gap | Int | Last | Best | Mode | Player |
|-----|--------|------|-----|-----|------|------|------|--------|

- `Int` = gap difference to the car ahead; leader “—”; retired “DNF”.
- `Last` = last completed model lap; `—` when none.
- `Best` = best completed model lap to the current lap; no future laps.
- `Mode` = existing Leading/Attacking/Defending/Clear air.
- No tyre, speed or measured telemetry is invented.

The table is horizontally scrollable on narrow screens; columns hide in a
deliberate order rather than crushing text.

### Live model feed

`buildRaceFeed(sim, drivers)` returns deterministic, model-derived items:

- leader changes at lap boundaries;
- seeded SC/VSC/crash events;
- the largest position gain on a lap;
- final winner.

Each item has `t`, `lap`, `kind` and text. The live panel shows items whose
`t <= elapsed`, newest first, with the current incident called out. It is
labelled **SIMULATED RACE FEED · not real race control**.

### Result card

The card already has fastest lap, biggest mover, players, DNFs and incidents.
Add winner context that follows from the same simulation: **winner best lap,
average completed lap and laps led** in the hero line. Keep the top-10 table;
do not add unmeasured statistics.

### Reliability

- The OpenF1 driver-media call gets a bounded timeout and is optional.
- The v4.6.1 bounded standings, retry and calendar independence remain.
- E2E must block the driver endpoint and prove the game still works with
  initials/number fallbacks.

## Sources

- `web/src/types.ts` — `Driver` includes `full_name`, `team_name`,
  `headshot_url`.
- `web/src/api.ts` — existing `drivers(sessionKey)` endpoint.
- `web/src/components/DriverCard.tsx` — existing headshot + fallback pattern.
- `web/src/components/GameView.tsx` — current `GameQuali`, `GameGrid`,
  `GameRace`, `GameResult` layouts.
- `web/src/game.ts` — `RaceSim`, `RaceEvent`, `RaceState`, `driverLapHistory`.
- `web/src/components/game.css` — current tower, canvas and table styling.
- `docs/V4_6_1_CLOSEOUT.md` — bounded data-loading contract.
