# BoxBox Replay — v3 core implementation plan (end-to-end)

Companion docs: `docs/V3_RESEARCH.md` (sources/limits), `docs/V3_PLAN.md`
(overview/order/gates). This document is the **implementation-ready, end-to-end
design and plan for the v3 core features we are committing to ship**, subject to
the V3.0 decisions recorded below. It is written so implementation can proceed
milestone-by-milestone without re-planning.

**Status (2026-11-14): design complete, implementation not started.** No v3
feature code is shipped. v2 baseline is `v2.13.1` (67 pytest + 53 vitest, CI
green).

## 0. Commitment and scope

### 0.1 Committed core (sure to implement, if V3.0 accepted)

A feature is committed only when all are true: (1) primary data is from a free,
permitted, currently-available source we already access (OpenF1 historical 2023+,
no auth, non-commercial) or from data already cached/client state; (2) usable
within the enforced budget **3 req/s + 30 req/min** via the existing token bucket,
single-flight and parquet cache (no new unbounded fetch paths); (3) degrades
honestly (missing/uncertain → "—" or an explicit reason, never fabricated) and
meets acceptance tests, security, and perf rules.

| ID | Feature | Data (free, current) | Rate-limit/cache impact |
|---|---|---|---|
| V3.1 | Strategy engine core (replaces pit toy) | OpenF1 `laps`, `stints`, `pit`, `weather`, `race_control`, `intervals/position` (already fetched/cached per session) | **No new feed types required**; reads cached session data. Any added fetch reuses bucket+single-flight+cache. |
| V3.2 | Telemetry Lab 2.0 (multi-driver traces/corner deltas) | OpenF1 `car_data`, `location`, `laps` (already fetched/cached; windowed) | Uses existing per-lap/driver windows and caches; downsampled responses; no extra full-field scan. |
| V3.3 | AI race engineer 2.0 (grounded explain) | Computed facts from session + V3.1 + V3.2 outputs + OpenCode Go (server-side key, budget/caching) | No race-data fetches; bounded prompts/responses; on-demand default to control cost. |
| V3.4b | Weather impact & race-control timeline | OpenF1 `weather`, `race_control`, `laps` (cached) | Reads cached feeds only. |
| V3.4d | Director layouts & PWA/offline (cached sessions) | Client state + existing cached session data | No new upstream fetches; offline serves already-cached assets/data states. |
| V3.4e | Data export (CSV/JSON) | Shown session/lap/stint/trace data | Client-side or bounded server serialization of cached/shown data; no new upstream fetches. |

### 0.2 Conditional add-ons (implemented as capabilities with strict data gates, not blanket guarantees)

- **V3.4a Quali/practice mini-sectors:** show segment analysis **only** when
  `laps.segments_sector_*` contain meaningful (non-placeholder) data for that
  session type (typically quali/practice). Races and placeholder/missing data
  render an explicit reason, never fabricated segments.
- **V3.4c Pit crew & overtake analytics:** render distributions/events only from
  available `pit`/`overtakes` fields; `stop_duration`/lane detail or overtake
  completeness may be missing → "—" with note. **Historical Fight Finder scan
  stays rejected** (intervals 181–593 noisy runs; position feed sparse).

These are included in this plan as gated sub-milestones; they ship only for
sessions where data is valid.

### 0.3 Explicitly out of committed core (not guaranteed)

- **V3.5a 3D/WebGL replay:** stretch, perf-gated, hard 2D fallback required.
- **V3.5b Jolpica 1950+ archive, V3.5c championship progression:** stretch,
  licence/freshness/beta gated (Jolpica CC BY-NC-SA, non-commercial, attribution,
  no dump redistribution, isolated adapter; no telemetry pre-2023).
- **Excluded:** live timing/replay (paid), FastF1 runtime (F1TV auth), radio
  transcription guarantees, fantasy scope creep.

### 0.4 V3.0 decisions (recorded 2026-11-14)

