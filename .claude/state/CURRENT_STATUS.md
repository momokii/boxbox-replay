## Project Phase
M0 done and committed. Next: M1 chooser + picker + lap table.

## Completed
- [x] `.claude/` agent infrastructure and root CLAUDE.md initialized
- [x] M0: env + fetch proof — `feat(m0)` committed (6ebe3c0)
- [x] Docker deployment proven: image builds, dev stack boots healthy (`/_stcore/health` → ok), clean down, prod config renders

## In Progress
- [ ] M1: chooser + picker + lap table (hides empty-telemetry sessions)

## Blocked
None

## Open Questions
- Env var name for existing opencode-go LLM token (needed at M4, not now)
- Staging target does not exist yet; prod files cover staging via `APP_ENV=staging`

## Security Notes
- Only public, no-auth APIs touched (OpenF1, Jolpica). No secrets in repo.
- Prod image: non-root user, no secrets baked, `no-new-privileges`, named cache volume.

## Last Updated
2026-10-28: M0 committed (6ebe3c0)
(Update this line and keep this file under ~80 lines; move history to HISTORY.md.)
