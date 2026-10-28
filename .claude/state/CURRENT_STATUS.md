## Project Phase
M0 in progress: reachability proven (OpenF1 + Jolpica). Awaiting file-tree confirmation before code.

## Completed
- [x] `.claude/` agent infrastructure and root CLAUDE.md initialized
- [x] M0 reachability proof: OpenF1 sessions/year (2023:118, 2024:123, 2025:123, 2026:131); Jolpica 2024: 24 races; Suzuka 2024 quali (session_key 9492): 223 lap rows, 20 drivers, fastest VER 1:28.197

## In Progress
- [ ] M0: file-tree proposal awaiting user confirmation; then scaffold + `list_*` + tests + commit `feat(m0)`

## Blocked
None (needs user: approve file tree)

## Open Questions
- Project purpose defined (F1 Telemetry Viz brief v2); stack proposed (Python 3.12, Streamlit, Plotly, pandas/pyarrow, httpx, ruff, pytest) — confirm
- Compose pattern from TASK-001 likely N/A (local Streamlit, no containers) — confirm skip
- Env var name for existing opencode-go LLM token (needed at M4, not now)

## Security Notes
- Only public, no-auth APIs touched (OpenF1, Jolpica). No secrets in repo.
- LLM token stays in environment, never in code/status files. Real guardrails land in TASK-002.

## Last Updated
2026-10-28: M0 proof done, tree proposed
(Update this line and keep this file under ~80 lines; move history to HISTORY.md.)
