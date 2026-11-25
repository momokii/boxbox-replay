# CLAUDE.md — Agent Entry Point (Auto-loaded)

> This file is auto-loaded at the start of every Claude Code session and
> persists through context compaction. Keep it under ~150 lines.
> Link to deeper docs; never duplicate them here.

## Project Snapshot

BoxBox Replay: F1 telemetry viz, React SPA + FastAPI, v4.7.5. Replay, lap duel,
inputs, pit wall, AI Ask, Battles, standings, results archive, a truthful
3D/circuit view and the local **BoxBox Grid** race room are live; 94 pytest +
109 vitest. V4 adds retirement/pit status, true-scale 3D cameras, a live
qualifying phase, Grid explainer/driver desk/compare, seeded SC/VSC/crash
events, Top/Angle circuit view, two-run qualifying, 20 s/lap viewing pace,
start lights, per-lap driver modal, zoom/pan, driver identity hovers, live model feed, timing strip and a downloadable result image.

## Always-Loaded Context

The following files are imported automatically with this file. They are compact
and always relevant.

@.claude/AGENT_RULES.md
@.claude/CODING_STANDARDS.md
@.claude/SECURITY_STANDARDS.md
@.claude/state/CURRENT_STATUS.md

## Session Protocol (Summary)

Full protocol: `.claude/HOW_TO_RESUME.md`. Short version:

1. Confirm this file and its four imports are loaded; if not, read them manually.
2. Read `.claude/state/TASK_QUEUE.md` — pick the next task and its dependencies.
3. Identify the active environment (`APP_ENV`); see `.claude/ENVIRONMENT_GUIDE.md`.
4. Check git state: branch, uncommitted changes, recent commits.
5. Verify environment works (startup/health-check) and run baseline tests.
6. Plan (goal, files, risks, verification) before non-trivial work; confirm if significant.
7. Implement with the matching `.claude/templates/` checklist; follow Security Gate.
8. Verify: tests, lint, type checks, Security Gate.
9. Wrap up: update state files together in one step (`/wrap-up`).

## Commands

Stack: FastAPI/Python 3.12 + React/Vite/TS, Docker Compose, OpenCode Go for AI.

| Purpose      | Command           | Status          |
|--------------|-------------------|-----------------|
| Run / dev    | `./scripts/setup.sh` (docker: api + web, port 8501) | v4.7.5 verified |
| Test (API)   | `.venv/bin/python -m pytest` | 94 pass |
| Test (web)   | `cd web && npm test` (vitest) | 109 pass |
| Lint (API)   | `.venv/bin/python -m ruff check .` | clean |
| Build (web)  | `cd web && npm run build` | verified |
| Type check   | `tsc -b` (runs inside `npm run build`) | verified |
| Health check | `curl localhost:8501/api/healthz` (via web proxy) | verified |
| Build        | `docker compose build` / `./scripts/setup.sh --build-only` | verified |

## On-Demand References

| When you need…                        | Read…                                  |
|---------------------------------------|----------------------------------------|
| Next tasks and backlog                | `.claude/state/TASK_QUEUE.md`          |
| Past decisions and rationale          | `.claude/state/DECISIONS_LOG.md`       |
| Session history                       | `.claude/state/HISTORY.md`             |
| Dev / staging / prod rules            | `.claude/ENVIRONMENT_GUIDE.md`         |
| Full session-start protocol           | `.claude/HOW_TO_RESUME.md`             |
| Orientation and context-loading model | `.claude/README.md`                    |
| Feature checklist                     | `.claude/templates/new_feature.md`     |
| New API endpoint checklist            | `.claude/templates/new_endpoint.md`    |
| New test checklist                    | `.claude/templates/new_test.md`        |
| Bug-fix checklist                     | `.claude/templates/bug_fix.md`         |
| Project docs (once they exist)        | `docs/` and project `README.md`        |

Run `/context` in a new session to confirm the four imported memory files appear.

## Maintenance Rules for This File

- Keep under ~150 lines. Link instead of duplicating.
- Fix immediately when inaccurate (snapshot, commands, import list).
- Imports are plain-text `@path` lines, never inside code fences or inline code.
- Only import compact, always-relevant files; everything else is on-demand.
- Personal notes go in `CLAUDE.local.md` (gitignored), never here.
