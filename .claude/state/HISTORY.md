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
