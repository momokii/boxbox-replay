# CLAUDE.md — Agent Entry Point (Auto-loaded)

> This file is auto-loaded at the start of every Claude Code session and
> persists through context compaction. Keep it under ~150 lines.
> Link to deeper docs; never duplicate them here.

## Project Snapshot

Purpose and stack not yet defined. Update after the first working session.
Phase: initialization — `.claude/` infrastructure bootstrapped, no product code yet.

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

Stack not yet chosen. The agent fills in real commands after TASK-001.

| Purpose      | Command           | Status          |
|--------------|-------------------|-----------------|
| Run / dev    | (not yet defined) | pending TASK-001 |
| Test         | (not yet defined) | pending TASK-001 |
| Lint         | (not yet defined) | pending TASK-001 |
| Type check   | (not yet defined) | pending TASK-001 |
| Health check | (not yet defined) | pending TASK-001 |
| Build        | (not yet defined) | pending TASK-001 |

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