| # | Decision | Proposed default | Rationale | Rejected |
|---|---|---|---|---|
| D1 | Headline priority | **Strategy + Telemetry Lab + grounded AI first** (V3.1–V3.3) | Directly deepens shipped surfaces on free data; 3D is visual/high-risk | 3D as equal headline |
| D2 | Live timing | **Strictly historical/free** | Must work on demand for portfolio; paid €9.90/mo is optional personal demo only, never required | Paid live in core |
| D3 | AI narration mode | **On-demand by default** (chat/recap/explain actions); proactive key-moment narration behind explicit opt-in flag only if later added | Controls cost and hallucination surface; every claim tied to a user action + fact bundle | Always-on proactive narration |
| D4 | Track geometry (for telemetry/corners/3D later) | **GPS-derived/session geometry default** (existing), no dependency on MultiViewer; optional best-effort overlay only with graceful fallback | MultiViewer endpoint terms/availability not guaranteed; current path is free/reliable | Hard dependency on MultiViewer/f1-circuits |
| D5 | Jolpica era view | **Not in core**; only a separate archive view if/when licence posture accepted (CC BY-NC-SA, non-commercial, attribution, share-alike care, no dump redistribution, isolated adapter) | Licence-mixing risk; no telemetry pre-2023 | Mixing 1950+ archive into 2023+ replay core |
| D6 | Demo prewarm set | **2026 United States GP, 2024 Suzuka, 2024 Monaco** (scripted) | Keeps cold-open experience usable within 30 req/min floor | No prewarm / ad-hoc |

**Status:** D1–D6 are recorded in `.claude/state/DECISIONS_LOG.md`; the V3.0 gate
is closed. Feature work starts at V3.1.

## 1. Cross-cutting contracts (apply to every milestone)

- **Data honesty:** never invent numbers/states. Missing channel/field → `null`
  in API and "—" (or an explained reason) in UI. Estimates/assumptions are
  labelled and returned in the response. Placeholder segments are not shown as
  real data.
- **Rate limits & caching:** all OpenF1 requests go through `data_loader` +
  `ratelimit.TokenBucket` (3/s, 30/min) with single-flight per cache key and
  atomic parquet writes; never cache empty results; respect existing cache
  versioning/refresh. Core V3 adds **no required new feed types**; prefer reading
  already-cached session feeds.
- **Time/units:** session time is seconds from lights out (existing clock).
  Distances/fractions for trace alignment use the existing scale-free/normalised
  approach (OpenF1 coords not metres). Money-like precision: times in seconds,
  shown to context-appropriate decimals (existing format helpers).
- **Perf:** no new work on the global replay `requestAnimationFrame` loop; heavy
  views compute/draw on their own subscriptions/clocks and pause/stop when hidden
  or offscreen (follow `useThrottledTick` / per-view patterns).
- **Security:** no secrets in repo/client; AI key server-side only (`.env`,
  gitignored). Validate and bound all request params (types, ranges, driver/lap
  membership); no user input to shell or file paths. PWA/export must not leak
  secrets and must respect non-commercial/licence terms.
- **Testing (per `docs/TESTING.md` rules):** every new pure function gets
  invariant/unit tests; every endpoint gets one happy path + one
  failure/degenerate case; UI maths/state get vitest; no sleeps; mock network,
  never maths. `pytest` + `ruff` + `npm test` + build green before each commit.
- **Accessibility/UX:** reduced-motion respected, keyboard/screen-reader labels
  for interactive controls, responsive (incl. ~390 px), consistent empty/loading
  states.

## 2. Interface design (design-an-interface) — alternatives and synthesis

For each key module the first idea is treated as suspect; radically different
shapes were considered and a synthesis chosen for depth (small interface hiding
real complexity), correctness, and fit with the existing codebase.

### 2.1 Strategy engine (V3.1) — core module & API

**Problem:** replace the toy `analysis.pit_toy_model` (linear wear, static rivals,
user pit loss) with a defensible, auditable strategy model over cached
`laps/stints/pit/weather/race_control`.

| Option | Interface shape | Hides | Trade-offs |
|---|---|---|---|
| A. Minimal pure calculator | `simulate_strategy(session_data, opts) -> StrategyResult` (one function) | filtering, fits, scenarios, ranking inside | Simple call site, but a "god function" is hard to test/extend and blurs assumption reporting |
| B. Max-flex scenario DSL/builder | `StrategyBuilder().with_stint(...).with_sc(...).run()` fluent API | internal graph of scenarios | Flexible for future cases but over-general for current needs; larger surface, easier to misuse, harder to keep pure/serialisable |
| C. **Chosen: small pipeline of pure functions + one orchestrator** | (1) `clean_laps(...)`, (2) `pace_profile(...)` (deg + fuel-proxy), (3) `simulate(...)` returning ranked options + `assumptions`, wrapped by `strategy_model(...) -> StrategyResult`; API returns the result+assumptions as-is | outlier/SC filtering, robust stats, deg/fuel math, ranking, uncertainty flags | **Deep module:** few entry points, each testable with invariants; `assumptions` travels with outputs (auditability). Slightly more functions than A but far clearer and evolvable than B. UI/AI consume one stable result shape. |

