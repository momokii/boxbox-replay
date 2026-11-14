## Project Phase
v2 shipped (`v1.0.0`…`v2.13.1`). v3 **in progress**: V3.0 decisions recorded; **V3.1 strategy model**, **V3.2 Telemetry Lab** and **V3.3 grounded explain** shipped. Next: V3.4b/e/d.
DEPLOYED prod, healthy at http://<host>:8501.

## Completed
- [x] TASK-001 foundation + TASK-002 guardrails (FastAPI/Python 3.12 + React/Vite/TS, Docker Compose, CI/pre-commit)
- [x] M0–M7 (superseded) and R0–R4 revamp; v2 shipped V2.1–V2.22 (duel/inputs/Battles now, stints/share, grounded Ask/AI, coach, tags v1.0.0–v2.13.1)
- [x] v3 research validated; overview + end-to-end core plan **reviewed and locked**; V3.0 D1–D6 recorded (`V3_CORE_IMPLEMENTATION_PLAN.md`)
- [x] V3.1 strategy engine (clean laps, pace/wear profile, ranked scenarios, break-even, coverage) + tests + Strategy tab
- [x] V3.2 Telemetry Lab (same-clock multi-driver traces + hover)
- [x] V3.3 grounded explain (server-built facts; AI quota mapped to 429)
- [ ] V3.4b weather/RC timeline · V3.4e export · V3.4d PWA/offline

## Blocked / Deferred (deliberate, documented)
- V3.2 implementation not started; V3.0 gate closed
- V2-4 historical Fight Finder: DEFERRED (noisy/sparse feeds)
- V2-7 race mini-sectors: BLOCKED for races; V3.4a conditional for quali/practice when segments meaningful
- GitHub Releases (tags only), demo prewarm, API key rotation: user-side pending

## Open Questions
- None blocking v3 implementation; D1–D6 are recorded. Revisit only if a data source or licence posture changes.
- Staging target none (prod covers staging via `APP_ENV=staging`)

## Security Notes
- Core data: OpenF1 historical (free, non-commercial, 3 req/s + 30 req/min, cached/single-flight). Jolpica only if D5 posture later accepted. No secrets in repo/client; AI key server-only.

## Last Updated
2026-11-14: v3 core end-to-end plan/design documented (committed features, data/rate-limit gates, interface synthesis, contracts/acceptance). Implementation not started; V3.0 pending. 67 pytest + 53 vitest, ruff clean, build OK, CI green on `v2.13.1`.
