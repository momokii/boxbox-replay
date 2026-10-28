# .claude/README.md — Orientation for Humans and Agents

> What this repository is: general placeholder for now (no purpose or stack yet).
> Updated after the first working session. Every file here starts general by
> design and evolves into project-specific content as facts become known.

## How Context Loads (Read This First)

- Root `CLAUDE.md` is **auto-loaded** at the start of every Claude Code session
  and persists through context compaction. It is the mandatory entry point.
- `CLAUDE.md` imports exactly four compact, always-relevant files:
  `AGENT_RULES.md`, `CODING_STANDARDS.md`, `SECURITY_STANDARDS.md`,
  `state/CURRENT_STATUS.md`.
- Everything else in `.claude/` is **NOT auto-loaded** — read it on demand
  (see the map below and the On-Demand References table in `CLAUDE.md`).
- Import lines are plain-text `@path` lines, never inside code fences.
  Imported files consume context, so they stay concise (~150 lines each).

## File Map

| Path | Purpose |
|------|---------|
| `CLAUDE.md` (root) | Auto-loaded entry point; snapshot, protocol summary, commands, links |
| `.claude/settings.json` | Shared permissions baseline (deny/ask/allow); committed |
| `.claude/AGENT_RULES.md` | Non-negotiable behavioral rules (imported) |
| `.claude/CODING_STANDARDS.md` | Stack-agnostic standards, evolves per stack (imported) |
| `.claude/SECURITY_STANDARDS.md` | Security requirements + Security Gate (imported) |
| `.claude/ENVIRONMENT_GUIDE.md` | Dev/staging/prod definitions and agent behavior |
| `.claude/HOW_TO_RESUME.md` | 11-step session-start protocol |
| `.claude/commands/resume.md` | `/resume` slash command: run resume protocol, report |
| `.claude/commands/wrap-up.md` | `/wrap-up` slash command: perform wrap-up checklist |
| `.claude/commands/security-check.md` | `/security-check` slash command: Security Gate on current diff |
| `.claude/state/CURRENT_STATUS.md` | Living state: phase, in-progress, blockers (imported, <~80 lines) |
| `.claude/state/TASK_QUEUE.md` | Ordered backlog with task template |
| `.claude/state/DECISIONS_LOG.md` | Decisions with rationale and security impact |
| `.claude/state/HISTORY.md` | Append-only log of past session summaries |
| `.claude/templates/new_feature.md` | Checklist for new features |
| `.claude/templates/new_endpoint.md` | Checklist for new API endpoints |
| `.claude/templates/new_test.md` | Checklist for new tests |
| `.claude/templates/bug_fix.md` | Checklist for bug fixes |

## settings.json Design Notes (Security-First Baseline)

- Evaluation order is deny, then ask, then allow; first match wins, so deny always beats allow. No `defaultMode` is set — Claude Code's built-in default applies.
- `.env.*` is NOT denied with a wildcard, because that would also block `.env.example`, which the agent must read and edit. Specific secret-bearing files are denied instead.
- Read/Edit deny rules cover Claude's built-in file tools, recognized Bash file commands (`cat`, `head`, `tail`, `sed`, `tee`), and redirect targets. They do NOT cover indirect readers such as `grep -r` from the holding directory or scripts that open files themselves. For OS-level enforcement, evaluate Claude Code's sandboxing feature (do not enable without user confirmation).
- Bash rules match command text as written and are not a security boundary: `Bash(curl *)` misses `/usr/bin/curl` or `sh -c 'curl …'`; `Bash(git push *)` misses `git -C . push`.
- Plain `docker compose up *` only matches default (development) invocations. Explicit `-f … prod …` invocations do not match allow and therefore prompt.
- Stack-specific commands (test runner, linter, package manager) are NOT pre-allowed. Propose an allow-list after the stack is chosen; add with user confirmation. Never add a blanket `Bash(*)`.
- `.pre-commit-config.yaml`, `.husky/`, `.devcontainer/`, `.mcp.json` are also protected paths — edits prompt. This is expected.
- Never create or modify `.claude/settings.local.json`.

## Protected Path: `.claude/` Writes Prompt

`.claude/` is a protected path. In every permission mode except bypass, Claude Code
never auto-approves writes there (except `.claude/worktrees` and its auto-memory
files), and `allow` rules do not pre-approve them. Expect a prompt (with a
session-scoped "allow edits in this project's .claude folder" option) or, in auto
mode, routing to the classifier. Batch `.claude/` writes into as few steps as
practical. Never work around the protection via shell redirection or settings edits;
if a write is refused, report it. Verify any uncertain format against
<https://code.claude.com/docs>.

## Shared vs. Local

- Shared and committed: everything in `.claude/` except `settings.local.json`, plus root `CLAUDE.md`, `.env.example`.
- Personal and gitignored (never commit): `CLAUDE.local.md`, `.claude/settings.local.json`. Never put preferences or secrets in shared files.
- Claude's own auto-memory is local to a machine; team-relevant knowledge must live in these versioned files.

## Self-Update Directive

- Replace general content with project-specific content as facts become known (especially after TASK-001: `CODING_STANDARDS.md`, `SECURITY_STANDARDS.md`, `ENVIRONMENT_GUIDE.md`, `CLAUDE.md` Commands).
- Self-updates may extend and sharpen rules but must never weaken security rules or permissions without explicit user approval.
- Keep every file concise; link instead of duplicating; fix stale content immediately.

## Confirming Context Is Loaded

Run `/context` in a new session and check that `CLAUDE.md` and its four imported
memory files appear.