**Synthesis (chosen):** pipeline-of-pure-functions (C). `analysis.pit_toy_model`
remains for compatibility/reference but the v3 path uses `strategy_model` (new
`strategy.py` module to keep `analysis.py` coherent and testable). Every number
in the UI maps to a field in `StrategyResult`; no hidden constants.

### 2.2 Telemetry Lab traces (V3.2) — comparison interface

| Option | Interface shape | Hides | Trade-offs |
|---|---|---|---|
| A. Single mega-endpoint | `/session/telemetry?drivers=a,b,...&t0=&t1=&mode=` returns everything | windowing, alignment, downsample | One call, but heavy payload/params and hard to cache/compose |
| B. Per-driver fetch, client aligns | client calls per-driver windows and aligns | almost nothing server-side | Wastes budget/RTT, duplicates logic, drift risk |
| C. **Chosen: aligned multi-driver window endpoint + reusable pure align/downsample** | `GET /session/telemetry` (or evolve inputs/duel) takes `session_key`, `drivers[]`, window (`t0/t1` or `driver+lap`), `axis` (`distance` default for compare), `points`; returns aligned series per driver/channel with `null`s preserved and metadata (`axis`, `resolution`, `coverage`) | resampling, distance-normalisation, downsampling/peak preservation, channel presence | **Deep:** server guarantees alignment and bounded size; clients render. Reuses duel distance logic and inputs channel shapes; cacheable by (session, drivers, window, axis, points). |

**Synthesis (chosen):** C — server-aligned, bounded, honest-null traces; pure
align/downsample helpers in `analysis.py`/`strategy`-adjacent utils tested for
invariants.

### 2.3 AI grounding (V3.3) — explanation interface

| Option | Interface shape | Hides | Trade-offs |
|---|---|---|---|
| A. Free-form "explain this" with raw context | pass large blobs/logs to model | nothing | Hallucination and size/cost risk |
| B. Many narrow endpoints per topic | `/ai/strategy`, `/ai/trace`, `/ai/moment` each bespoke | prompt per case | Clear but proliferates surfaces |
| C. **Chosen: one fact-bundle explainer with typed kinds** | `POST /ai/explain` with `{session_key, kind: "strategy"|"compare"|"moment"|"recap", subject}` where **the server builds the fact bundle** from cached data / its own computed results; the client never supplies facts | prompt assembly, fact construction, truncation/budget, scope guard, caching keying | **Deep & safe:** one audited path; every claim maps to a field the server computed. Accepting client facts (or a client-chosen facts_ref) would let a caller inject claims, so the contract does not allow it. |

**Synthesis (chosen):** C, implemented as an extension of `ai.py` +
fact-builder helpers (e.g. `analysis/strategy` emit bundles). On-demand only
(D3). Existing `/ai/chat`, `/ai/recap`, `/ai/pit` remain compatible; `/ai/explain`
(or a unified chat action carrying a fact bundle) is the v3 mechanism.

### 2.4 PWA/offline & export (V3.4d/e)

| Option | Shape | Synthesis |
|---|---|---|
| Offline | full-app offline vs **cached-session replay only** | **Cached-session replay only:** service worker caches app shell + explicitly cached session payloads; UI states "available offline" vs "not cached" clearly. Avoids pretending arbitrary sessions work offline. |
| Export | server-generated files vs **client-generated from shown/cached data** | **Client-generated (CSV/JSON)** from data already loaded/shown: no new endpoint/secrets surface, bounded to session data in view; filename includes session/selection. Server endpoint only if payload size forces it (then bounded, validated, no paths). |

### 2.5 Caller usage (chosen interfaces)

