# V4.7 close-out — driver identity, timing strip and live model feed

**Release:** `v4.7.0`  
**Baseline:** `v4.6.1`  
**Scope:** BoxBox Grid interaction and race presentation. No new data source.

## What shipped

### Driver identity on hover

Every driver row in setup, qualifying, grid and live order now opens the same
identity card on hover:

- OpenF1 headshot when available, otherwise the car number;
- full name and team;
- code, position and player/AI badge;
- the card follows the pointer and clamps to the viewport.

The race canvas hover card and the driver desk also use the OpenF1 identity
(headshot, full name, team). The media request reuses `/drivers?session_key=`
with a 15 s bound; if it fails or the image is unavailable the game keeps its
number/initials fallback. No headshot is rehosted.

### Order below the circuit, with more honest metrics

The race order moved below the circuit as a full-width timing strip:

`Pos · Driver · Team · Gap · Int · Last · Best · Mode · Player`

- `Int` is derived from the gap to the car ahead.
- `Last` and `Best` come from completed simulated laps, never future laps.
- `Mode` uses the existing Leading/Attacking/Defending/Clear-air model.
- No tyre, speed or measured telemetry is invented.
- On phones the table keeps Pos/Driver/Gap/Mode and scrolls horizontally; the
  order now appears before the feed/desk below the circuit.

### Live model feed

The freed right column is now a **Live model feed** above the driver desk:

- current SC/VSC/crash state and the latest event;
- up to four recent model reports, newest first;
- pole start, leader changes, largest position gain and the winner;
- labelled **SIMULATED** and “Model-derived feed · not real race control”.

`buildRaceFeed(sim, drivers)` is deterministic and tested.

### Richer downloaded result card

The 1200×630 PNG keeps fastest lap, biggest mover, players, DNFs and incidents,
and adds:

- winner best completed lap;
- winner average completed lap;
- laps led.

It remains a client-side canvas PNG with top 10 + any player outside it.

### Data-loading contract retained

The v4.6.1 bounded archive/retry behaviour remains. The headshot request is
optional and cannot block the Game. The calendar still loads independently of
standings.

## Files

- `web/src/game.ts` — `buildRaceFeed`.
- `web/src/gameShareCard.ts` — winner best/average/laps-led.
- `web/src/components/GameView.tsx` — media loading, hover card, timing strip,
  live feed, result props.
- `web/src/components/game.css` — identity card, feed, order rules.
- `web/src/game.test.ts` — 19 tests, including feed determinism.
- `web/src/gameShareCard.test.ts` — 3 tests, including winner stats.

## Verification

| Check | Evidence |
|---|---|
| API tests | `.venv/bin/python -m pytest` → **94 passed** |
| Web tests | `cd web && npx vitest run` → **23 files, 106 tests passed** |
| Lint/type/build | ruff clean · `tsc -b` exit 0 · `npm run build` exit 0 |
| Browser, 2026 Australia | 25 drivers loaded; setup/qualifying context card showed `Kimi ANTONELLI`, Mercedes and a headshot |
| Race order | 9 columns live; RUS last/best `1:30.20`; intervals and mode visible |
| Live feed | VSC current event + `RUS takes the lead` + pole start; no page errors |
| Mobile | no horizontal overflow; order appears below the circuit and Mode remains visible |
| Result image | 1200×630 PNG; fastest/biggest mover/laps led/players/incidents + winner BEST/AVG |
| Data failure | previous bounded-standings error/Retry behavior remains |

## Screenshots

`76-grid-driver-hover.png`, `77-grid-live-feed.png`,
`78-grid-order-metrics.png`, `79-grid-mobile-order.png`; `56`, `66`, `67`,
`59`, `69` and `71` refreshed for the new race composition.

## Honest limits

- Headshots are an OpenF1 enhancement; a missing/failed image uses a number.
- The live feed is model-derived, not real race control.
- Int/Last/Best/Mode are simulated game values; no tyre or speed is inferred.
- The result card still shows top 10 plus players, not every classified row.
