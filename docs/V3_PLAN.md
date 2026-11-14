# BoxBox Replay — v3 implementation plan

Companion to `docs/V3_RESEARCH.md` (sources, limits, rationale). This file is
the execution plan: order, contracts, files, acceptance criteria.

Rules for every milestone: one commit per milestone (or per backend/frontend
half), tests and lint green before the commit, state files updated in the same
step. No fabricated numbers; when data is missing the UI says so.

## Status

**Status (2026-11-14):** planning complete and **V3.0 gate closed** — D1–D6 are
recorded in `.claude/state/DECISIONS_LOG.md`. **Implementation-ready end-to-end
design for the committed core** lives in
`docs/V3_CORE_IMPLEMENTATION_PLAN.md` (V3.1, V3.2, V3.3, V3.4b, V3.4d, V3.4e +
gated V3.4a/c, with interface alternatives/synthesis, contracts, acceptance).
v2 shipped through `v2.13.1`; **V3.1 shipped** (strategy engine) and **V3.2
shipped** (same-clock Telemetry Lab; distance alignment remains Lap duel). V3.3
is next.

## Recommended headline (why these three)

BoxBox v2 can *show* and *answer* a historical session. v3 should let a user
*simulate and explain* it with numbers they can audit, without breaking the
app's core promises (free, historical, non-commercial, OpenF1-first, honest
degradation). The headline is therefore:

1. **Strategy engine v3** — replaces the pit toy with a transparent model.
2. **Telemetry Lab 2.0** — turns duel/inputs into a general comparison lab.
3. **AI race engineer 2.0** — explains computed moments, never invents them.

These are directly related to shipped v2 surfaces (pit wall, duel, inputs,
Ask) and to data already cached (laps, stints, pit, car_data, location,
weather, race_control, intervals/positions). They do not require paid/live
feeds.

## Order and why

| Step | Milestone | Depends on | Why |
|---|---|---|---|
| V3.0 | Scope lock & decisions | — | Resolve licence/headline/geometry/AI-mode questions before code |
| V3.1 | Strategy engine core | V3.0 | The v3 claim: "earns the word model"; replaces pit toy |
| V3.2 | Telemetry Lab 2.0 | V3.0 | Reuses car_data/lap windows; extends duel/inputs |
| V3.3 | AI race engineer 2.0 | V3.1, V3.2 | Narrates computed facts (strategy moments, trace insights) |
| V3.4 | Supporting analytics & UX | V3.0 (parts after V3.1/2 as noted) | Bounded value: mini-sectors, weather/RC, pit/overtake, layouts/PWA/export |
| V3.5 | Stretch (go/no-go) | V3.1–V3.3 | 3D/WebGL replay and/or Jolpica 1950+ era view, each separately gated |

Supporting items in V3.4 can be sequenced independently after V3.0 except
where they consume V3.1/V3.2 outputs; each ships as its own commit.

---

## V3.0 — Scope lock & decisions

**Goal.** Turn `docs/V3_RESEARCH.md` into committed choices so implementation
has no ambiguous assumptions.

**Decisions recorded (2026-11-14, `DECISIONS_LOG.md`)** — the gate is closed:

| Decision | Options | Default recommendation | Notes |
|---|---|---|---|
| Headline priority | Strategy+Telemetry+AI first vs 3D equally important | Strategy+Telemetry+AI first | 3D is visual but high effort/risk; model depth is the product gap |
| Jolpica era view | Accept CC BY-NC-SA archive view (1950+, no telemetry) vs keep 2023+ only | Keep 2023+ for replay; allow a separate archive view only if licence posture is accepted | No replay pre-2023; must isolate adapter, attribute, non-commercial, no dump redistribution |
| Live timing | Paid OpenF1 sponsor (€9.90/mo) demo vs strictly historical/free | Strictly historical/free | Portfolio must work on demand; paid path optional later |
| Track geometry | Best-effort MultiViewer `circuit_info_url` vs GPS-derived/MIT `f1-circuits` only | GPS-derived default + optional best-effort overlay with graceful fallback | MultiViewer endpoint terms/availability not guaranteed |
| AI narration | Proactive key-moment narration vs on-demand only (chat/recap/explain) | On-demand by default; proactive behind explicit opt-in if built | Controls cost and hallucination surface |
| Demo prewarm set | Which sessions to prewarm | 2026 United States GP, 2024 Suzuka, 2024 Monaco | Scriptable; ops only |