```python
# V3.1 — pure model, then API; UI/AI only read StrategyResult.
result = strategy_model(frames, StrategyOptions(driver=1, from_lap=43, laps_remaining=10))
result.options[0].total_s, result.break_even_pit_loss_s, result.assumptions

# V3.2 — one aligned window; the axis is explicit and never inferred.
POST /session/telemetry
{"session_key":11396,"drivers":[1,3],"axis":"distance",
 "window":{"kind":"lap","driver":1,"lap":43},"points":600}
# -> {"axis":"distance","f":[...],"series":[...],"corners":[...],"coverage":{...}}

# V3.3 — facts are server-built; the client sends only the subject.
POST /ai/explain
{"session_key":11396,"kind":"strategy","subject":{"driver":1,"from_lap":43}}
```

## 3. V3.1 — Strategy engine core (committed)

### 3.1 Goal (shipped)
Replace the labelled toy pit wall with a transparent, testable strategy
simulator. The user can compare stay-vs-pit and ranked alternatives for a
selected driver at a chosen lap/context, seeing how the answer is derived.

### 3.1.1 Data flow (cached, no new feed types)
`session_key` → cached `laps`, `stints`, `pit`, `weather`, `race_control`,
(optionally `intervals/position` for traffic context) via `data_loader` accessors
→ pure `strategy_model(...)` → `StrategyResult` (values + assumptions +
coverage/limits) → API → UI (and fact bundle for V3.3).

### 3.1.2 Domain model & pure interface (synthesis C)

New module: `strategy.py` (pure; no I/O). Inputs/outputs are plain
dicts/dataclasses/typed structures serialisable to JSON.

- **`LapFilterConfig`** (typed/config): `exclude_pit_laps: bool = True`,
  `slow_lap_factor: float = 1.07` (of stint median clean pace), `min_clean_laps: int`,
  flags to drop/mark SC/VSC-affected laps (from `race_control` categories and/or
  pace anomaly vs rolling baseline).
- **`clean_stint_laps(laps_df, stints_df, race_control_df, config) -> CleanLaps`**:
  per-stint list of usable laps with reasons for exclusions; returns coverage
  counts. *Hides:* pit-in/out detection, thresholding, SC windows.
- **`pace_profile(clean_laps, stints_df, config) -> PaceProfile`**:
  per-stint (and overall) robust baseline pace (median), **degradation slope**
  (s/lap, compound-aware fit over clean laps, floored/sane-bounded), and an
  **optional fuel-burn proxy** defaulting to **0 (off)**: the feed carries no
  fuel load, so inventing a burn rate would be a fabricated number. If enabled
  it is an explicit, visible assumption (`fuel_adj_s_per_lap`, sign/meaning
  documented) and listed in `assumptions[]`; the UI says "fuel adjustment: off"
  otherwise. Returns fit quality/uncertainty (lap count, dispersion) and
  `null`/reason when not measurable.
- **`simulate_strategies(profile, stints_df, pit_df, opts) -> StrategyResult`**:
  `opts` includes `driver`, `from_lap`/`laps_remaining`, `pit_loss_s` (user or
  derived from the median `pit_duration` **lane-time proxy**, labelled as such;
  `stop_duration` is stationary time, not pit loss; fallback to the user value),
  candidate strategies (stay; pit now/at lap L; **only compounds observed for
  that driver in this race**, with a note when one is unavailable), optional
  `traffic_penalty_s` model (simple, transparent: e.g.
  rejoin gap penalty when `intervals` indicate traffic, else 0 with note),
  optional SC/VSC delta scenarios (offset applied with assumption). *Outputs:*
  - `options[]`: `{id, label, stops, compound_plan, total_s, delta_to_best_s, rank}`
  - `break_even_pit_loss_s`, `undercut_window` (range/estimate or `null` + reason)
  - `assumptions[]`: human-readable items covering fuel proxy, deg fit scope,
    pit-loss source, traffic model, SC scenario, excluded laps/counts
  - `coverage`: `{clean_laps, excluded, stints_used, measurable: bool, reasons[]}`
  - `inputs_echo`: the resolved numeric inputs (so UI/AI cite them, never recompute)
- **`strategy_model(session_frames, opts) -> StrategyResult`**: orchestrator
  (pure given frames) calling the pipeline; never raises on empty/degenerate
  data — returns `measurable:false` with reasons.

