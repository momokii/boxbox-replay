# V4.7.6 research — AI abuse controls and v4 wrap-up

**Date:** 2026-11-23  
**Baseline:** `v4.7.5`  
**Target:** `v4.7.6`

## Findings

### AI budget could queue instead of rejecting

`ai._budget()` slept until a shared slot was free. A burst of requests could
occupy API threads, wait indefinitely behind the shared 6/min allowance and
only then reach the provider. There was no per-client limit: one browser could
consume the whole portfolio allowance and make the AI unavailable to everyone.

`/coach/ask` and `/ai/explain` also had no request-level guard, and chat bodies
were only trimmed after FastAPI had parsed and materialised them.

### Repository/structure review

- The v4 code paths are tested and E2E-checked; no broad refactor is safe as a
  wrap-up change without adding regression risk.
- `GameView.tsx` is large and is recorded as a follow-up refactor candidate, not
  a correctness failure.
- Generated local files (`.coverage`, `__pycache__`, `.env`, caches, `dist`)
  are ignored; `skills-lock.json` is the skill tool's intentional metadata.
- Docs are versioned per milestone; README remains the public entry point.

## Controls added in this patch

1. Shared AI budget is **non-blocking**: one per second and 6/minute, then
   `AIRateLimited` → HTTP 429 with `Retry-After`.
2. Per-client sliding window: **3/min and 20/hour**, keyed by nginx
   `X-Real-IP` (fallback `X-Forwarded-For`/socket peer). Global remains 6/min.
3. Every AI endpoint (`chat`, `explain`, `pit`, `report`, `recap`, `coach/ask`)
   uses the client guard and maps local rate limits to 429.
4. Chat schema caps each turn at 1,600 chars and 10 turns; the question remains
   3–400 chars.
5. nginx `client_max_body_size 256k`.
6. The key remains server-only; no browser exposure.

## Verification

- Per-client guard returns 429 on the 4th request in a minute.
- Global budget rejects a second immediate call.
- Existing AI/cache/fallback tests remain green.
- Full v4 replay/3D/Archive/Grid E2E remains green.
