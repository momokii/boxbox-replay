# BoxBox Replay — v2 implementation plan

Companion to `docs/V2_RESEARCH.md` (sources, limits, rationale). This file is
the execution plan: order, contracts, files, acceptance criteria.

Rules for every milestone: one commit per milestone (or per backend/frontend
half), tests and lint green before the commit, state files updated in the same
step.

## Order and why

**Status (2026-11-03):** V2.1–V2.4 shipped and verified in production.
V2.2 adds the AI layer: grounded Q&A and a race recap through OpenCode Go
(`deepseek-v4.1-flash`), server-side key, budget and cache (see §V2.8 below).
V2.5 deferred with measured reasons (§V2.5). V2.6–V2.7 remain backlog.

| Step | Milestone | Depends on | Why first |
|---|---|---|---|
| V2.1 | Rate limiter + single-flight | — | Every new fetch below rides on it; without it concurrent users hit 429 |
| V2.2 | Lap Duel (backend) | V2.1 | The signature feature; defines trace/delta shape |
| V2.3 | Lap Duel (UI) | V2.2 | First visible v2 surface |
| V2.4 | Telemetry traces | V2.1 | Reuses per-lap `car_data` windows |
| V2.5 | Fight Finder | V2.1 | **Deferred** — the gap feed is too noisy for an honest list (see below) |
| V2.6 | Pit strategy Gantt | — | Already-cached `stints`/`pit` |
| V2.7 | Share card PNG | V2.3 | Exports the duel/replay frame |

Qualifying mini-sectors stay out of v2 (see research §7).

---

## V2.1 — Rate limiter and single-flight

**Problem.** The fetcher spaces calls 0.4 s apart (150 req/min) while OpenF1
documents 3 req/s and 30 req/min. Retries hide the 429s as latency, and two
concurrent cold sessions can fail entirely.

**Design.**

- New `ratelimit.py`: `TokenBucket(per_second, per_minute)` enforcing both a
  minimum gap and a rolling 60 s window. Injectable `clock`/`sleep` so tests
  are deterministic and fast.
- `data_loader` builds one bucket from env (`OPENF1_RATE_PER_SEC` default 3,
  `OPENF1_RATE_PER_MIN` default 30) and calls `acquire()` before every request.
- Single-flight: a lock per cache file. Double-checked re-read inside the lock
  so the second caller returns the freshly written parquet instead of fetching
  again. `build_session_replay` holds the same lock across the whole build.
- No lock is held during network I/O; the bucket lock only computes the slot.

**Acceptance.**

- Unit tests with a fake clock: no more than N requests per rolling minute, no
  closer than 1/per_second, idle bucket does not wait.
- A concurrency test: two threads requesting the same cache key perform exactly
  one `_fetch`.
- `pytest` stays green with no sleeps added to the suite.
- `.env.example`, `docs/DEPLOYMENT.md` and `README.md` document the limits.

**Risk.** Holding the bucket lock across `sleep()` serialises all callers; that
is intended (it is a global budget), but the sleep must happen outside the
25 ms computation each iteration, not during I/O.

---

## V2.2 — Lap Duel backend

**Goal.** Two laps, aligned by progress around the lap, with a time delta.

**Endpoint.** `GET /session/duel?session_key=&a_driver=&a_lap=&b_driver=&b_lap=`

```json
{
  "a": { "driver_number": 12, "lap": 20, "lap_duration": 92.104 },
  "b": { "driver_number": 63, "lap": 18, "lap_duration": 92.402 },
  "points": 600,
  "traces": {
    "a": [[f, x, y, t], ...],
    "b": [[f, x, y, t], ...]
  },
  "delta": [[f, dt], ...]
}
```

- `f` is progress in `[0, 1]` along that lap's own path, `t` is seconds from
  lap start, `dt = t_b(f) - t_a(f)` (negative = B ahead).
- Both cars start at `f = 0, t = 0`; `dt` at `f = 1` equals the lap-time
  difference, which is the invariant the tests assert.
- Data path: reuse `_lap_merged_car_loc` (already fetches a lap window), build
  a cumulative distance from consecutive points, resample to a fixed grid by
  distance, then convert to per-lap progress.
- Empty or degenerate laps return 404 with a sentence the UI can print.

**Acceptance.**

- Synthetic test pair (same circle, B 1.0 s slower) yields `dt(1) == 1.0 ± 0.01`
  and `dt(0) == 0`.
- A lap with no location data returns 404, not a 500.
- Response is under ~300 KB for two laps at 600 points.

---

## V2.3 — Lap Duel UI

**Goal.** Two cars race on the circuit; a centre bar shows who leads and by how
much; the user can play, pause, scrub and swap drivers.

- New `DuelPanel` view (fifth tab), its own clock in `[0, max(lap durations)]`.
- Canvas reuses `chart.ts` transform and the session outline; draws the two
  cars, their colours, and a label per car.
- Delta bar: `+0.312` style, green/red relative to the leader, three decimals,
  monospaced tabular numbers.
- Pickers default to the followed drivers' fastest laps; a swap button flips A
  and B.
- Reduced motion: no trails, but the clock and delta still update.

**Acceptance.**

- Delta at `t = 0` reads `0.000`; at `t = max` matches the lap-time difference
  to three decimals.
