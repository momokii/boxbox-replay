# .claude/state/HISTORY.md — Append-Only Session Log

> Newest entries at the bottom. One paragraph per session plus key outcomes.

## 2026-10-28 — Infrastructure bootstrap

Bootstrapped the universal, security-first `.claude/` agent infrastructure on a
blank repository: root `CLAUDE.md` entry point, shared `settings.json` permission
baseline, core docs (rules, coding/security standards, environment guide, resume
protocol), three slash commands, state files, and four task templates. Seeded
TASK-001 (project foundation) and TASK-002 (security guardrails) as the first
conditional tasks. Key outcomes: 5 commits on `main`; verification passed
(imports plain-text, JSON valid, no secrets); stack remains undefined until the
first real task.

## 2026-10-28 — M0 env + fetch proof (6ebe3c0)

Scaffolded the F1 app per brief v2: `data_loader.py` (throttled 3 req/s, retried,
parquet-cached OpenF1 fetch), `app.py` shell, `analysis`/`viz`/`coach` stubs,
pinned requirements (pandas 3.1.0, streamlit 1.66.1, httpx 0.28.1, pytest 9.2.0,
ruff 0.17.3), plus Docker deployment (`Dockerfile` non-root + healthcheck,
`compose.yaml`/`override`/`prod`, `scripts/setup.sh`). Verified: 7 tests pass,
ruff clean, real counts 2023:118/2024:123/2025:123/2026:131, Suzuka 2024 quali
223 rows (fastest VER 1:28.197), container boots healthy and shuts down clean,
prod config renders. Two test/line-length bugs found and fixed before commit.

## 2026-10-28 — M1 chooser + picker + lap table

Year -> GP -> session -> drivers (max 3) -> lap table with click-to-load into
`session_state.selected_lap`; telemetry-empty sessions hidden with reason shown
(single-driver `car_data` probe, cached). Dark Pit-Wall base via
`.streamlit/config.toml`. Verified: 12 tests pass, ruff clean, container boots
healthy with the new UI and no log errors.

## 2026-10-28 — M2 battle overlay + gap chart

`analysis.best_lap`/`lap_deltas` live (0.05s noise flag), `viz.speed_trace` +
`viz.gap_chart` (Pit-Wall theme, amber playhead), battle section compares the
loaded lap vs a challenger lap with signed delta. Verified: 19 tests pass,
ruff clean, healthy boot, no log errors.

## 2026-10-28 — M3 synced track-map animation

Replay window from the loaded/best lap: animated dots (team color, white
stroke) with 5s trails, auto-detected corners (heading-change peaks, T1..Tn),
timing tower with live gaps, Play/Pause + 1x/2x/4x + scrub + Space shortcut,
hover shows speed/gear/throttle, synced amber playhead on the speed strip,
RACE ENGINEER placeholder card. Verified: 24 tests pass, ruff clean,
healthy boot, no log errors.

## 2026-10-28 — M4 coach on corner click

`analysis.corner_losses` (±200 m apex windows, NaN when empty), `coach.py`
(grounded prompt, `opencode run` backend verified live, [HIGH/MED/LOW],
radio-transcript card, LLM answers cached per corner+lap). Corner click on the
map (plus selectbox fallback) fires the coach for challenger-vs-reference.
Verified: 32 tests pass, ruff clean, healthy boot, no log errors.

## 2026-10-28 — M5 performance mode

`analysis.tyre_slope` (least squares s/lap), `viz.stint_timeline` (compound
color blocks), weather metrics, team-radio events with audio links (no
transcripts exist in the API — none invented), race-control flags, all scoped
to the replay window. Verified: 34 tests pass, ruff clean, healthy boot.

## 2026-10-28 — M6 what-if pit toy model

`analysis.pit_toy_model` (stay vs pit on linear deg, traffic flag, always
labeled toy) with pit-wall UI (laps remaining, pit-loss slider, grounded in
live pace/deg/gaps). Caught live: API dropped `meeting_name` from /sessions
(fixed via /meetings join + stale-cache refresh) and `+1 LAP` gap strings
(coerced to NaN). §8 acceptance on Suzuka 2024 Race: 908 laps, 20 drivers,
41k telemetry rows, full feeds. Verified: 37 tests pass, ruff clean, healthy
boot, prod config renders.

## 2026-10-29 — M7 polish + hardening via smoke test

