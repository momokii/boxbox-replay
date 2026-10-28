# .claude/HOW_TO_RESUME.md — Session Start Protocol

> Read at every session start (via `/resume` or manually). Commands below are
> generic until TASK-001 defines the stack's real commands.

```text
Step 1:  Confirm context is loaded (CLAUDE.md, AGENT_RULES, CODING_STANDARDS,
         SECURITY_STANDARDS, CURRENT_STATUS). If not visible, read them manually.
Step 2:  Read .claude/state/TASK_QUEUE.md; identify the next task and its dependencies.
Step 3:  Identify the active environment (APP_ENV); consult ENVIRONMENT_GUIDE.md.
Step 4:  Check git state: branch, uncommitted changes, recent commits.
Step 5:  Read task-relevant docs (PRD, architecture, API contract) if they exist.
Step 6:  Verify the environment works (health-check/startup command; update once known).
Step 7:  Run the existing test suite as a baseline (update command once known).
Step 8:  Plan: scope, files, risks, verification. Ask for confirmation if significant.
Step 9:  Implement using the matching template in .claude/templates/.
Step 10: Verify: tests, lint, type checks, and the Security Gate.
Step 11: Wrap up: update state files in one step (the /wrap-up command performs this).
```

## Current Generic Commands (Replace in TASK-001)

| Step | Action       | Command (generic)              |
|------|--------------|--------------------------------|
| 4    | Git state    | `git status && git log -5 --oneline && git branch --show-current` |
| 6    | Health check | (not yet defined — see CLAUDE.md Commands table) |
| 7    | Baseline tests | (not yet defined — see CLAUDE.md Commands table) |

Notes:

- Never run load, destructive, or migration commands against staging/production.
- If `APP_ENV` is unknown, treat the context as production for safety.
- Report blockers before implementing; do not start Step 9 until the user confirms
  when the task is significant (per `AGENT_RULES.md` Planning).