**Backward compatibility:** keep `analysis.pit_toy_model` (and `/pit-call`) so
existing UI/tests keep working; `/pit-call` may internally call `strategy_model`
in a "toy-compatible" mode or remain as-is while the UI migrates to the richer
endpoint — final choice: **add `GET/POST /session/strategy` returning
`StrategyResult` and migrate PitPanel to it; retain `/pit-call` + `/ai/pit`
behaviour for one release (deprecated in UI copy) to avoid breakage.**

### 3.1.3 API contract

- `GET /session/strategy?session_key=&driver_number=&from_lap=&laps_remaining=&pit_loss_s=&scenario=` 
  (or POST with body; prefer GET for cacheability, POST if params grow — **chosen:
  POST `/session/strategy`** for an explicit options object, mirroring `/pit-call`/
  `/ai/pit` ergonomics; deterministic for same inputs so responses are cacheable
  server-side by key if desired.)
  - **Request (bounded/validated):** `session_key:int`, `driver_number:int`,
    `from_lap:int?`, `laps_remaining:int?` (default derived, clamped to >=1),
    `pit_loss_s:float?` (clamped sensible range, e.g. 15–40, default derived),
    `scenario:"none"|"sc"|"vsc"?` (default none), `target_compound:str?`.
  - **200 Response:** `StrategyResult` JSON (options, assumptions, coverage,
    inputs_echo, `model:"v3"`, `toy:false` when measurable).
  - **Errors:** 404 unknown session/driver; 422 invalid/bounds; 503/4xx on
    upstream auth/unavailable as today — never 500 on empty data (return
    `measurable:false`).

### 3.1.4 UI/UX (Pit wall evolution)

- Replace "toy model" framing with "Strategy model" only when
  `measurable && assumptions` present; otherwise show "Not enough data to model"
  with reasons and keep numbers hidden.
- Controls: driver (followed/selected), from-lap/laps-remaining slider, pit loss
  (prefilled from measured median with "source: pit stops median / fallback"),
  scenario toggle (none/SC/VSC) — each with a short tooltip.
- Display: ranked options table/cards (total, delta, plan), break-even/undercut
  summary, and an **Assumptions & limits** disclosure listing every assumption,
  excluded-lap counts, and coverage/fit quality. All figures reference
  `inputs_echo`.
- States: loading, no-data/unmeasurable (reason), error (retryable, no stale
  wrong numbers). Responsive and reduced-motion safe.
- "Explain" action calls V3.3 explain with the returned `StrategyResult` bundle
  (no recompute).

### 3.1.5 Files (expected)

- Backend: `strategy.py` (new, pure), `analysis.py` (only shared helpers if
  truly generic), `api/main.py` (endpoint + validation), `data_loader.py` (reuse
  existing getters; no new feeds), `ai.py` (accept strategy fact bundle later,
  V3.3).
- Frontend: `web/src/components/PitPanel.tsx` (rework) or `StrategyPanel.tsx`,
  `web/src/api.ts`/`types.ts` (request/response types), small pure helpers/tests
  for formatting/ranking display if any.
- Tests: `tests/test_strategy.py` (unit/invariants), `tests/test_api.py` (happy +
  degenerate/unmeasurable), `web/src/*.test.ts` for any new pure UI maths/state.

### 3.1.6 Acceptance (testable)

- Deg fit on synthetic clean stints is correct; fuel-proxy shifts pace by the
  documented amount/direction; excluding pit-in/out and >107% slow laps changes
  fit as specified; SC-flagged windows excluded/marked per config.
- Break-even/undercut math consistent with totals; ranked options sorted by
  `total_s`; `delta_to_best_s` coherent.
- Degenerate inputs (no stints, <min laps, missing compound, zero laps
  remaining, unknown driver) → 422 or `measurable:false` with reasons, never 500,
  never fabricated totals.
- API response round-trips all numbers shown; UI renders assumptions and "—"
  where `null`.
- `ruff`, `pytest`, `npm test`, `npm run build` green.

## 4. V3.2 — Telemetry Lab 2.0 (shipped, same-clock scope)

### 4.1 Goal
Generalise duel/inputs into a comparison workspace: N followed/selected drivers
over a chosen window, aligned on a shared distance axis, with speed, throttle,
brake, gear, DRS traces, hover readout across drivers, and corner/sector delta
markers where geometry allows.

### 4.2 Data & alignment

