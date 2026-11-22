# V4.5 close-out — a calmer Grid race, two qualifying runs and a result card

**Release:** `v4.5.0`  
**Baseline:** `v4.4.0`  
**Scope:** BoxBox Grid UX. No API or data-source change.

## What shipped

### 1× is now a viewing pace

The old 1× pace was about **8 s/lap** (a five-lap race finished in roughly
40 s). The new pace is **12 s/lap**:

| Laps | Approx. 1× race |
|---|---|
| 3 | 36 s |
| 5 | 60 s |
| 10 | 120 s |

`gameClockScale(duration, laps)` is the single conversion point, and
`GAME_SECONDS_PER_LAP` is exported so the UI and tests agree. The label reads
`1× ≈ 12 s/lap`; 2× and 4× remain. This is a viewing pace, not a real-time
claim.

### 2× qualifying runs, best counts

`QualiRow` now carries `attempts: number[]`; `simulateQualifying` generates
exactly two seeded flying laps per driver and uses `Math.min(...attempts)` as
the grid time. The existing deterministic seed contract is unchanged.

The qualifying screen now shows:

- `Two flying laps. The order is set.`
- a full-width progress bar;
- facts for **Pole**, **Best lap**, **P2 gap**, **Player**, **Runs = 2** and
  **Field**;
- a **Runs** column with both attempt times and a **Best** column;
- on phones, Team and Gap are hidden first so the Runs column survives.

It is still explicitly **not Q1/Q2/Q3**: two runs, best counts.

### 3. Start race and five lights

`Lights out →` became **`Start race →`**. Opening the race now shows a
**five-light sequence** (about 3.6 s): one light at a time, then lights out.
The clock stays at 1/5 · 0s until the sequence ends. Pause, speed and Skip are
disabled during the sequence. The grid remains visible under the lights.

The grid table now scrolls within a 52 vh window, so **Start race** is visible
without scrolling past 25 rows.

### 4. Result image

The result screen has **Download result image**. It draws a **1200×630 PNG**
client-side:

- winner name, team and player badge;
- meeting, lap count and seed;
- top 10 plus any player outside the top 10;
- position, code, team, gap/DNF and player badge;
- incidents with their lap numbers;
- a footer stating the local game model is not a prediction and has no tyre,
  pit-stop or collision physics.

The browser download was verified at 1200×630 (`boxbox-grid-canadian-grand-prix-5-laps.png`,
96,319 bytes).

## Files

| Area | Files |
|---|---|
| Engine | `web/src/game.ts` — `QUALI_ATTEMPTS`, `attempts`, `GAME_SECONDS_PER_LAP`, `gameClockScale` |
| Result card | `web/src/gameShareCard.ts` — data selection, 1200×630 canvas, PNG download |
| UI | `web/src/components/GameView.tsx` — two-run table, full-width facts, start lights, result download |
| Styles | `web/src/components/game.css` — full progress, Runs column, start lights, grid scroll, share error |
| Tests | `web/src/game.test.ts` — 15 tests; `web/src/gameShareCard.test.ts` — 3 tests |

## Verification

| Check | Evidence |
|---|---|
| API tests | `.venv/bin/python -m pytest -q` → **93 passed** |
| Web tests | `cd web && npx vitest run` → **23 files, 102 tests passed** |
| Lint | `.venv/bin/python -m ruff check .` → **All checks passed!** |
| Types | `npx tsc -b` → exit 0 |
| Build | `npm run build` → exit 0 |
| Production | web image rebuilt; served bundle matched `web/dist`; `/api/healthz` → `{"ok":true}` |
| Qualifying, 1440×900 | 25 rows; first row runs `1:30.58 · 1:30.16`; card 1146 px, main 729 px, facts 375 px, progress 729 px |
| 1× | clock at 0 s while the lights were on; 5-lap race uses the 12 s/lap label; VSC arrived at Lap 2 |
| Start | one light visible at ~1 s; clock still 0 s; after lights out the clock advances |
| Grid | Start race button visible at y=766 inside the 900 px viewport; table scrolls |
| Result image | downloaded 1200×630 PNG, 96,319 bytes; visual check covers winner, top 10, player badge and incidents |
| Mobile, 390×844 | 25 qualifying rows, no horizontal overflow, 1× race at 16 s shows VSC/Lap 2, desk scrolls; no page errors |
| Browser errors | **[]** on desktop and mobile |

## Screenshots

- `54-grid-lineup.png` — grid table with the Start race action visible;
- `55-grid-qualifying.png` — two runs, best, full-width summary;
- `56-grid-race.png` — 1× race with the VSC banner;
- `57-grid-result.png` — result with Download result image;
- `59-grid-mobile.png` — mobile race at Lap 2;
- `64-grid-how.png` — setup explainer with five steps;
- `65-grid-event.png` — VSC banner;
- `66-grid-angle.png` — angle view;
- `67-grid-driver-desk.png` — live desk and compare;
- `68-grid-mobile-setup.png` — mobile setup;
- `69-grid-mobile-desk.png` — mobile desk;
- `70-grid-start.png` — five-light start;
- `71-grid-result-card.png` — the downloaded result image;
- `72-grid-mobile-start.png` — mobile formation lap.

## Honest limits

- Two runs are a game design choice, not a recreation of Q1/Q2/Q3.
- 12 s/lap is a viewing pace; it is not a real lap duration.
- The result image shows the top 10 plus any player outside it, not all 25 rows;
  the in-app result table remains complete.
- The light sequence is a transition; no new race data is generated.
- Incidents remain seeded game events, not real race control.
- No tyre, pit-stop, collision-physics or reliability model.
