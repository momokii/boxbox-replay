# .claude/state/TASK_QUEUE.md — Ordered Backlog

> Highest priority first. Keep each task's Scope and Acceptance Criteria measurable.

## TASK-001: Establish project foundation

| Field               | Value                                               |
|---------------------|-----------------------------------------------------|
| Task ID             | TASK-001                                            |
| Name                | Establish project foundation                        |
| Priority            | High                                                |
| Status              | TODO                                                |
| Complexity          | M                                                   |
| Depends On          | User confirmation of purpose and stack              |
| Scope               | Confirm purpose and stack with the user; extend `.gitignore` for the stack; set up formatter, linter, type check, and test tooling; set up the Compose dev/prod pattern if containerized; update `CODING_STANDARDS.md`, `SECURITY_STANDARDS.md`, `ENVIRONMENT_GUIDE.md`, `HOW_TO_RESUME.md` commands, the `CLAUDE.md` Commands table, and propose a stack-specific `settings.json` allow-list. Perform as part of, or immediately before, the user's first real task. |
| Acceptance Criteria | One command each to run, test, lint, and health-check; all `.claude/` files reflect the real stack |
| Security Concerns   | Formatter/linter/type-checker versions pinned; Compose prod overrides drop debug ports and mounts; `.env.example` covers all new variables |

## TASK-002: Add automated security guardrails

| Field               | Value                                               |
|---------------------|-----------------------------------------------------|
| Task ID             | TASK-002                                            |
| Name                | Add automated security guardrails                   |
| Priority            | High                                                |
| Status              | TODO                                                |
| Complexity          | M                                                   |
| Depends On          | TASK-001                                            |
| Scope               | Propose and, with user confirmation, add pre-commit secret scanning, dependency audit, static analysis, image scanning if containerized, and a CI pipeline running tests, lint, type checks and scans |
| Acceptance Criteria | CI runs tests + lint + types + scans on every push; secret scan blocks commits with secrets |
| Security Concerns   | Guardrails themselves must not leak secrets in logs; least-privilege CI tokens |

---

## Project Milestones — F1 Telemetry Viz + Race Replay + LLM Coach (brief v2)

Rule for all: one milestone = one commit (`feat(mX): ...`), tests + ruff clean before commit. Empty `car_data` sessions are hidden with reason "no telemetry" — never crash, never fake.

| Field               | M0                                                          |
|---------------------|-------------------------------------------------------------|
| Task ID             | M0                                                          |
| Name                | Env + fetch proof                                           |
| Priority            | High                                                        |
| Status              | DONE (committed 6ebe3c0; proof: 2023:118, 2024:123, 2025:123, 2026:131; Suzuka quali 223 rows) |
| Complexity          | S                                                           |
| Depends On          | User approves file tree below                               |
| Scope               | Scaffold repo (requirements, ruff/pytest config, gitignore extend); `data_loader` list_years/gps/sessions + parquet cache shape; mocked tests; commit |
| Acceptance Criteria | Counts/year + Suzuka 2024 quali laps printed (done); `pytest` + `ruff check` clean; M0 commit pushed only on request |
| Security Concerns   | Public no-auth APIs only; 3 req/s respected; no secrets in repo |

| Field               | M1–M6 (queued)                                              |
|---------------------|-------------------------------------------------------------|
| M1                  | Chooser + picker + lap table (DONE — hides empty sessions w/ reason, max 3 drivers, click-lap loads) |
| M2                  | Battle speed overlay + lap-time delta + gap-to-leader (DONE) |
| M3                  | Synced track-map animation (TODO, depends M2)               |
| M4                  | Coach on corner click, grounded, needs LLM token env name (TODO, depends M3) |
| M5                  | Performance mode: deg slope + stints + weather + radio (TODO, depends M3) |
| M6                  | What-if pit toy model, labeled "toy model" (TODO, depends M5) |

---

## Task Template (copy for every new task)

| Field               | Value                                               |
|---------------------|-----------------------------------------------------|
| Task ID             | TASK-XXX                                            |
| Name                | [Task name]                                         |
| Priority            | High / Medium / Low                                 |
| Status              | TODO / IN PROGRESS / DONE / BLOCKED                 |
| Complexity          | S / M / L                                           |
| Depends On          | [Task IDs]                                          |
| Scope               | [Exact description of what must be built]           |
| Acceptance Criteria | [Measurable definition of done]                     |
| Security Concerns   | [Security considerations for this task]             |