- **Inputs:** cached `car_data` (speed/throttle/brake/n_gear/drs), `location`
  (x,y for distance), `laps` (lap windows/durations/sectors/speed traps),
  session geometry/corners (existing).
- **Shipped scope:** the Lab compares drivers on the **same clock** (`axis:"time"`)
  over the current lap window; the distance-aligned lap comparison remains
  `/session/duel`, where each lap has its own distance axis. The distance mode
  below stays the target for a later pass.
- **Alignment (pure helpers, synthesis C):** two explicit modes, never mixed.
  `axis:"distance"` requires a **lap window** (a reference driver+lap); every
  driver is resampled to progress `f` in [0,1] along that lap's distance using
  `lap_progress`/duel logic. `axis:"time"` requires `t0/t1` and aligns on the
  session clock; `f` is then relative time (`t - t0`) and the UI labels it as
  time, not distance. Distance + a time window is a 422.
  Downsample to `points` (300–1200) preserving peaks. Channels missing for a
  driver/season → `null` arrays/segments, never inferred.
- **Fetch discipline:** lap-window queries only (`date>=`/`date<` per driver+lap),
  one per driver per lap, up to 5 drivers; never whole-session `car_data`.
  Responses cached by `(session, drivers, window, axis, points)`. Two drivers /
  two laps is ~4 requests cold, 0 warm, which fits the 30 req/min budget.
- **Corner deltas:** compute per-corner (from geometry) time/speed delta between
  a reference and comparison driver(s) when both have coverage; `null` when not
  computable.

### 4.3 API contract

- `POST /session/telemetry` (chosen for multi-driver payload clarity)
  - **Request:** `session_key:int`, `drivers:int[]` (1..5),
    `window:{kind:"lap",driver,lap} | {kind:"time",t0,t1}`,
    `axis:"distance"|"time"` (must match: distance⇔lap, time⇔t0/t1),
    `ref_driver:int?`, `points:int?` (clamped 300–1200).
  - **200 Response:** `{ axis:"distance"|"time", f:number[], series:[{driver_number,
    speed:(number|null)[], throttle:(number|null)[], brake:(number|null)[],
    gear:(number|null)[], drs:(number|null)[], t?:(number|null)[] }],
    corners:[{id,label,f_start,f_end, deltas:[{driver_number, dt_s:number|null}]}],
    coverage:{...}, window:{...} }`. Empty/invalid window → 404/422 with message.
- Existing `/session/inputs` and `/session/duel` remain; may be refactored to
  share helpers but keep response compatibility.

### 4.4 UI/UX

- `TelemetryLab` panel/view (tab or promoted compare view) building on
  `InputsStrip`/`DuelPanel` primitives: driver chips (colours consistent),
  reference selector, shared x-axis (distance), stacked/synced traces, unified
  hover readout (all drivers at cursor), corner markers/delta labels.
- Window selection: pick lap (per driver or ref lap aligned) and/or time window
  consistent with replay clock; clear "aligned by distance" note.
- States: loading skeleton, per-driver "no data" chip/trace gap, DRS "—",
  reduced-motion (no animated draw-in, values still update).

### 4.5 Files & acceptance

- Backend: pure align/downsample/delta helpers (new `telemetry.py` or in
  `analysis.py`), `api/main.py` endpoint, reuse `data_loader` windows.
- Frontend: `web/src/components/TelemetryLab.tsx` (or evolve Inputs/Duel),
  `api.ts/types.ts`, canvas/chart helpers reused.
- Acceptance: distance alignment/delta match duel invariants on identical
  laps; downsample preserves bounds (min/max within window or documented);
  `null` never coerced to 0; perf independent of replay rAF; 390 px responsive.

## 5. V3.3 — AI race engineer 2.0 (shipped, on-demand)

### 5.1 Goal
Explain key moments, strategy outcomes, and comparisons by narrating **computed
fact bundles** (session + V3.1 `StrategyResult` + V3.2 trace/corner deltas).
The model never recalculates or invents numbers.

### 5.2 Fact bundles & interface (synthesis C)

- Pure builders (no I/O, no model): `strategy_facts(result)->FactBundle`,
  `compare_facts(telemetry_result)->FactBundle`, `moment_facts(session_key,
  t_or_lap, cached_frames)->FactBundle` reusing `_ai_facts` patterns — each
  returns `{kind, claims:[{id,label,value,unit,source}], text_summary, limits[]}`
  with strict size bounds.