F1 purple/green sector styling in the lap table, data-derived DRS zones
(bit-4 of `drs`, amber ticks), mobile CSS, reduce-motion toggle, `width` API
migration. New `scripts/smoke_app.py` (AppTest) executes the whole script on
a sparse 2026 session AND Suzuka 2024 Race — and caught 5 real bugs: mixed-ISO
timestamps, 404-as-empty, non-default-index downsampling, empty-frame columns,
string dates in intervals. All fixed + regression-tested. 41 tests, ruff clean.

## 2026-10-29 — TASK-002 security guardrails

`.pre-commit-config.yaml` (hooks, whitespace, ruff, gitleaks) and
`.github/workflows/ci.yml` (pytest, ruff, gitleaks, pip-audit, advisory Trivy).
Verified: pip-audit clean, gitleaks 15 commits no leaks, pins intact,
SECURITY_STANDARDS §12 marked implemented.

## 2026-10-29 — Full sweep clean + prod deploy + docs

Verification (ruff, 41 tests, both smoke paths, gitleaks): zero new bugs.
Deployed prod stack (`boxbox-replay:stable`, healthy), reachable at
`http://<host>:8501` via localhost AND Tailnet IP. Wrote root
`README.md` + `docs/DEPLOYMENT.md` (dev/prod ops, Tailnet access).

## 2026-10-29 — R0 revamp backend + shell

FastAPI wrap over the proven modules (feeds, geometry, corner-loss, coach-ask;
7 API tests), React+Vite+TS shell (pickers, session gating, lap table with
sector colors; 7 vitest), compose split into api+web (nginx proxy, prod pins),
dev runs as host UID for the bind mount. Verified: 48 pytest, npm build+lint,
both services healthy, proxy + geometry + car window live.

## 2026-10-29 — R1 all-driver canvas replay

Full-field replay: canvas map (dots, trails, corners, DRS zones, hover
telemetry), timing tower with live gaps + highlight toggles, Play/Pause +
1x/2x/4x + scrub + Space, reduce-motion, synced canvas speed strip. No driver
cap — highlight is optional. Verified: 14 vitest, tsc build, rAF playback
store, live geometry/lap-window endpoints, both services healthy via proxy.

## 2026-10-29 — R2 feature panels

Battle (head-to-head overlay + signed delta), Performance (deg slopes, stint
timeline, weather, radio audio links, race control), Pit toy (server-side model,
traffic check, bannered toy), tabbed as secondary views; GapChart restored in
replay. Hardened records() JSON: NaN->None (map dtype-inference trap),
ndarray cells, strict-dumps regression tests. All 6 race feeds verified live
through the nginx proxy. 49 pytest + 17 vitest green, tsc build clean.

## 2026-10-29 — R3 coach on-trigger

Engineer column: corner click -> explicit "Ask engineer" button -> measured
corner loss -> async LLM answer with [confidence] + basis, cached per key,
numbers-only fallback when the LLM is unreachable. Verified live: T1 loss
+0.280s flagged MED on Suzuka 2024 Race; coach/ask fallback path in container.

## 2026-10-29 — R4 polish + cutover + Tailnet deploy

Removed the Streamlit path (app.py, viz.py, streamlit/plotly pins, AppTest
smoke, .streamlit/); rewrote README + DEPLOYMENT for api+web. Secrets clean
with a documented .gitleaks.toml allowlist (sector field false positive).
Deployed prod stack (api+web healthy), reachable via localhost AND Tailnet
http://<host>:8501. Verified: 44 pytest, 17 vitest, tsc build, ruff.

## 2026-10-29 — U1 minimalist UI overhaul (screenshot-driven)

Set up Playwright screenshots + interaction harness (scripts/viz_review.py)
and saw the real problems: dead Play button (dur 0), ghost-synced dots,
spaghetti gap chart, void states. Fixed: staged loading (window -> geometry ->
progressive locations -> background cars), one-line player bar, true
session-time positions, gap chart scoped to top-5, 107%-rule cleaned slopes
scoped to highlighted drivers, corner chips + deep-linkable URLs (?year=&
meeting=&session=), proper empty/loading states, compact tower, styled range
input. Verified each state with screenshots (replay playing, battle, panels,
coach ask with fallback) — zero page errors. 46 pytest + 18 vitest, tsc, ruff.
Deployed prod, reachable via Tailnet.

## 2026-10-29 — U2 skill-driven redesign, verified with screenshots

