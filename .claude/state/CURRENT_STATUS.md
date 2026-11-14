## Project Phase
v2 shipped: tags `v1.0.0` … `v2.13.1` pushed, HEAD clean at `9c3407a`. Next development is proposed only (pit-model depth, qualifying mini-sectors) — see `TASK_QUEUE.md`.
DEPLOYED prod, healthy at http://<host>:8501.

## Completed
- [x] TASK-001 project foundation (stack: FastAPI/Python 3.12 + React/Vite/TS, Docker Compose)
- [x] TASK-002 security guardrails (pre-commit + CI pytest/ruff/gitleaks/pip-audit + advisory Trivy)
- [x] M0–M7 Streamlit app (superseded)
- [x] R0–R4 revamp: FastAPI + React SPA, feature panels, coach, docs, deploy
- [x] V2.1: OpenF1 3/s + 30/min bucket, single-flight builds
- [x] V2.2/V2.3: lap-duel endpoint + view, distance-aligned delta
- [x] V2.4: inputs overlay, hover readout, window endpoint
- [x] V2.5: Battles now live snapshot (historical scan rejected)
- [x] V2.6: pit strategy Gantt (Performance stint timeline + tyre-age/gap hover)
- [x] V2.7: 1200×630 share card PNG
- [x] V2.8–V2.19: grounded Ask + recap, chat thread, session-aware facts, pit explainer, corner coach via AI
- [x] V2.20–V2.22: share card/stint hover, Battles now, tags v1.0.0–v2.13.1
- [x] U2 skill-driven redesign; U9 smoothness, chart hover, responsive widths
- [x] fix: glitch filter no longer truncates a circuit after one telemetry gap

## Blocked / Deferred (deliberate, documented)
- V2-4 historical Fight Finder: DEFERRED — intervals gave 181–593 noisy runs per race (`docs/V2_RESEARCH.md` §6)
- V2-7 qualifying mini-sectors: BLOCKED — segments exist only outside races
- GitHub Releases: tags pushed, but no Release objects created yet (user action)
- Demo prewarm: races not yet chosen/warmed (user action)

## Open Questions
- Staging target does not exist yet; prod files cover staging via `APP_ENV=staging`
- API key rotation: pasted key still needs rotating (user action)

## Security Notes
- Only public, no-auth APIs touched (OpenF1, Jolpica). No secrets in repo.
- API image: non-root user, no secrets baked, `no-new-privileges`, named cache volume in prod.

## Last Updated
2026-11-14: state audit reconciled; 67 pytest + 53 vitest, ruff clean, build OK, CI green on `v2.13.1`.