- `ai.py`: add `explain(session_key, kind, question?)`; the endpoint resolves
  `kind`/`subject` to a **server-built** fact bundle (reusing `_ai_facts` and
  the V3.1/V3.2 result builders). No client-supplied facts, blobs or refs.
  System prompt: "use only FACTS; cite values; if absent say so; refuse
  out-of-scope/unanswerable" (extend current `SYSTEM`/`OUT_OF_SCOPE`).
  Bundles may be cached server-side by `(session, kind, subject hash)`.
- API: `POST /ai/explain` `{session_key, kind, subject}` → 200
  `{answer, grounded_on, limits}`; 503 unconfigured, 502 upstream, 422 invalid.
  Keep `/ai/chat`, `/ai/recap`, `/ai/pit` working.
- Bundle schema (bounded, all fields computed server-side):
  `{kind, claims:[{id,label,value,unit,source}], text_summary, limits[]}`.
  `strategy` claims: totals per option, delta, break-even, pit-loss source,
  coverage; `compare`: drivers, lap times, sector/corner deltas, DRS state;
  `moment`: clock/lap, event, gap, selected drivers. A test asserts every
  number the answer uses appears in `claims` or `text_summary`.

### 5.3 UI & acceptance

- "Explain this strategy/compare/moment" affordances in Pit/Telemetry/Replay
  contexts pass the already-computed bundle; recap/chat unchanged.
- Tests: fixture bundles → prompt/grounding contains only bundle values; missing
  fields trigger honest "cannot see"; off-topic sentinel preserved; token/size
  caps enforced; no key in client.

## 6. V3.4b — Weather impact & race-control timeline (committed)

- **Data:** cached `weather`, `race_control`, `laps`/stints. No prediction.
- **Compute (pure):** align events to session/lap time; derive descriptive
  summaries (e.g. rain/SC/VSC windows vs pace change/lap-time bands, stint
  boundaries) with explicit "correlation, not causation" labelling.
- **UI:** timeline/panel integrated with Performance (or its own subview):
  weather series + RC markers over session clock/laps, hover details, counts.
- **API:** extend existing `/weather`/`/race-control` payloads or add
  `/session/timeline` aggregating cached feeds; no new upstream calls.
- **Acceptance:** renders when feeds exist; empty/partial feeds → "—"/reason;
  no predictive language.

## 7. V3.4d — Director layouts & PWA/offline (committed)

- **Layouts:** preset panel arrangements (e.g. Replay+Telemetry, Strategy focus,
  Data) stored in local state (and URL/hash where sensible), toggleable without
  reload; no layout breaks core flows.
- **PWA:** web manifest + icons (brand mark exists) + service worker (Vite
  plugin or workbox) caching app shell and **versioned static assets**. Runtime:
  cache the **current session's replay/geometry/laps/gaps** payloads only
  (explicit "make available offline" or cache-on-view), capped at **25 MB per
  session**; if a payload exceeds it, say "too large for offline" instead of
  failing silently. Uncached sessions show "not available offline — open once
  online". Cache keys include app build and data version; a deploy invalidates
  them. Offline mode disables AI/chat and any uncached fetch with a clear
  message; no secrets or `.env` values are ever cached.
- **Acceptance:** installable; offline cached session loads map/tower/known
  panels; uncached shows clear state; no secrets cached; Lighthouse/PWA basics
  sane.

## 8. V3.4e — Data export (shipped) (committed)

- **Scope:** export what is shown/loaded for the current session/selection:
  laps, stints, pit stops, results, and (when loaded) telemetry/trace windows,
  strategy result — as CSV and/or JSON.
- **Implementation:** client-side generation from in-memory/cached responses
  (preferred) with bounded size and a clear filename (`boxbox-<meeting>-<session>-<what>.csv`).
  Include units/headers and an assumptions note for strategy exports.
- **Licence/terms:** non-commercial personal use; attribute source in export
  metadata note; do not redistribute bulk dumps.
- **Acceptance:** downloaded file matches on-screen data for fixtures; no secrets;
  large exports bounded or chunked with notice.

## 9. Conditional gated sub-milestones