Installed anthropics/frontend-design (1M installs, official) and applied its
process: subject-grounded plan in docs/UI_REDESIGN.md (the wall: one hero, one
accent, Barlow Condensed + Barlow, fused broadcast-style player bar, order-is-
position tower, chips instead of multiselect, plain sentence-case copy).
Removed generic tells (ALL-CAPS eyebrows, meta dot strings, accent-word
headline, inline-style components). Fixed real bugs found on screenshots:
battle defaulted to same driver, perf panel showed all 20 drivers of junk
slopes, open-ended stints rendered wrong, empty SpeedStrip state. Verified per
state with Playwright screenshots (replay playing with true positions, battle,
panels, coach ask with fallback, mobile stacking) — zero page errors.

## 2026-10-29 — U2 continued: hero-first autopick

First paint used to land on empty pickers (or worse, a telemetry-less
session). Now the app hunts newest-first for a session with real telemetry
(Race preferred, bounded to 8 meetings, deep links still win) and opens
straight into the replay. Tabs went quiet text (amber = play only), tower
codes set in condensed type, engineer shows session facts when idle.
Verified: autopick lands US GP 2026 Race with live gaps in ~15s, no errors.

## 2026-10-29 — U3 session-scale replay + day/night

Reworked the data model: whole-session replay (lights out → chequered flag),
clamped telemetry (OpenF1 leaks pre/post-session rows), robust lap clock
(drops red-flag laps, monotonic, sequential index), gaps from intervals with
lap-time fallback + visible source label, per-lap speed telemetry for chosen
drivers, day/night tokens, sticky header with session clock. New API endpoints
/session/{info,geometry,replay,speed,gaps} with tests for lap markers and gap
derivation. Verified night+day+2026+mobile screenshots, zero page errors.

## 2026-10-29 — U4 context pass (loading, corners, driver card, battle)

Fixed: unbounded lap windows (a lap measured 57 km, polluting outlines/DRS/
corners), stale data shown while switching sessions, player bar covering the
track. Corner detection rewritten on arc-length-resampled paths in lap
fractions (Suzuka 18, COTA 22). Added loading cards with session context,
driver cards (full name/team/tyre age/last-best lap + acronym explainer),
richer map hover, performance/pit/battle context labels, jargon tooltips,
proportional select arrows, session UTC window in facts. 50 pytest + 27 vitest.

## 2026-10-29 — U5 orientation + panel clarity

Fixed Monaco-style misalignment: canvas y flip (map was mirrored) and a plane
mismatch (geometry picked (y,x) by variance while cars used (x,y)); plane is
now fixed, and the map rotates to a horizontal start straight, applied
consistently to cars/corners/DRS. Player bar measured non-overlapping. Pit wall
rewritten around its question with assumptions + provenance. Weather is now a
whole-session chart; degradation "whole field" lists everything; radio/RC show
all events with counts and click-to-seek; per-driver telemetry loading states.
50 pytest, 27 vitest, verified on Monaco with numeric alignment checks.

## 2026-10-30 — U6 session availability + brand mark

Fixed "no replay data" for Monaco 2026: transient feed errors no longer read as
missing data (retry button forces a rebuild), a single driver's location
failure can't sink the build (per-driver isolation + drivers_included/expected),
and geometry chooses the fastest lap that actually has positions. Race length
now comes from the lap clock, never from position coverage; positions_end_s
drives a shaded timeline region and an explanatory sentence. Dropped x=y=0
placeholders. New brand mark (timing bars) replaces the Vite default across
favicon.svg, 32/180/192/512 PNGs, maskable icon, web manifest and the header.
Verified: Monaco 2026 renders (22/22 drivers, 1:30:50, position coverage note),
Monaco/Suzuka 2024 unaffected, 50 pytest + 27 vitest.

## 2026-10-30 — U7 replay playback fixed at the root

Root cause of "Play advances the clock but the circuit does nothing": the
geometry endpoint crashed (KeyError x) because rotate_points only handled
{x,y} and DRS zones are {x0,y0,x1,y1} — a 500 meant the whole map block, speed
panel included, never rendered. Rotation handles both shapes (regression
tested), loading no longer depends on geometry, and a geometry failure now
explains itself while everything else keeps working. Speed panel follows a
stable leader by default (named in the heading). Verified with canvas pixel
hashing: map animates every tick, speed draws, session switch resets to 0:00,
reload keeps the deep link. 51 pytest + 27 vitest.

