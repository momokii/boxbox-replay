# V4.6.1 plan — fail-fast standings and Grid recovery

**Target:** `v4.6.1` (patch)  
**Baseline:** `v4.6.0`

## Phase 0 — research

- Record the ~104-second worst case, missing frontend timeout and missing
  Retry action in `V4_6_1_STANDINGS_RECOVERY_RESEARCH.md`.
- Commit the research/plan before code.

## Phase 1 — backend bound

- Add configurable `JOLPICA_TIMEOUT_S` (default 6 s) and
  `JOLPICA_MAX_RETRIES` (default 2) to `jolpica.py`.
- Use a short connect timeout and at most one short retry/backoff.
- Confirm a `JolpicaUnavailable` becomes the existing honest 503 without a
  ~104-second block.
- Add a focused test for the fail-fast behavior where practical.

## Phase 2 — frontend timeout and Retry

- Add optional timeout support to `web/src/api.ts` using `AbortController`;
  pass 15 s for standings and meetings.
- Add a `reload` token to `GameView` and a **Retry** button beside the error.
- Ensure `loading` clears in `finally` even on abort, and that the UI shows:
  “The season table did not load. Retry…” rather than “Loading…” forever.
- Keep the start button disabled until real drivers are present.
- Add a mobile-safe error/retry state.

## Phase 3 — E2E

- Reproduce a hanging standings request in Playwright.
- Verify:
  - no indefinite “Loading the table…”;
  - explicit Retry visible;
  - no fabrication and start disabled;
  - a healthy Retry loads the roster;
  - normal 2024 Baku flow still works.
- Capture the error/retry state as a screenshot.

## Phase 4 — docs/release

- Update README, CLAUDE.md, architecture/testing, screenshots README,
  `V4_6_1_CLOSEOUT.md`, state files and decisions.
- Full pytest/vitest/ruff/tsc/build, production bundle check, commit per
  progress; tag `v4.6.1` (push when GitHub connectivity is available).

## Acceptance

- No request can leave the Grid roster loading indefinitely.
- Unavailable standings produce a clear, retryable error.
- Retry and normal loading both work on desktop and mobile.
- Existing game features and tests remain intact.

## Shipped

`v4.6.1` shipped on 2026-11-22. The backend returns 503 after ~10.3 s instead
of ~100 s; the roster shows an explicit error + Retry, an actual hard restart
no longer stalls indefinitely, and a healthy retry loads the driver table.
Evidence: 94 pytest + 105 vitest, browser error/retry check at 1440×900, and
`docs/screenshots/75-grid-standings-error.png`.
