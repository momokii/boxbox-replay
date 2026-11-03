# .claude/CODING_STANDARDS.md — Stack-Agnostic Standards

> Auto-imported via root `CLAUDE.md`. Keep concise (<~150 lines).
> Starts general by design; replaced with concrete conventions once the stack is known.

## Principles

- Clarity over cleverness. Optimize for the next reader, human or agent.
- One responsibility per function, file, and module. Small units, explicit boundaries.
- Explicit over implicit. No magic globals, hidden side effects, or surprising defaults.
- Fail fast and loudly. Never hide errors; surface them with context.

## Naming (Python 3.12, this project)

- Modules: `data_loader.py`, `analysis.py`, `viz.py`, `coach.py` (flat layout, M0).
- Functions: `snake_case` verb-noun (`list_sessions`, `get_car_data`, `best_lap`).
- Constants: `UPPER_SNAKE_CASE` (`BASE_URL`, `CACHE_ROOT`, `RATE_PER_MIN`).
- Booleans: prefixed `is/has/should/can`.
- Types: `from __future__ import annotations` + hints on all public functions.

## Error Handling

- Never swallow errors. Propagate or handle with a logged, deliberate decision.
- Log with enough context to reproduce (operation, IDs, input shape) but without sensitive data.
- Never expose internals or stack traces to end users; return generic client errors.

## Testing

- Every feature has tests; every bug fix has a regression test.
- Tests run with a single command (defined in `CLAUDE.md` after TASK-001).
- Security-relevant behavior has negative tests (unauthenticated, wrong role, malformed, oversized).
- Tests are deterministic; no reliance on wall-clock, network, or shared state unless intentional and isolated.

## Quality Tooling

- Configure a formatter, linter, and type checker (where the language supports it) during project setup (TASK-001).
- Run them before declaring done. Never weaken config to make a change pass.

## Documentation

- Public functions/modules documented (purpose, params, returns, errors).
- Non-obvious decisions get a short *why* comment plus a `DECISIONS_LOG.md` entry.

## Version Control

- Small, focused commits with clear messages; no unrelated changes in one commit.
- Never commit secrets, fixtures with real data, or generated artifacts unless intentional.
- Branch per task; rebase or merge per team convention (decide in TASK-001).

> Self-update done (M0): Python 3.12 + ruff (`pyproject.toml`: E,F,I,UP,B; line-length 100)
> + pytest (`tests/`, mocked HTTP). Cite paths: `data_loader.py`, `tests/test_data_loader.py`.
