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

**Endpoint.** `GET /session/inputs?session_key=&driver_number=&t0=&t1=`

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

## V2.10 — AI quality pass (shipped)

Review of the first AI answers found real problems, fixed here:

- **Retirements were hidden by a bug**: `getattr(row, "dnf") is True` never matched
  a numpy bool, so every race looked like it had no retirements. Uses `bool(...)`
  now, and adds an explicit "Retirements: none — every entrant was classified"
  when that is true, so the model stops claiming the information is missing.
- **Codes instead of names**: facts now carry the full classification with full
  names and teams, and the prompt asks for the full name on first mention.
- **No reference for "where did time go"**: facts now include the best sector in
  the session, the theoretical best lap, the winner's best-lap sectors and the
  fastest-lap sectors.
- **Thin race context**: full classification, retirements, weather and race
  control notes are included; tyre plans cover the top five.
- **Voice**: the system prompt makes the model the app's engineer, not a database
  reader — it forbids "the data", "the feed", "official race report" and asks for
  plain language, warm tone and an offer of a related question.
- **Scope guardrail**: off-topic questions (politics, coding, other sports) get a
  sentinel from the model, which the server replaces with a branded message:
  "That one is outside this race. I can help with what happened on track…".
- Recap prompt now asks for a five/six-sentence story with names, strategy,
  movers, retirements and fastest lap, and adapts to non-race sessions.

Tests: 84 pytest (new facts test covers the numpy-bool regression, names and the
ideal lap; new AI tests cover the sentinel and the prompt contents).

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

## V2.11 — Chat, richer facts and a pit-wall explainer (shipped)

**Chat instead of one-shots.** The Ask tab is now a conversation. The server
keeps the last 10 turns (users capped at 400 characters, assistant turns at
1600) and puts the session notes in the system message, so every turn is
grounded. History lives in `sessionStorage` per session: it survives a reload
in the same tab, disappears when the tab closes, and a two-step Clear chat wipes
it — important on a public deployment. Chat answers are not cached (they depend
on the thread); the recap still is.

**Facts that answer real questions.** Added the full pit-stop list with driver,
lap, stop number and stationary time (fastest and slowest called out), a
consistency metric (median clean lap minus personal best), and the first
recorded position versus the finish (places gained). That makes questions like
"who had the fastest and slowest stop, on which stop, and did the good tyre
managers gain places?" answerable from measured data.

**Pit wall analysis.** The deterministic model stays authoritative; the LLM only
explains it. `/ai/pit` recomputes `pit_toy_model` server-side from the same
inputs, then asks for three sentences in the app's voice that name the biggest
assumption. The model is told not to calculate new numbers. A pit-wall chat was
rejected: it would duplicate the Ask tab and split the conversation.

## V2.12 — Chat panel rebuild (shipped)

The first chat pass looked like a form with messages under it. Rebuilt against
standard chat practice (readable transcript, persistent context, no repeated
typing):

- one bordered panel with a fixed height; the transcript scrolls inside it and
  the composer is pinned to its bottom
- prompts (Race recap + five questions) are always visible above the composer,
  wrapping on desktop and scrolling horizontally on phones
- messages are bottom-anchored when short; new turns keep the reader pinned to
  the newest only if they were already there, with a “Newest ↓” jump when they
  scroll back
- the composer is a textarea that grows to about five lines, Enter sends,
  Shift+Enter breaks the line, and a live character count sits underneath
- mobile: the tab bar wraps instead of clipping, the clear action no longer
  wraps, and the panel fits under the pickers

Two real bugs surfaced while testing: the transcript did not scroll on load
because the shell mounts only after `/ai/status` resolves (the effect now depends
on it), and smooth scrolling during layout could stall (auto-follow now uses an
instant scroll in a frame).

## V2.13 — Transcript read order and pit-wall arithmetic (shipped)

**Chat.** The transcript is a two-sided conversation: your turns sit on the
right in an amber-tinted bubble, the engineer's on the left with the amber edge,
each with a role dot. It starts at the top and scrolls down as it grows; the
panel, pinned composer, prompts and scroll behaviour are unchanged. The web
container now serves `index.html` with `Cache-Control: no-store` and hashed
assets as immutable, so a stale bundle cannot hide a deploy.

**Pit wall.** The panel now shows its own algebra:

- stay out = `laps × current pace + wear × n(n−1)/2`
- pit now = `pit loss + laps × fresh pace + wear × n(n−1)/2`
- the wear term is identical in both, so it cancels in the decision and only
  moves the totals (called out next to the sums)
- **break-even pit loss** = `laps × (current − fresh) − traffic penalty`; the
  model returns it, and the UI says whether the slider is above or below it
  (or that even a free stop would not pay off)
- the margin shown includes the traffic penalty only when it applies, and says so
- the engineer explanation now sits under a description of what it receives
  (driver, tyre/age, laps left, both paces, wear, pit loss, gap, totals) and what
  it will not do (recalculate or change the numbers).

The model returns `break_even_pit_loss_s`, `stay_advantage_s`, `deg_total_s` and
`traffic_penalty_s`, covered by a test that checks the algebra, the flip point
and the traffic adjustment.

## V2.14 — Test suite trim (shipped)

The suite had grown to 164 tests, including trivia (formatting helpers, a
35-line parse matrix) and tests for dead code. The audit removed 53 tests and the
code they protected:

- dead paths deleted: `/ai/ask` and `aiAsk`, lap-mode `/session/inputs` and the
  unused client method, `clamp_selection`, `format_lap_time`, `team_colors`.
- parameter matrices merged into one test per behaviour; duplicate coverage
  removed (e.g. the same outlier rule tested twice in `perf`).
- kept: every regression test (numpy-bool retirements, circuit truncation,
  click throttle, empty-cache poisoning), every endpoint contract, and every
  pure-maths invariant.

Result: 66 Python + 47 frontend. A coverage review found two backbone paths with
no test — the replay contract (time zeroing, duration from the race clock) and
the token-cap retry that stopped truncated answers — so those two were added;
nothing else was. `docs/TESTING.md` records what we test, what we deliberately do
not, and the rules for adding a test.