**Acceptance (met).**
- Each decision logged with rationale, alternatives rejected, and security/licence implications.
- `TASK_QUEUE.md` V3 items updated to reflect go/no-go outcomes.
- No feature code merged as part of V3.0.

---

## V3.1 — Strategy engine core (shipped)

**Problem.** The current pit wall is explicitly a toy: linear wear, static
rivals, user-chosen pit loss. v3 must make it a defensible, auditable model.

**Data (OpenF1, already cached/fetchable):** `laps` (durations, sectors, pit
flags), `stints` (compound, lap ranges, tyre age), `pit` (lane/stop duration),
`weather`, `race_control` (SC/VSC/flags), `intervals`/`position` where useful.

**Design (pure functions first, UI second).**

- New pure module (e.g. `strategy.py` or extend `analysis.py`) with:
  - **Lap filtering:** exclude pit-in/out laps and laps slower than a
    configurable threshold (e.g. 107% of stint median) for pace/deg fits;
    flag safety-car/slow-lap periods from `race_control`/pace anomalies.
  - **Pace baseline:** per-stint clean-lap pace (median/robust mean) and
    compound-aware degradation slope; optional fuel-burn proxy by lap index,
    **off by default** (documented assumption when enabled) so "fuel-adjusted"
    pace is explicit, never invented.
  - **Strategy simulation:** simulate stay-vs-pit and ranked alternatives over
    remaining laps given pit loss, traffic penalty model (transparent), compound
    choices from stints, and optional SC/VSC adjustment scenarios.
  - **Outputs:** predicted totals, delta, break-even pit loss, undercut window
    estimate, ranked options, and for every output the inputs/assumptions used.
- API: evolve `/pit-call` or add `/session/strategy` returning the model
  outputs + assumption block (backward-compatible where possible).
- UI: replace/extend the pit wall to show ranked scenarios, inputs, wear/fuel
  assumptions, uncertainty/limits, and "what changes the answer". Keep the
  "toy" label removed only when the model meets acceptance; until then label
  clearly.
- AI: `/ai/pit` (or strategy explainer) narrates the computed result only;
  must not recalculate or invent numbers.

**Acceptance.**
- Pure-math unit tests: deg fit on synthetic stints, fuel-proxy effect, pit
  delta algebra, break-even/undercut invariants, SC/slow-lap filtering, missing
  stint/compound handling.
- API tests: happy path + degenerate/empty data return 4xx with a printable
  message, not 500.
- Every displayed number traces to an input or computed field in the response.
- Assumptions and uncertainty/limits are visible in the UI.
- DRS nulls, missing `stop_duration`, and incomplete intervals degrade to "—"
  or are excluded with explanation.

**Security.** No user input reaches shell/paths; request params validated and
bounded; no secrets; rate-limiter/cache behaviour unchanged.

---

## V3.2 — Telemetry Lab 2.0 (shipped, same-clock scope)

**Goal.** Generalise lap duel + inputs into a comparison workspace: any
supported drivers/laps on shared distance, with throttle/brake/gear/speed/DRS
traces and corner deltas.

**Data:** OpenF1 `car_data`, `location`, `laps` (sectors, speed traps),
session geometry.

**Design.**
- Backend: reusable window/trace endpoint(s) for multi-driver aligned samples
  (distance-normalised like duel, or session-time window where appropriate);
  downsample for UI, preserve peaks; return `null` channels honestly.
- Frontend: `TelemetryLab` view/panel building on existing duel/inputs/chart
  primitives; multi-driver selection, shared distance axis, hover readout for
  all traces at pointer, corner markers/deltas where geometry allows.
- Reduced-motion: traces update with clock; no gratuitous animation.

**Acceptance.**
- Alignment: trace distance/delta consistent with duel invariants on same laps.
- `null` DRS and missing channels render "—", never inferred.
- Performance: no work on the global replay rAF when hidden; trace rendering
  scoped to its own clock/view.
- Tests: alignment/delta maths, downsampling bounds, empty/missing-channel
  cases; UI smoke at desktop and 390 px widths.

**Depends on:** V3.0. Feeds V3.3 (trace-derived moments).

---

## V3.3 — AI race engineer 2.0

**Goal.** Move from on-demand Q&A/recap to grounded explanations of key
moments and strategy "why", citing computed facts.

**Data:** session facts (existing `_ai_facts`), V3.1 strategy outputs, V3.2
trace/compare outputs, race_control/weather events — all computed/cached.

