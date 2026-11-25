# V4.7.2 close-out — incident expiry and loading feedback

**Release:** `v4.7.2`  
**Baseline:** `v4.7.1`

## Fixes

### Incidents expire

`activeRaceEvent` now uses a per-kind visibility window:

| Event | Active window |
|---|---|
| SC | 12 model seconds |
| VSC | 8 model seconds |
| Crash | 6 model seconds |

The banner, canvas overlay/ring, current live-feed card and playback factor use
that active event. After the window:

- the red/amber banner disappears;
- the orange/yellow circuit disappears;
- the crash ring disappears;
- the current feed card says “No active incident”;
- the feed history still lists the event.

A race can finish with no stale SC/CRASH decoration.

### Grid loading has motion

- a sticky indeterminate bar while `loading`, `loadingSessions` or
  `preparing` is true;
- spinner + skeleton rows while the driver table is loading;
- spinner inside **Building circuit…**;
- reduced-motion keeps a static visible state.

The roster still shows an explicit error + Retry if standings fail; no request
can leave the UI loading forever.

## Verification

| Check | Evidence |
|---|---|
| API tests | `.venv/bin/python -m pytest` → **94 passed** |
| Web tests | `cd web && npx vitest run` → **23 files, 108 tests passed** |
| Lint/type/build | ruff clean · `tsc -b` exit 0 · `npm run build` exit 0 |
| Incident active | VSC banner + orange track overlay captured |
| Incident cleared | after 3.5 s: banner 0, current feed `GREEN · No active incident`; history remains |
| Loading | delayed standings: spinner + skeleton + top bar visible; clears to 25 drivers |
| Data failure | v4.6.1 bounded timeout/Retry retained |
| Browser errors | none |

## Screenshots

- `82-grid-loading.png` — dynamic loading state;
- `83-grid-event-active.png` — active VSC spotlight;
- `84-grid-event-cleared.png` — cleared event with history retained.

## Honest limits

Incident windows are model playback choices, not official duration. The feed
history remains labelled simulated. SC/VSC/CRASH are seeded game events.
