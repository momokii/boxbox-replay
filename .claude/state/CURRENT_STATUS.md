## Project Phase
REVAMP (option A: React SPA + FastAPI). R0 done and committed. Next: R1 all-driver replay.

## Completed
- [x] M0–M7 Streamlit app (superseded; removal planned at R4)
- [x] TASK-002 security guardrails (pre-commit + CI)
- [x] R0: FastAPI backend (all feeds, corner-loss, coach-ask) + React shell (pickers + lap table)
- [x] UI research (`docs/UI_RESEARCH.md`): Streamlit out, React+FastAPI in

## In Progress
- [ ] R1: all-driver canvas replay (map, tower, play/pause/speed/scrub, synced trace)

## Blocked
None

## Open Questions
- Opencode `run` verified as the LLM backend; `BOXBOX_MODEL` overrides the model
- Staging target does not exist yet; prod files cover staging via `APP_ENV=staging`

## Security Notes
- Only public, no-auth APIs touched (OpenF1, Jolpica). No secrets in repo.
- API image: non-root user, no secrets baked, `no-new-privileges`, named cache volume in prod.

## Last Updated
2026-10-29: R0 committed (revamp backend + shell live)
(Update this line and keep this file under ~80 lines; move history to HISTORY.md.)