## 2026-10-30 — U8 persistent-cache and trail fixes

Empty replay builds were cached, so one transient failure made a session
permanently "no data" across reloads: empty results are never cached now, the
cache is versioned (session_pos_v2_*), files are revalidated on read, refresh
clears variants, and the client auto-retries once. The trail gap guard existed
only in the helper — the component still called the unguarded version and drew
trails for all 22 cars; trails are now limited to followed drivers, stop at
gaps, and posAt holds position across a jump (unit-tested). Session facts count
drivers from the entry list. Verified: geometry 200 on 10 sessions (single 404
is a cancelled round with no laps/positions), playback animates, switch shows a
contextual loading card, reload restores the deep link. 51 pytest + 29 vitest.

## 2026-10-30 — U9 smoothness, charts, stints, pit model

Playback stutter traced to App re-rendering on every playback tick: the page is
now throttled to ~8 Hz while map/timeline keep their own loop (measured 60 fps,
p95 16.7 ms). Shared useCanvasSize hook fixes charts drawn at stale widths
(battle pane). Added hover tooltips to speed, gap, relative-gap, weather and
timeline charts. Stints became one stacked row per driver with a compound
legend. Pit model inputs corrected (green-lap median for current pace, laps 2-4
of each stint for fresh pace, current-stint wear with "not measurable"
fallback) and the panel now shows a full breakdown and assumptions. Head-to-head
gained tooltips and a between-them row. 51 pytest + 32 vitest.

Verified on the user's own circuit (Spanish GP 2024, 66 laps): production build
loads in ~60s cold, plays at a locked 60 fps (p50/p95 16.7 ms), 20 drivers on
track, leader-in-Speed-panel default. Two commits: d43f791 (performance +
charts + stints + pit inputs) and 814c33f (weather tooltip anchor + docs).

## 2026-10-30 — F1 feature pass (pit stops, overtakes, results, share links)

Researched which feeds were unused (pit, position, overtakes, session_result;
starting_grid is empty for 2024) and shipped them additively: API endpoints with
caching/clamping + 3 new pure helpers (pit summary, overtake counts, position
lookup) and tests; tower gains positions and DNF labels; stints gain pit-stop
notches; Performance gains pit/overtake totals and a lap-time evolution chart;
driver card gains pit stops, overtakes and final result; `?t=` deep links with a
copy button. Key finding documented: `/position` is physical track order while
`gap_to_leader` is classification order, so the tower stays gap-ordered.
54 pytest + 34 vitest, screenshots night/day/mobile, 60 fps unchanged.

## 2026-10-30 — U10 OpenF1 started requiring credentials

Mid-session the upstream began returning 401 to every anonymous request. Added a
FeedAuthRequired error, a 503 JSON response that names OPENF1_API_KEY, optional
feeds that degrade to empty instead of 500, and support for sending the key as
Bearer + api_key. Cached sessions keep every feature; uncached ones show an
actionable message. Docs and .env.example updated.

## 2026-10-30 — U11 depth-on-demand UI pass

Fixed detached tooltips inside tables (portal + measured position), replaced
bare driver numbers with `VER · Verstappen` labels, added a reusable accessible
Modal and used it for lap times (driver chips + pace chart), lap pace (delta
chart scaled to p95 + table) and stint degradation (lap chart + full table).
Degradation is now a visual bar per stint sorted worst-first; the driver card
gained a team band, badges, a five-lap strip and per-stat tooltips. 54 pytest +
36 vitest; verified with screenshots of each new surface.

## 2026-10-30 — U12 per-driver depth, 3-way battle, sorted tables

Driver card now follows the playhead (last five laps ending at the playhead),
names the best lap, and drills into four modals (stints/wear, all laps,
overtakes, pit stops with red-flag artifacts filtered). Battle supports an
anchor plus two challengers with per-challenger gap lines and a pairwise
head-to-head. Degradation is grouped per driver with a "how to read" guide.
Tables sort via accessible headers (aria-sort, stable ordering, 5 new tests).
54 pytest + 41 vitest; 60 fps preserved.

## 2026-10-30 — U13 multi-driver lap comparison + grouped wear modal