- Changing either lap refetches only that pair (cache hit on repeat).
- Mobile layout keeps the bar visible above the fold.
- Screenshot-verified at 1440 px and 390 px.

---

## V2.4 — Telemetry traces

**Endpoint.** `GET /session/inputs?session_key=&driver_number=&lap=`

- Returns `speed`, `throttle`, `brake`, `n_gear`, `drs`, `date_offsets` for the
  lap window, downsampled to ~2 Hz for the trace plus raw peaks.
- `drs` may be all `null` (2026): the UI prints "—", never a guessed state.

**UI (shipped, extended).** An "Inputs" strip under the speed chart for every
followed driver: one throttle line per driver in team colour, a brake tick row
each, gear from the reference driver, DRS per driver, the replay playhead, and a
hover tooltip with every driver's values at the pointer. Window mode in the
endpoint keeps all drivers on one axis.

**Acceptance.** Peak speed in the strip matches `/session/speed` within one
sample; missing channels hide their row with a reason; tests cover a lap with
`drs = null`.

---

## V2.5 — Fight Finder (deferred)

**Status: deferred after measurement, not implemented.** Two definitions were
prototyped against the 2026 US GP:

- adjacent drivers under 1 s: 593 runs, including dozens of 3–5 s blips caused
  by asynchronous per-driver samples;
- sustained `interval < 1 s` per driver: 181 runs, including 500-second
  "battles" where the feed keeps a stale interval while the car is not actually
  fighting (traffic, lapped cars, pit stops).

Both are too noisy to show as a list without a real adjacency model: same-lap
check, pit/blue-flag exclusion, and a requirement that the gap actually moves.
Fabricating a list would break the honesty rule the rest of the app follows.
Revisit with positions plus intervals, not intervals alone.

## V2.5 (original contract, kept for the future)

**Endpoint.** `GET /session/fights?session_key=`

- Server-side pass over `intervals`: a fight = two drivers within 1.0 s for at
  least two consecutive samples; score = duration × position changes.
- Returns `[{a, b, start_t, end_t, min_gap, changes}]` sorted by score.
- No fabrication: every entry carries the timestamps it was derived from.

**UI.** A "Fights" list in the battle tab; clicking seeks the replay and loads
that pair into the battle panel. Empty state explains the 1.0 s threshold.

**Acceptance.** Every returned fight re-validates from the underlying interval
rows in a test; entries never point outside the session window.

---

## V2.6 — Pit strategy Gantt

- Bars per driver on a shared lap axis, compound colour, pit windows marked,
  hover for tyre age and the gap at that lap.
- Data already cached (`stints`, `pit`); no new requests.
- Acceptance: every bar maps to a stint row; gaps between bars are pit laps and
  are visibly labelled as such.

## V2.7 — Share card

- 1200×630 canvas export: track outline, the two duel cars or the replay frame,
  session name, lap, clock, drivers.
- Client-side only; no new endpoint.
- Acceptance: exported PNG opens standalone, text is legible at 50% scale, and
  the export path is covered by a unit test for the layout maths.

---

## Cross-cutting

- **Tests:** each backend endpoint gets happy-path plus one empty/degenerate
  case; each new frontend module gets unit tests for its maths.
- **Docs:** update `README.md` feature list, `docs/ARCHITECTURE.md` endpoint
  table, `.claude/state/CURRENT_STATUS.md` and `TASK_QUEUE.md` in the same
  commit as the feature.
- **Perf:** no new work on the replay rAF loop; duel and traces run on their own
  clocks, paused when their view is hidden.
- **Security:** no new secrets; the rate-limiter env vars are documented in
  `.env.example`; no user input reaches a shell or path.

## V2.8 — Grounded AI answers (shipped)

- Provider: OpenCode Go, OpenAI-compatible chat completions at
  `https://opencode.ai/inference/go/openai/v1`, model `deepseek-v4.1-flash`.
  The provider requires a stable `x-opencode-session` header and a client user
  agent; both are set in `ai.py`.
- Grounding: `_ai_facts` compresses cached session data (result, fastest lap,
  sectors, clean-lap pace, pit stops, tyre plans, overtakes). The system prompt
  forbids inventing numbers and requires an explicit refusal when data is thin.
- Safety: key only in `.env` (server), never sent to the browser; 3 retries for
  transient 5xx/429; a 6/min budget; per-session answer cache; `max_tokens`
  raised to 1200 because reasoning tokens count toward the cap (500 truncated
  answers mid-sentence).

## V2.9 — Dashboard instead of forced selection (shipped)

The app used to auto-open the latest race on first visit. That removed the
user's choice and made the landing state invisible. Now nothing is selected
until the user acts: the dashboard shows a Continue list from localStorage
(newest first, one entry per session, max 8, deletable per entry or cleared in
two steps), a random “Surprise me” picker (season, circuit and session), a three-step
explanation, and the free-data note. Deep
links and the pickers are unchanged. 7 unit tests cover the storage layer
(broken JSON, shape validation, dedupe, cap, remove, clear).

Revision after review: the remove control is a subtle icon (visible at 40%,
full on hover/focus, always visible on touch) instead of a boxed “×”; lists
longer than four entries get a filter field and a capped scroll area; the
suggestions were replaced with a random picker that needs no telemetry probe
(the blocked-session screen offers another roll).
