---
description: Run the session resume protocol (HOW_TO_RESUME Steps 1-7) and report state
---

# /resume — Session Resume

Execute `.claude/HOW_TO_RESUME.md` Steps 1–7. Do not start implementation until the user confirms.

1. Confirm `CLAUDE.md` and its four imports are loaded; if not, read them manually.
2. Read `.claude/state/TASK_QUEUE.md`; identify the next task and dependencies.
3. Identify the active environment (`APP_ENV`); consult `.claude/ENVIRONMENT_GUIDE.md`.
4. Check git state: branch, uncommitted changes, recent commits.
5. Read task-relevant docs if they exist.
6. Verify the environment works (health-check/startup command; generic until TASK-001).
7. Run the existing test suite as a baseline (generic until TASK-001).

Then report in under 15 lines: current state, next task, environment, baseline test
result, and any blockers. Stop there and await confirmation.