Lap-times full view is now a multi-select: chips toggle any number of drivers,
the chart overlays them with a legend, and rows carry a team-colour dot, a 3px
inset edge and a tint so mixed tables stay readable; default sort is by lap.
The degradation full view now reuses the grouped-by-driver list from the
overview (every driver, every stint) instead of repeating a driver per row, and
its chart is limited to the six highest-wear drivers with a legend and a note.
54 pytest + 41 vitest, lint clean, verified with screenshots.

## 2026-10-30 — U14 pre-v1 polish

Fixed the stuck Play/Pause (trailing-edge throttle; the dropped trailing event
left the button on Pause) with unit tests; fixed the share link to build the URL
from state and confirm; renamed Calm to Reduce motion (auto-on for OS reduced
motion); icon theme toggle; inline lap-table driver filter; per-driver wear bar
scaling with team colours; race-control full view with search and category
counts; pit wall how-to and clearer verdict; mobile player wrapping. 54 pytest +
45 vitest, lint clean, 60 fps, mobile has no overflow.

## 2026-11-03 — v1.0.0 published, v2.1–v2.3

Tagged and pushed v1.0.0 (MIT, repo public). Pre-publish: scrubbed host
addresses from state docs, rewrote history with git-filter-repo (no IP in any
blob), CI green on both stacks after fixing pytest importability in a clean
checkout and pinning a real Trivy tag.

v2 research (docs/V2_RESEARCH.md) measured the free tier: 3 req/s and 30 req/min
per IP, ~30 requests per cold build (20 location calls are unavoidable, the
endpoint rejects filters without a driver), so ~60 s is a floor. Live data is a
paid tier; team radio is sparse in 2026 and F1-owned.

v2.1: one sliding-window bucket for both limits (the old 0.4 s spacing allowed
150 req/min), single-flight per cache key, atomic parquet writes. v2.2/v2.3:
lap duel — distance-aligned traces anchored to the official lap duration so the
delta starts at 0.000 and closes on the real lap-time difference; fifth tab
with its own clock. Fixed a v1 map bug found on the way: the glitch filter
compared every sample to the last kept point, so a single gap truncated 36% of
the 2026 US GP circuit. 69 pytest + 60 vitest, lint clean.

input lap traces (throttle/brake/gear/DRS) with nulls where 2026 lacks DRS.
Fight finder prototyped twice and deferred: intervals alone produced 181-593
candidate runs per race, some lasting 500 s on stale samples; shipping a list
would have broken the honesty rule. Also fixed two duel edges: stale laps
across a session switch (useAsync now reports which key its data belongs to)
and a driver with no timed laps leaving the previous pair on screen.

v2.1 UI pass: duel pickers rebuilt to one design (A/B labels, chevrons, same
height, default lap stated), sector split with Δ B−A, lead changes with a 50 ms
noise floor, and a "How to read this" block. Inputs now overlay every followed
driver on one axis (new t0/t1 window mode in /session/inputs), with a hover
tooltip per driver and coloured brake rows. 72 pytest + 64 vitest, CI green,
prod verified at 1440 px and 390 px with no overflow.

v2.2 AI: researched OpenCode Go (2026-11-03 docs) and confirmed the required
`x-opencode-session` header plus a custom user agent; endpoint
/inference/go/openai/v1, model deepseek-v4.1-flash. Added ai.py (server-side key,
3 retries, 6/min budget, per-session cache), /ai/status|ask|recap, and an Ask
tab with a recap button and suggestion chips. Facts are compressed from cached
data (result, sectors, clean-lap pace, pit stops, tyre plans, overtakes); the
prompt forces refusals when data is thin. max_tokens 500 truncated answers
because reasoning tokens count, so it is 1200 with a doubling retry on
finish_reason=length. Key lives only in gitignored .env (0600); audited that it
never appears in tracked files or history. Also fixed the A/B picker mismatch
(leftover amber border) and added the inputs explainer. 81 pytest + 64 vitest,
CI green, prod verified.

Dashboard pass: removed the forced auto-selection (first visit used to jump
into the latest race), added a localStorage Continue list (max 8, deduped per
session, per-entry remove, two-step clear), suggestions from the year calendar
that exclude what is already in Continue, and a how-it-works block. The brand
mark now returns to the picker. Ask tab gained an honest can/cannot guide.
7 storage tests; prod verified: fresh visit -> dashboard, open -> recents,
remove -> empty, reload -> persisted.

