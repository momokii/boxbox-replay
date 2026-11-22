# V4.4 close-out — the Grid race desk

**Release:** `v4.4.0`  
**Baseline:** `v4.3.0`  
**Scope:** BoxBox Grid UX and simulation depth. No API or data-source change.

## What shipped

### 1. The Grid explains itself

Setup now opens with **A real race weekend, turned into a local game**:

- pick a weekend, draft drivers, qualify or skip, then race;
- the exact form calculation (58% points + 42% championship position per
  driver, team points / field maximum, 64% driver + 36% team overall);
- the race model includes seeded lap pace and SC / VSC / crash events;
- an explicit statement that this is a game model, not a prediction, and that
  Grid pace is not a km/h feed.

The qualifying summary also uses the full card: **Pole**, **Pole lap**,
**Player/AI** and **Field** sit beside the live progress copy instead of leaving
the right half empty. It stacks on phones.

### 2. Driver desk with a live comparison

Click a car on the circuit or a row in the order table. The selected driver gets
a persistent desk with:

- position, lap, gap, current pace, last lap, race mode, team and player/AI;
- a compare selector for any other driver;
- A/B position, gap and pace deltas;
- a white selected ring on the canvas and DNF styling once retired.

The desk sits directly under the order heading on the right column, so it is
visible without scrolling on desktop. Tower rows are focusable and respond to
Enter/Space as well as click. Grid still shows pace, not a fabricated speed.

### 3. Seeded race incidents

`game.ts` now generates deterministic race-control events from the same seed:

- **SC** — 12 s added to the active cars' affected lap;
- **VSC** — 4.5 s added;
- **CRASH** — one active driver retires from that lap onward.

The latest event at the current clock appears as a race-control banner, the
retired car is frozen and classified after the active finishers, and the result
table shows DNF. The seed is shown in the race header. An optional seed field
on setup makes a race reproducible; empty means a fresh seed.

These are **game events**. They are not a replay of the session's real race
control, do not invent yellow-flag periods, and do not claim a collision
simulation. SC/VSC apply the same time loss to every active car; the label says
exactly that rather than claiming the field bunches.

### 4. Circuit angle view

The Grid canvas has a **Top / Angle** toggle. The angle view is an illustrative
rotation plus vertical compression of the same projected points; track,
start/finish, markers, labels, hover and click hit-testing all use the same
projection. It adds viewing depth without claiming new geometry or elevation.

## Files

| Area | Files |
|---|---|
| Engine | `web/src/game.ts` — `RaceEvent`, `RACE_EVENT_LOSS`, seeded events, retirement clocks |
| Tests | `web/src/game.test.ts` — 13 tests, including event determinism, SC/VSC loss, crash classification, `lapFraction` |
| UI | `web/src/components/GameView.tsx` — explainer, qualifying facts, driver desk, event banner, top/angle canvas, seed input |
| Styles | `web/src/components/game.css` — explainer, desk, event banner, view toggle, tower scroll, mobile stacking |

## Verification

| Check | Evidence |
|---|---|
| API tests | `.venv/bin/python -m pytest -q` → **93 passed** |
| Web tests | `cd web && npx vitest run` → **22 files, 97 tests passed** |
| Lint | `.venv/bin/python -m ruff check .` → **All checks passed!** |
| Types | `npx tsc -b` → exit 0 |
| Build | `npx vite build` → exit 0 |
| Production | web image rebuilt; served bundle matched `web/dist`; `/api/healthz` → `{"ok":true}` |
| Browser, 1440×900 | setup explainer; qualifying facts; seed 8 → VSC at Lap 2; driver desk and compare; angle view; 4× to result with one DNF; **no page errors** |
| Browser, 390×844 | setup, race banner, desk scroll and overlay width; **0 horizontal overflow**, no page errors |
| Qualifying card | summary box 1146 px wide; main 853 px + facts 251 px, both inside the card |

The earlier five-lap mapping correction is covered by the `lapFraction`
regression test and was rechecked in the browser: at Lap 2/5 the cars are at
lap fractions around 1.0–1.2, not compressed into the first fifth of the
circuit. The explicit Grand Prix selection was also rechecked: selecting
Canada kept Montréal in the source line and race header.

## Screenshots

- `64-grid-how.png` — setup explainer and calculation;
- `65-grid-event.png` — VSC banner at Lap 2;
- `66-grid-angle.png` — illustrative angle view;
- `67-grid-driver-desk.png` — selected driver, compare and live deltas;
- `55-grid-qualifying.png` — full-width qualifying facts;
- `56-grid-race.png` — race with event banner;
- `57-grid-result.png` — result with DNF;
- `68-grid-mobile-setup.png` — mobile setup;
- `69-grid-mobile-desk.png` — mobile driver desk.

## Honest limits

- Grid remains a local seeded model, not a prediction.
- No tyre, pit-stop, fuel, reliability or collision-physics simulation.
- SC/VSC are lap-time losses, not a field-bunching or safety-car-train model.
- Crash means a seeded retirement, not a reconstructed incident.
- No pre-2023 circuit geometry; no online play, accounts or leaderboards.
- Grid pace is modelled time, never a km/h value.
