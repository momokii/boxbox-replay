# V3.11 — Replay progress and cancellation

Release `v3.11.0`.

## Backend

- Add a per-session replay build state: total drivers, completed drivers,
  started time, cancellation event.
- `build_session_replay` updates the state around each per-driver location fetch
  and stops before the next fetch when cancelled. Never write a partial replay
  parquet; per-driver location caches stay reusable.
- `GET /session/replay/status?session_key=` returns `{state,total,done,elapsed_s}`
  or `idle`.
- `POST /session/replay/cancel?session_key=` signals cancellation.
- `/session/replay` returns a clear 409 when cancelled.

## Frontend

- When a replay is loading, poll the local status endpoint and show
  `Building replay · N/total drivers · Xs`.
- Explain the cold-cache/rate-limit cost in the loading card.
- On session switch, cancel the previous replay build before starting the new
  one; ignore the cancelled old response.
- Do not show a stale error from a cancelled request.

## Acceptance

- Switching from a cold session to another cancels the old build.
- New session shows progress and eventually loads; second visit is instant.
- No partial replay cache is written.
- API tests for status/cancel, data-loader tests for progress/cancel.
- 90+ pytest, 74+ vitest, browser audit, CI green; docs/README/screenshots updated.