### 9.1 V3.4a — Quali/practice mini-sectors (conditional)
- Use `laps.segments_sector_*` only when values are meaningful. Detection:
  session must be qualifying/practice **and** the values must not be ≥95% one
  value (e.g. 2048) or missing; otherwise mark "segment data not available for
  this session" with the measured reason. Races are always off.
- UI: segment strip/colouring in quali/practice views; races show "segment data
  not available for race sessions" (or the measured reason). No fabrication.
- Tests: placeholder detection, quali/practice happy path fixture, race
  degradation.

### 9.2 V3.4c — Pit crew & overtake analytics (conditional)
- `pit`: stationary `stop_duration` distribution, best/median, outliers; lane vs
  stationary only if both fields meaningful else "—". Filter artifacts (e.g.
  red-flag lane times) as today.
- `overtakes`: event list/zones/counts by lap/time where present; mark
  "incomplete feed" when sparse/missing. **No** historical battle scan.
- Acceptance: honest on gaps; empty feeds render explained empty state.

## 10. Execution order, commits, and definition of done

1. **V3.0 (gate, docs/state only): DONE** — D1–D6 recorded and the core plan
   reviewed. Commit: `docs(v3): lock V3.0 decisions and review the core plan`.
2. **V3.1 backend:** `strategy.py` + tests + `/session/strategy` + compat.
   Commit: `feat(v3): strategy engine core (model + api)`.
3. **V3.1 frontend:** Pit/Strategy panel, assumptions/uncertainty UI, wiring.
   Commit: `feat(v3): strategy panel and explain wiring`.
4. **V3.2 backend:** align/downsample/delta + `/session/telemetry`. Commit:
   `feat(v3): telemetry lab alignment api`.
5. **V3.2 frontend:** TelemetryLab view + compare UX. Commit:
   `feat(v3): telemetry lab view`.
6. **V3.3:** fact builders + `/ai/explain`/chat integration + UI actions.
   Commit: `feat(v3): grounded explain over strategy and telemetry facts`.
7. **V3.4b:** weather/RC timeline compute + UI. Commit:
   `feat(v3): weather and race-control timeline`.
8. **V3.4a/c (gated):** mini-sectors and pit/overtake analytics when data-valid.
   Commits per sub-feature.
9. **V3.4e:** export. Commit: `feat(v3): session data export`.
10. **V3.4d:** layouts + PWA/offline cached sessions. Commit:
    `feat(v3): layouts and offline cached sessions`.
11. **Docs & wrap:** README/ARCHITECTURE/DEPLOYMENT/TESTING + state files
    updated together; verify (`pytest`, `ruff`, `npm test`, `npm run build`).

**Per-milestone DoD:** scope done per acceptance above, tests added/passing, no
regressions, lint/type/build clean, security/licence/honesty rules met, docs and
`.claude/state/*` updated in the same step, one commit.

## 11. Risks and mitigations (core)

| Risk | Mitigation |
|---|---|
| 30 req/min cold-open floor | No new required feeds; rely on cache/single-flight; prewarm demo sessions (D6). |
| Model treated as truth | Assumptions/coverage/uncertainty returned and displayed; "—" when unmeasurable; AI narrates only computed outputs. |
| Missing/variant feed fields (DRS nulls, stop_duration gaps, segments) | Feature-detect, `null`/reason paths, gated rendering (V3.4a/c). |
| 3D/MultiViewer/Jolpica uncertainty | Kept out of core; optional/fallback/gated only. |
| Upstream terms/availability changes | Free-historical design, honest degradation, adapters isolated; revisit if a source changes. |

## 12. Verification checklist (before declaring v3 core done)

- [ ] V3.0 decisions recorded in `DECISIONS_LOG.md`.
- [ ] V3.1–V3.3, V3.4b,d,e implemented per acceptance; V3.4a/c behave correctly
      on data-valid and data-missing sessions.
- [ ] All shown numbers trace to response fields; assumptions visible; no
      fabricated values/states.
- [ ] 3 req/s + 30 req/min respected; no new unbounded fetch paths; offline only
      for cached sessions.
- [ ] `pytest`, `ruff check .`, `cd web && npm test`, `npm run build` green.
- [ ] Security: no secrets exposed, inputs validated/bounded, no shell/path
      injection, PWA/export safe.
- [ ] Docs/state current (README, ARCHITECTURE, DEPLOYMENT, TESTING, plan, queue,
      status, history, decisions).