**Design.**
- Extend `ai.py` facts/prompts to include strategy-engine and telemetry-lab
  outputs (numbers only, never recomputed by the model).
- Add "explain this moment/strategy/compare" actions that pass a bounded,
  structured fact bundle; keep chat/recap behaviour.
- Proactive narration only if V3.0 opts in; default remains on-demand to control
  cost and hallucination surface.
- Maintain: server-side key, budget (`AI_RATE_PER_MIN`), caching where
  deterministic, session-aware prompts, refusal/sentinel for off-topic or
  unanswerable questions.

**Acceptance.**
- Every claim in a strategy/trace explanation maps to a field in the provided
  fact bundle (tested with fixed fixtures).
- Off-topic/unanswerable behaviour unchanged or stricter.
- No secrets exposed; prompt/response sizes bounded; reasoning-token cap still
  sufficient (no mid-sentence truncation on representative prompts).

**Depends on:** V3.1, V3.2 (for their fact bundles); V3.0 (narration mode).

---

## V3.4 — Supporting analytics & UX (bounded)

Ship as independent sub-milestones; each has its own tests and commit.

| Sub | Task | Data | Acceptance (summary) | Depends |
|---|---|---|---|---|
| V3.4a | Quali/practice mini-sectors & sector analysis (revisit V2-7) | `laps.segments_sector_*` in quali/practice; `laps` sectors/speeds | Segment strips shown when data is meaningful; placeholder/missing segments degrade honestly with reason; race sessions unaffected | V3.0 |
| V3.4b | Weather impact & race-control timeline polish | `weather`, `race_control`, laps | Descriptive correlation/timeline (rain/SC/VSC/flags vs pace/stints); no predictive claims | V3.0 |
| V3.4c | Pit crew & overtake analytics | `pit`, `overtakes` | Stationary vs lane (or "—"), stop distribution/outliers; overtake events/zones with incompleteness noted | V3.0 |
| V3.4d | Director layouts & PWA/offline (cached sessions) | client state/cache | Preset layouts; installable PWA; cached sessions replay offline (≤25 MB/session) with clear "not cached" state otherwise | V3.0 |
| V3.4e | Data export | session/lap/stint/trace data | CSV/JSON export of shown data; no licence breach; no secrets | V3.0 |

**Notes.** V3.4a is feasible because OpenF1 segments can be meaningful outside
races (and the app is session-aware); it must never fabricate or mislabel race
segments. V3.4c must not revive the rejected historical fight scan.

---

## V3.5 — Stretch, each behind go/no-go

| Sub | Task | Gate | Key risks |
|---|---|---|---|
| V3.5a | 3D/WebGL replay (GPS-derived/procedural, camera modes) | Perf budget met on desktop + mobile; 2D fallback kept | Complexity, jank/battery, maintenance |
| V3.5b | Jolpica 1950+ archive view (results/standings/laps/pit stops, head-to-head) | Licence posture accepted (CC BY-NC-SA, attribution, non-commercial, no dump redistribution) and UX kept separate from 2023+ replay | Share-alike/licence mixing, no telemetry pre-2023, scope creep |
| V3.5c | Championship progression (OpenF1 beta / Jolpica adapter) | Adapter isolated; data freshness/beta stability acceptable | Beta endpoint changes, licence if Jolpica |

None of V3.5 is required for the v3 headline.

---

## Cross-cutting

- **Tests:** every new pure function/model gets invariants; every endpoint gets
  happy path + empty/degenerate case; UI maths/state changes get vitest; no
  sleeps added to the suite.
- **Docs:** update `README.md`, `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md` as
  features land; keep `.claude/state/*` and this plan in sync in the same step.
- **Perf:** no new work on the global replay rAF loop; heavy views run on their
  own clocks and pause when hidden.
- **Security/licensing:** no new secrets; `.env.example` documents any new vars;
  no user input to shell/paths; Jolpica/MultiViewer usage follows recorded
  decisions and attribution; app remains non-commercial.
- **Honesty:** estimates labelled, assumptions shown, missing data rendered as
  "—" or explained — never fabricated.

## Out of scope for v3 (unless a paid/licensed decision changes it)

- Live timing / live replay (OpenF1 sponsor or F1TV/licensed feeds).
- FastF1 as a runtime data source (F1TV auth required for most features).
- Team radio transcription or guaranteed audio availability.
- Historical Fight Finder scan (rejected: noisy/sparse feeds).
- Fantasy/prediction product and unrelated gamification.
