## Project Phase
M2 done and committed. Next: M3 synced track-map animation.

## Completed
- [x] `.claude/` agent infrastructure and root CLAUDE.md initialized
- [x] M0: env + fetch proof — `feat(m0)` committed (6ebe3c0)
- [x] Docker deployment proven: image builds, dev stack boots healthy (`/_stcore/health` → ok), clean down, prod config renders

## In Progress
- [x] M1: chooser + picker + lap table
- [x] M2: battle speed overlay + gap chart

## Blocked
None

## Open Questions
- Env var name for existing opencode-go LLM token (needed at M4, not now)
- Staging target does not exist yet; prod files cover staging via `APP_ENV=staging`

## Security Notes
- Only public, no-auth APIs touched (OpenF1, Jolpica). No secrets in repo.
- Prod image: non-root user, no secrets baked, `no-new-privileges`, named cache volume.

## Last Updated
2026-10-28: M2 committed
(Update this line and keep this file under ~80 lines; move history to HISTORY.md.)
