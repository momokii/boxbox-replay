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
