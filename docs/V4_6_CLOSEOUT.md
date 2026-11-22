# V4.6 close-out — deeper Grid race viewing

**Release:** `v4.6.0`  
**Baseline:** `v4.5.0`  
**Scope:** BoxBox Grid UX and simulation depth. No API or data-source change.

## What shipped

### 1× is now a 20 s/lap viewing pace

`GAME_SECONDS_PER_LAP` moved from 12 to **20**:

| Laps | Approx. 1× race |
|---|---|
| 3 | 60 s |
| 5 | 100 s |
| 10 | 200 s |

`gameClockScale` still derives the playback scale from the model duration, so
the race itself is unchanged; only the wall-clock viewing pace changes. The
label reads `1× ≈ 20 s/lap`. The plan is deliberately a viewing pace, not a
claim about real lap duration.

### Per-lap driver modal

`driverLapHistory(sim, driverId)` returns every completed lap with:

- lap time;
- cumulative race time (including start delay);
- position and gap at the lap boundary;
- the incident on that lap;
- a **DNF** row with `time: null` for a retirement lap.

The driver desk has **Lap by lap**; a tower row also opens it on double-click.
The existing accessible `Modal` supplies Escape, focus trap, focus restoration
and background scroll lock. Summary cards show best lap, average completed lap,
laps, grid slot and finish status. No partial lap is presented as completed.

### Richer result image

The 1200×630 PNG now includes:

- fastest lap (driver and time);
- biggest mover from grid to finish, only when positions were gained;
- player count;
- incident count and DNF count;
- the existing winner, top 10 + players, gaps/DNF, seed and disclaimer.

The result screen keeps its **Download result image** action.

### VSC playback actually slows

`incidentPlaybackFactor` returns `0.35` for the first 12 model seconds after an
SC and `0.45` for the first 8 model seconds after a VSC. The normal viewing
scale is multiplied by that factor, so the clock and cars visibly settle. The
event banner says **PLAYBACK SLOWED** and the stated time loss remains separate.
The model result is unchanged; this is a viewing effect, not a new field-
bunching model. Crash events do not use a slowdown.

### Zoom, pan and a stronger angle

The canvas now has `− / + / Fit` controls and wheel zoom (1×–2.5×). Zoom is
centred, and at zoom > 1 the circuit can be dragged to pan. Hit-testing and
hover use the same projected coordinates. The Angle view is more distinct
(rotation and vertical compression), and Fit resets zoom and pan.

### Two resilience fixes found by the E2E pass

- **Calendar does not wait for standings.** The Grand Prix picker is populated
  as soon as the calendar arrives; a slow Jolpica standings response no longer
  hides it.
- **Google Fonts cannot block the app.** The external font stylesheet starts
  with `media="print"`; the app boot switches it to `all`. If the CDN is
  unreachable, the system font stack renders the app immediately instead of
  leaving a blank root.

## Files

| Area | Files |
|---|---|
| Engine | `web/src/game.ts` — `GAME_SECONDS_PER_LAP`, `driverLapHistory`, `incidentPlaybackFactor` |
| Result card | `web/src/gameShareCard.ts` — fastest lap, biggest mover, players, DNFs, stat strip |
| UI | `web/src/components/GameView.tsx` — modal entry, per-lap table, VSC slowdown, zoom/pan, independent scheduling |
| Boot | `web/index.html`, `web/src/main.tsx` — non-blocking font sheet |
| Tests | `web/src/game.test.ts` (18), `web/src/gameShareCard.test.ts` (3) |

## Verification

| Check | Evidence |
|---|---|
| API tests | `.venv/bin/python -m pytest -q` → **93 passed** |
| Web tests | `cd web && npx vitest run` → **23 files, 105 tests passed** |
| Lint | `.venv/bin/python -m ruff check .` → **All checks passed!** |
| Types | `npx tsc -b` → exit 0 |
| Build | `npm run build` → exit 0 |
| Production bundle | served bundle matched `web/dist`; `/api/healthz` → `{"ok":true}` |
| Qualifying | 21 rows in the 2024 Baku field; first run pair `1:30.58 · 1:30.16`; no horizontal overflow |
| Start/lights | clock `1/5 · 0 s` while lights were on; race progressed after lights out |
| VSC | banner + **PLAYBACK SLOWED**; clock `91 s → 94 s` over 1.2 s (visibly slower) |
| Driver modal | 5 rows for Verstappen; DNF rows use `—` and `time: null`; Escape closes |
| Zoom/pan | 150%, dragged circuit, Fit restored |
| Result image | 1200×630 PNG, 103,035 bytes; fastest lap, mover, players, incidents visible |
| Mobile | no horizontal overflow, event and desk worked, no page errors |
| Browser errors | **[]** |

The external Jolpica archive and Docker registry were unreachable during this
run. The browser E2E used the cached actual 2024 Jolpica standings via a local
response shim; the app's normal API path and 503 handling are unchanged. The
production container was updated from `web/dist` because the registry could not
resolve the nginx base image; the source and local build are verified.

## Screenshots

`54`–`57`, `59`, `64`–`74` refreshed for Baku 2024: two-run qualifying, grid,
start lights, 20 s/lap race with VSC slowdown, driver desk, per-lap modal, zoom
and pan, angle view, result with download, result card, and mobile setup/start/
race/desk.

## Honest limits

- 20 s/lap is a viewing pace, not real time.
- Two qualifying runs are not Q1/Q2/Q3.
- VSC/SC slowdown is a playback effect; it does not add field-bunching physics.
- The result card shows top 10 plus players, not all classified rows.
- No tyre, pit-stop, collision-physics or reliability model.
