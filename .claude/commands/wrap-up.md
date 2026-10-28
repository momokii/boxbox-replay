---
description: Perform the AGENT_RULES wrap-up checklist and update state files
---

# /wrap-up — Task Wrap-Up

Perform the Wrap-Up checklist from `.claude/AGENT_RULES.md`. Because `.claude/`
is a protected path, do ALL writes together in one step.

- Update `state/CURRENT_STATUS.md` (keep under ~80 lines; move older summaries to `state/HISTORY.md`).
- Update `state/TASK_QUEUE.md` (mark done, add discovered tasks).
- Log significant decisions in `state/DECISIONS_LOG.md`.
- Update `CODING_STANDARDS.md`, `SECURITY_STANDARDS.md`, `ENVIRONMENT_GUIDE.md`, `CLAUDE.md` (Commands, Snapshot), and `README.md` if they changed.

Print a short summary of what was updated.
