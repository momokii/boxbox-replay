# V4.7.6 plan — AI abuse controls and v4 repository wrap-up

**Target:** `v4.7.6`  
**Baseline:** `v4.7.5`

## Phase 1 — AI boundary

- Change the shared AI budget to reject rather than sleep.
- Add a per-client sliding limiter (3/min, 20/hour) and apply it to every AI
  endpoint including `/coach/ask`.
- Map local limits to HTTP 429 + `Retry-After`.
- Bound chat request shapes and set nginx body size to 256 KB.
- Add budget/limiter/end-point tests and reset hooks for isolated tests.

## Phase 2 — wrap-up audit

- Re-run code-review standards/spec checks against the v4 docs.
- Verify replay, 3D, Archive, Grid setup/qualifying/race/result, loading,
  incidents, all-events, portraits, scrollbars, mobile and data-failure paths.
- Confirm no hard standards violations; record large `GameView` as a deliberate
  follow-up refactor, not a release blocker.

## Phase 3 — docs/release

- Update README with AI limits and the final state.
- Update SECURITY, architecture, deployment, testing, CLAUDE, screenshots
  references if needed, and `.claude/state` files.
- Full tests/build/CI; commit per progress; tag `v4.7.6`.

## Acceptance

- A single client cannot monopolize the shared AI allowance.
- Global overflow is a fast 429, not a queue.
- Oversized chat bodies are rejected at the proxy/schema boundary.
- v4 behavior is unchanged outside the AI boundary.

## Shipped

`v4.7.6` shipped on 2026-11-23. Rate limits, schema/body caps and the final
v4 standards/spec/repository audit are recorded in
[`V4_7_6_WRAPUP.md`](V4_7_6_WRAPUP.md); 97 pytest + 109 vitest.