AI quality pass after review: the facts builder had been hiding retirements because
`is True` never matches a numpy bool; fixed with bool(). Facts now include the full
classification with full names and teams, retirements (or an explicit "none"),
best sector in the session plus theoretical best lap, winner/fastest-lap sectors,
top-five pace, tyre plans, weather and race-control notes. The prompt now speaks as
the app's engineer (no "data"/"feed"/"official report" phrasing), uses full names,
and answers off-topic questions with a branded OUT_OF_SCOPE message. Dashboard got a
quiet remove icon, a filter for lists over four entries, a 20-entry cap, and a
random "Surprise me" picker without the telemetry probe. 84 pytest + 71 vitest.

Chat + pit explainer: the Ask tab is now a conversation (last 10 turns, notes in
the system message, sessionStorage per session, two-step Clear, auto-growing
textarea). Chat answers are not cached because they depend on the thread.
Facts gained the full pit list with stop numbers (fastest 2.1s Piastri lap 15
stop 1; slowest 17.5s Alonso lap 42 stop 2), a consistency metric (median minus
personal best) and first-recorded-position to finish, which makes the tyre
management question answerable. Pit wall keeps the deterministic model as the
source of truth; /ai/pit recomputes it and the model only narrates, naming the
biggest assumption. 87 pytest + 76 vitest.

Chat panel rebuild: bordered fixed-height shell, scrollable transcript, pinned
composer, prompt chips always visible (wrap on desktop, scroll on mobile),
bottom-anchored short threads, and a Newest jump when the reader scrolls back.
Two bugs found in testing: the scroll effect ran before the shell mounted (it
renders after /ai/status), so the effect now depends on that flag; and smooth
scrolling during layout could stall, so auto-follow uses an instant scroll in a
requestAnimationFrame. Mobile: tab bar wraps, clear action no longer wraps, panel
fits the viewport. Verified desktop + 390px, jump-to-bottom, persistence.

Transcript + pit math pass: chat turns now read as one left-aligned column with a
role dot (you/engineer/you/engineer) instead of right/left bubbles. The pit model
returns break_even_pit_loss_s, stay_advantage_s, deg_total_s and
traffic_penalty_s; the panel shows both sums with substituted numbers, notes that
wear cancels in the decision, states the break-even (including the traffic
penalty) and explains what the engineer receives and will not do. A UI bug where
the traffic penalty was folded into the margin without saying so was fixed.
88 pytest + 76 vitest.

Test-suite audit: 164 tests (88 Python + 76 frontend) had accumulated trivia and
dead-code coverage. Removed the unused `/ai/ask` endpoint, lap-mode
`/session/inputs`, `clamp_selection`, `format_lap_time`, `team_colors` and the
unused client methods; merged parameter matrices and duplicate coverage; kept
every regression, endpoint contract and pure-maths invariant. Result: 64 Python
+ 47 frontend, with `docs/TESTING.md` stating what is tested, what is not, and
the rules for new tests.

Test audit follow-up: coverage review found the core replay path and the
length-retry of the AI client untested, so two contracts were added back
(replay zeroes time at lights out and takes its duration from the race clock;
finish_reason=length retries with a doubled cap). Final: 66 Python + 47
frontend, all other cuts stand.

Chat layout final pass: reverted the single left-aligned list to a two-sided
conversation (user right in an amber-tinted bubble, engineer left with the amber
edge, role dots), starting at the top of the transcript. nginx now serves
index.html with no-store and hashed assets as immutable, because repeated "still
the same" reports were consistent with a stale bundle. Verified on desktop and
390px.

Narrow-window fix: the chat bubble reused the `engineer` class, so the layout's
`@media (max-width: 1100px) .engineer { order: 3 }` reordered every user bubble
above every engineer bubble (me/me/me then ai/ai/ai). Chat classes renamed to
ask-user/ask-engineer and the rail rules scoped to direct layout children.
Also stacked the pit source table under 640px (it was 478px wide at 390px).
Verified at 1440, 800, 720, 640, 560, 500, 390.

Session-aware Ask: _ai_facts now labels the order per session type (Full
classification / Qualifying classification / Practice order), keeps points,
winner, retirements, positions, pit stops and overtakes to races, and warns that
the classified leader may not hold the fastest lap. The prompt knows the session
type, the recap is session-specific, and the Ask chips/recap label switch for
qualifying and practice. Chat history stays per session. Verified live with a
qualifying recap and a practice question; 67 pytest.

