# V4.6.1 close-out — fail-fast Grid standings

**Release:** `v4.6.1` (patch)  
**Baseline:** `v4.6.0`  
**Scope:** Grid standings loading and recovery. No feature/data change.

## What was wrong

The review capture showed **“Loading the table…”** and a disabled start button
after a hard restart. The backend used three 30-second Jolpica attempts plus
exponential backoff; the frontend had no timeout and only offered retry by
reloading. A hard restart simply queued another request behind the same cache
lock.

## What changed

### Backend fail-fast budget

`jolpica.py` now defaults to:

- `JOLPICA_TIMEOUT_S=4` per attempt;
- `JOLPICA_MAX_RETRIES=2`;
- `JOLPICA_RETRY_BACKOFF_S=0.5`.

Worst-case archive time drops from roughly **104 seconds** to about **10
seconds**, then FastAPI returns the existing honest **503**. The values are
environment-configurable and documented in `.env.example`.

A new pytest covers the bounded retry path with a fake failing HTTP client.

### Frontend bounded requests and Retry

`web/src/api.ts` supports an optional timeout with `AbortController`. Standings
and meetings use **15 seconds**, so the UI no longer waits on a hanging
connection. If the request fails or aborts:

- loading stops;
- an explicit message is shown;
- a **Retry** button re-runs the season load;
- the start button remains disabled because no drivers exist;
- the roster says **“No drivers loaded. Retry the season table or pick another
  season.”** instead of pretending the table is empty.

The Grand Prix calendar remains independent, so the picker is not blocked by
the standings request. A healthy retry loads the drivers without a page
reload.

## Verification

| Check | Evidence |
|---|---|
| API tests | `.venv/bin/python -m pytest -q` → **94 passed** |
| Web tests | `cd web && npx vitest run` → **23 files, 105 tests passed** |
| Lint | `.venv/bin/python -m ruff check .` → all checks passed |
| Types | `npx tsc -b` → exit 0 |
| Build | `npm run build` → exit 0 |
| Actual offline archive | `GET /api/standings?year=2026` → **503 in 10.3 s** (was ~90 s+) |
| Error state | after the timeout: message + **Retry**, loading text gone, start disabled, no fabricated drivers |
| Healthy retry | 21 drivers loaded after Retry; loading cleared; start control available after picking a driver |
| Browser errors | none |

## Files

- `jolpica.py` — bounded request timeout/retries/backoff.
- `tests/test_jolpica.py` — fail-fast retry test.
- `web/src/api.ts` — optional AbortController timeout.
- `web/src/components/GameView.tsx` — retry token, explicit error, corrected
  empty state, standings-only loading.
- `web/src/components/game.css` — message/retry layout.
- `docs/screenshots/75-grid-standings-error.png` — recovered error state.

## Honest limits

A fast 503 is still a failure: without a reachable Jolpica archive or a cached
table, the game cannot build truthful driver ratings. The UI now says so and
lets the user retry or choose another season; it does not invent standings.
The production container was updated from the verified dist because the Docker
registry remained unreachable; GitHub push/tag also remained blocked in this
environment.
