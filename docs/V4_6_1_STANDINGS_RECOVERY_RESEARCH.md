# V4.6.1 research — stuck “Loading the table…”

**Date:** 2026-11-22  
**Baseline:** `v4.6.0`  
**Target:** `v4.6.1` (bug-fix patch)  
**Scope:** Grid standings loading and failure recovery. No feature/data change.

## Reproduction

The review capture shows:

- season `2026`;
- Grand Prix `Australian Grand Prix`;
- qualifying `Run`;
- **“Loading the table…”** in the driver roster;
- **Run qualifying** disabled;
- after a hard restart the same state remains.

Observed against the local production stack: `GET /api/standings?year=2026`
did not answer within 8 seconds, while `/api/meetings?year=2026` returned.
Repeated browser reloads made no difference.

## Root cause

### Backend request budget is much longer than the UI

`jolpica.py` currently uses:

```python
MAX_RETRIES = 3
with httpx.Client(timeout=30.0, headers=headers) as client:
    for attempt in range(1, MAX_RETRIES + 1):
        ...
        time.sleep(2**attempt)
```

Worst case is three 30-second attempts plus 2 + 4 + 8 seconds of backoff: about
**104 seconds** before `JolpicaUnavailable` reaches FastAPI and the API can
return its honest 503. The UI has no timeout of its own, so its `fetch` waits
for that entire period.

### The frontend keeps its loading state until the request settles

`web/src/api.ts` calls `fetch()` without an `AbortController`. In `GameView`,
`loading` is only cleared in the `finally` of the standings request. A hanging
request therefore leaves **“Loading the table…”** forever and keeps the start
button disabled. Reloading starts another request behind the same per-cache
lock (`_lock_for`), so the user can remain stuck even after a hard restart.

### The UI has no recovery action

The error path has a message, but no **Retry** control. The only escape is
changing season or reloading the page, which repeats the same wait.

## Fix design

1. **Bound the backend request:** use a 6-second HTTP timeout, two attempts and
   short backoff. The API returns 503 in roughly 12–13 seconds instead of
   ~104 seconds.
2. **Bound the Grid request in the browser:** use `AbortController` with a
   15-second timeout for standings and calendar. The UI must not depend on the
   backend timeout to stop displaying “Loading”.
3. **Explicit recovery:** after an error, stop loading, show a clear message
   and a **Retry** action. Retry re-runs the season load. Do not invent a
   standings table and do not enable a game without drivers.
4. **Preserve the existing independent calendar load** so the Grand Prix
   selector remains usable while standings are unavailable.
5. **No API shape change / no fabricated data.** If Jolpica is unavailable and
   no cached table exists, the honest state is an error + retry.

## Verification

- Browser with a hanging `/api/standings`: after the bounded wait, no
  “Loading the table…” remains; error and Retry are visible; start disabled.
- Retry with a healthy response loads drivers and enables the flow.
- Normal game E2E still works at desktop and mobile.
- Backend test for the fail-fast path; existing 93 pytest and 105 vitest remain
  green.

## Sources

- `jolpica.py` — `MAX_RETRIES`, `httpx.Client(timeout=30.0)`, backoff, `_get`.
- `web/src/api.ts` — `get()` has no signal/timeout.
- `web/src/components/GameView.tsx` — season effect, `loading`, message and
  start-disabled state.
- Review capture `image.png` — stuck loading roster after hard restart.
