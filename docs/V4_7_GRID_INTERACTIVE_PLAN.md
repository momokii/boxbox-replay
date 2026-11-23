# V4.7 plan — Grid driver identity, timing strip and live feed

**Target:** `v4.7.0`  
**Baseline:** `v4.6.1`

## Design plan

### Tokens

- Base: `#0B0E13` (night), `#14181F` (panel), `#1C222C` (raised), `#E9EEF5`
  (ink), `#8592A3` (dim), `#FFB224` (amber).
- Team colors continue to come from the standings data, not a new palette.
- Type: Barlow Condensed for names/headings, Barlow for prose, JetBrains Mono
  for timing and state. Keep the existing family.
- Layout: timing-strip, not cards. One side notice board; no repeated rounded
  card kit.
- Interaction: identity follows the pointer; live feed updates as the model
  clock moves; order rows are dense and keyboard focusable.

### Layout

```
Desktop:
┌─────────────────────────────────────────────┬──────────────────────┐
│ circuit + view/zoom controls                │ LIVE MODEL FEED      │
│                                             │ latest + history     │
├─────────────────────────────────────────────┤ DRIVER DESK          │
│ ORDER · pos driver team gap int last best   │ selected + compare   │
└─────────────────────────────────────────────┴──────────────────────┘
```

Mobile: circuit → live feed → order → desk. The order table scrolls
horizontally; Team/Int/Last/Best are hidden first.

## Phase 0 — research/plan

Commit this document and the research document before touching code.

## Phase 1 — headshots and identity hover

- Add `driverMedia` loading in `GameView` from `api.drivers(raceSession)` with
  a bounded timeout; ignore failure.
- Match OpenF1 `driver_number` → `GameDriver.number`, fallback code.
- Add `onHoverDriver` plumbing from Quali/Grid/Race tables. Render a single
  `DriverHoverCard` at the `GameView` layer, clamped to the viewport.
- Add the headshot/full name/team to the existing canvas hover and driver desk.
- Fallback to number/initials; no broken image.
- Tests: pure media matching helper; browser hover card with seeded actual
  headshot and with images blocked.

## Phase 2 — race order strip + live feed

- Add `buildRaceFeed(sim, drivers)` to `game.ts`:
  - event rows (`SC`, `VSC`, `CRASH`) with model times;
  - leader changes at lap boundaries;
  - largest position gain per lap;
  - winner at the end.
- Add `RaceFeed` side panel: current event + newest items, labelled simulated.
- Move order below circuit; add Int/Last/Best/Mode columns; derive from
  `raceState` and `SimDriver.lapTimes`; no tyres/speed.
- Keep DriverDesk in the side column; order rows use the same hover identity
  callback.
- Mobile: horizontal scroll; columns hide in priority order.
- Tests: feed deterministic, first item pre-start, incidents included, no
  fabricated data.

## Phase 3 — result image winner context

- Compute winner best completed lap, average completed lap and laps led from
  the existing simulation.
- Add these to `GameCardData` and the hero/subtitle of the 1200×630 image.
- Keep fastest lap/biggest mover/player/DNF/incidents.
- Tests for winner stats.

## Phase 4 — reliability

- Add timeout/catch to driver-media fetch; the game must work with no
  headshots.
- Re-run the v4.6.1 bounded standings behavior.
- Browser test with `/api/drivers` failed and with standings failed; no stuck
  loading.

## Phase 5 — E2E/docs

- Desktop 1440×900 and mobile 390×844:
  setup → qualifying → grid → start → race → hover identity → feed →
  order metrics → desk → zoom/pan → result → result card.
- Refresh screenshots; add hover, live-feed and new order captures.
- Update README, CLAUDE, architecture/testing, screenshots README,
  `V4_7_CLOSEOUT.md`, `.claude/state/*`; commit per phase; tag `v4.7.0`.

## Acceptance

- Hovering any Grid driver shows full name, team and headshot (or a clean
  fallback).
- Race order is below the circuit, shows honest extra metrics and remains
  readable on mobile.
- Right column shows a live simulated feed with current incident and recent
  reports.
- Result card includes winner best/avg/laps-led.
- No data request can leave the UI indefinitely loading; E2E proves the
  failure/fallback paths.

## Shipped

`v4.7.0` shipped on 2026-11-23. Evidence and screenshots are in
[`V4_7_CLOSEOUT.md`](V4_7_CLOSEOUT.md): 94 pytest + 106 vitest, a 2026 Australia
desktop/mobile browser pass, identity hovers with actual headshots, a live VSC
feed, order metrics, and a richer 1200×630 result card.