Docs audit: README architecture now shows ai.py and OpenCode Go instead of the
legacy coach only; repo layout includes ai.py, ratelimit.py and tests/; the API
table includes inputs/duel/AI endpoints; Jolpica was removed (never used in the
code); credentials and workflow are explicit; ARCHITECTURE gained an AI boundary
section; DEPLOYMENT gained "Enabling the AI" (key, model, restart, rotation) and
the corrected 3/s + 30/min wording. TESTING/README counts at 67 + 47.

Corner coach fix: the legacy coach called the local `opencode` CLI, which is not
installed in the API image, so /coach/ask returned answer=null in production.
It now uses the same ai.py client with the measured prompt and session facts,
and coach.fallback_answer gives a measured sentence when the AI is off. Removed
the CLI code, ask_llm/render_radio tests, BOXBOX_MODEL from .env.example and
compose, and the "LLM unreachable" UI branch. Verified in prod: llm=true answer
in the panel. 67 pytest + 47 vitest.

Backlog closure: the Performance stint timeline already met the Gantt contract,
so it only gained hover details (tyre age at the stint start plus the gap to the
leader at that lap). Added the 1200x630 share-card download in the player bar:
brand, session, lap, clock, circuit and every car, top-five labels only to avoid
a pile-up; layout maths unit-tested. V2.5 Fight Finder stays deferred for the
documented feed-noise reason. 67 pytest + 50 vitest.

V2.5 shipped as Battles now: a live strip in the Battle tab listing neighbouring
drivers within 1.0s at the replay clock, click to load into the anchor/challenger
view. The historical scan stays rejected — intervals produced 181-593 noisy runs,
and the position feed only covers ~2% of a 1Hz grid, so a "finds the fight" list
would be dishonest. The snapshot uses only current gaps. 3 new tests; 67 pytest
+ 53 vitest.

State audit 2026-11-14: verified the shipped tree at v2.13.1 — 67 pytest,
53 vitest, ruff clean, tsc/vite build, CI green on 9c3407a, working tree clean,
all tags pushed. Reconciled the tracker, which had drifted: TASK-001 and
V2-5/V2-6 were still marked TODO after shipping, V2-22 said "v2.13.0 next",
CURRENT_STATUS carried a stale unchecked V2.6/V2.7 line plus duplicate Last
Updated blocks, and V2_RESEARCH still claimed no tag existed. GitHub Releases
remain uncreated (tags only); API-key rotation and demo prewarm are still
user-side. No code backlog: V2-4 and V2-7 stay deferred/blocked for the
documented data reasons.

## 2026-11-14 — v3 research validated, plan and backlog drafted

Validated `docs/V3_RESEARCH.md` recommendations against repo constraints and shipped surfaces: Strategy engine v3, Telemetry Lab 2.0 and grounded AI race engineer 2.0 are relevant/feasible as the v3 headline on existing OpenF1 historical data and v2 modules; quali/practice mini-sectors, weather/RC, pit/overtake analytics, layouts/PWA/export are bounded supporting work; 3D/WebGL and Jolpica 1950+ archive are stretch items gated on perf and CC BY-NC-SA/non-commercial licence posture respectively. Confirmed exclusions remain correct (live timing paid, FastF1 runtime needs F1TV auth, radio transcription guarantees, fantasy scope, historical fight scan). Created `docs/V3_PLAN.md` (V3.0 decision gate → V3.1–V3.5 with dependencies, contracts, acceptance, risks) and added a v3 backlog (V3-0…V3-5c) to `TASK_QUEUE.md`; updated `CURRENT_STATUS.md`. No feature implementation started; V3.0 decisions must be recorded before V3.1+.

## 2026-11-14 — v3 core end-to-end implementation plan documented

Produced `docs/V3_CORE_IMPLEMENTATION_PLAN.md`: committed-core scope (V3.1 Strategy engine, V3.2 Telemetry Lab 2.0, V3.3 grounded AI 2.0, V3.4b weather/RC timeline, V3.4d PWA/offline cached sessions, V3.4e export) with data/rate-limit/free-usability gates (OpenF1 historical 3/s+30/min, cached/single-flight, honest degradation). Included proposed V3.0 decisions (D1–D6), cross-cutting contracts, and design-an-interface alternatives+synthesis for key modules (strategy pipeline, aligned telemetry, fact-bundle explain, client export/offline). Documented per-milestone E2E: data flow, pure interfaces, API contracts, UI/UX/states, files, acceptance/tests, and conditional V3.4a/c gates. Updated V3_PLAN/TASK_QUEUE/CURRENT_STATUS to reference the implementation-ready core plan. Implementation not started.

