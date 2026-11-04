## Project Phase
v1.0.0 tagged and published (MIT). v2 in progress: rate limiter + lap duel shipped.
DEPLOYED prod, healthy at http://<host>:8501.

## Completed
- [x] M0–M7 Streamlit app (superseded; removal planned at R4)
- [x] TASK-002 security guardrails (pre-commit + CI)
- [x] R0: FastAPI backend (all feeds, corner-loss, coach-ask) + React shell (pickers + lap table)
- [x] UI research (`docs/UI_RESEARCH.md`): Streamlit out, React+FastAPI in

## In Progress
- [x] V2.1: OpenF1 3/s + 30/min bucket, single-flight builds (69 pytest)
- [x] V2.2/V2.3: lap-duel endpoint + view, distance-aligned delta (60 vitest)
- [x] V2.4 inputs strip: multi-driver overlay, hover readout, window endpoint
- [x] Duel UX: consistent pickers, sector split, lead changes, reading guide
- [ ] V2.6 pit Gantt · V2.7 share card · V2.5 fight finder deferred (feed too noisy)
- [x] fix: glitch filter no longer truncates a circuit after one telemetry gap
- [x] R1: all-driver canvas replay (map, tower, playback, synced trace)
- [x] R2: feature panels (battle, performance, pit toy) as secondary views
- [x] R3: coach on-trigger (corner button, async ask, radio card)
- [x] U2: skill-driven redesign (frontend-design skill installed, plan in docs/UI_REDESIGN.md, screenshot-verified)

## Blocked
None

## Open Questions
- Opencode `run` verified as the LLM backend; `BOXBOX_MODEL` overrides the model
- Staging target does not exist yet; prod files cover staging via `APP_ENV=staging`

## Security Notes
- Only public, no-auth APIs touched (OpenF1, Jolpica). No secrets in repo.
- API image: non-root user, no secrets baked, `no-new-privileges`, named cache volume in prod.

## Last Updated
2026-11-03: v1.0.0 and v2.0.0 tagged; v2.1 adds duel polish + inputs comparison
(Update this line and keep this file under ~80 lines; move history to HISTORY.md.)

- [x] U9: smoothness (60fps), chart hover + responsive widths, stacked stints, honest pit model
- [x] F1: pit stops, overtakes, results, DNF labels, `?t=` share links, lap-time chart

## Last Updated
2026-10-30: feature pass shipped (pit stops, overtakes, results, share links, lap chart); OpenF1 credential requirement handled with OPENF1_API_KEY