v3 plan review: closed the V3.0 gate by recording D1–D6 (strategy+telemetry+AI
headline, historical/free, on-demand AI, GPS geometry, Jolpica out of core,
prewarm set) and fixed plan gaps found in review: /ai/explain now refuses
client-supplied facts (server builds bundles), telemetry distance/time axes are
explicit and cannot be mixed, fuel proxy defaults off, pit loss uses the
pit_duration lane-time proxy, offline is capped at 25 MB/session and disables AI,
and mini-sector placeholder detection is defined. Added caller usage examples.
Plan is implementation-ready; no feature code started.

V3.1 shipped: strategy.py (pure) filters pit-out/slow/SC laps, builds a pace
and wear profile, and ranks stay/pit options with break-even, undercut, traffic
penalty, coverage and assumptions. POST /session/strategy returns it; a new
Strategy tab renders ranked options and limits, keeping the v2 toy in Pit Wall.
Real check: NOR at lap 43 -> stay 1426.1s vs pit HARD 1433.6s, pit loss 24.2s
from median lane time, break-even 16.7s. Dockerfile copies strategy.py (the
image import guard caught it in CI locally). 73 pytest + 53 vitest.

V3.2 shipped: POST /session/telemetry returns up to five drivers' speed, throttle,
brake, gear and DRS over one session-time window, with nulls preserved; a new
Telemetry tab draws speed traces and a hover readout for up to three drivers.
Scope is explicitly same-clock; distance-aligned comparison stays in Lap duel.
Tested on the US GP (NOR/VER hover values). 74 pytest + 53 vitest.

V3.3 shipped: POST /ai/explain takes kind+subject, rebuilds the strategy or
compare result server-side, builds a fact bundle and asks the model to narrate
it; no client facts. Strategy and Telemetry Lab panels gained 'Explain'
buttons. Verified that the Go monthly allowance is exhausted (provider 429,
GoUsageLimitError): added AIQuotaExceeded -> HTTP 429 with a clear UI message
instead of a generic 502; other endpoints unaffected. Live answer verification
blocked by the quota; mocked tests cover the path. 76 pytest + 53 vitest.

V3.4e shipped: client-side CSV export of laps and stints from the loaded
session (no endpoint, no secrets); Performance tab gained export buttons.
Verified download: boxbox-11396-laps.csv, 1,166 rows, correct headers.
56 frontend tests (3 new CSV tests).

V3.4b shipped: GET /session/timeline normalizes weather and race-control rows to
the replay clock, counts VSC/SC/red/yellow, and the Performance tab draws the
track-temperature trace, neutralisation bands and flag markers on one axis.
Verified on the US GP: 95 weather points, 148 events, 2 VSC bands, 26 markers.
79 pytest + 56 vitest.

V3.4d shipped: Full/Focus/Data layouts persisted in localStorage; service
worker caches the shell and serves API GETs network-first with cache fallback;
'Save offline' caches the current session (13 endpoints + shell) with a 25 MB
cap and a removable manifest. Offline reload verified with the network off: 22
tower rows, map canvases, banner shown, AI disabled. 58 frontend tests.

V3.4a/c shipped: mini-sector strips for qualifying/practice with ≥95% placeholder
detection (races hide the panel), and a pit/overtake analytics panel (median,
best, >1.5x outliers, quickest stops, top overtakes). V3.5 closed by decisions:
3D no-go (D7), Jolpica archive no-go (D8), standings deferred (D9). 79 pytest +
65 vitest.

Optional 3D replay shipped (`v3.5.0`). Research recorded in
`docs/V3_5_3D_RESEARCH.md`: OpenF1 location is 3.7 Hz with an arbitrary origin
and no lateral placement, so the 3D view is a flat ribbon with an explicitly
visual width and no invented elevation. `Track3D.tsx` is a lazy three.js chunk
(523 KB / 131 KB gzip) loaded only on the first 3D switch; 2D stays default and
owns corners/DRS/hover. Orbit, zoom, click-to-select, day/night, aspect-aware
camera fit, WebGL fallback and disposal are verified at 1440 and 390. The 3D
button is disabled offline because the lazy chunk is not in the shell cache.
AI key was replaced in `.env` and `/ai/explain` works live again. 79 pytest +
68 vitest; tagged `v3.5.0`.
