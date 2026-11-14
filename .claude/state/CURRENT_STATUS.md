## Project Phase
v2 shipped (`v1.0.0`…`v2.13.1`). v3 complete through **`v3.5.0`**: V3.1 strategy, V3.2 Telemetry Lab, V3.3 grounded explain, V3.4a/c/d/e supporting analytics, and the optional lazy **3D replay** (V3.5a). Jolpica (D8) stays no-go; championship progression (D9) deferred.
DEPLOYED prod, healthy at http://localhost:8501.

## Completed
- [x] TASK-001 foundation + TASK-002 guardrails (FastAPI/Python 3.12 + React/Vite/TS, Docker Compose, CI/pre-commit)
- [x] M0–M7 (superseded) and R0–R4 revamp; v2 shipped V2.1–V2.22 (duel/inputs/Battles now, stints/share, grounded Ask/AI, coach, tags v1.0.0–v2.13.1)
- [x] v3 research validated; overview + end-to-end core plan **reviewed and locked**; V3.0 D1–D6 recorded (`V3_CORE_IMPLEMENTATION_PLAN.md`)
- [x] V3.1 strategy engine (clean laps, pace/wear profile, ranked scenarios, break-even, coverage) + tests + Strategy tab
- [x] V3.2 Telemetry Lab (same-clock multi-driver traces + hover)
- [x] V3.3 grounded explain (server-built facts; AI quota mapped to 429)
- [x] V3.4e data export (laps/stints CSV)
- [x] V3.4b weather/RC timeline
- [x] V3.4d layouts, PWA shell, explicit offline cache (25 MB cap)
- [x] V3.4a mini-sectors + V3.4c pit/overtake analytics
- [x] V3.5a optional 3D replay (lazy three.js chunk, 2D default, offline-disabled) — `v3.5.0`
- [x] V3.5b Jolpica no-go (D8); V3.5c standings deferred (D9)

## Blocked / Deferred (deliberate, documented)
- V2-4 historical Fight Finder: DEFERRED (noisy/sparse feeds)
- V2-7 race mini-sectors: BLOCKED for races; V3.4a conditional for quali/practice when segments meaningful
- GitHub Releases (tags only), demo prewarm: user-side pending. API key replaced in `.env` and live-verified; rotate again if the pasted key was exposed.

## Open Questions
- None blocking v3 implementation; D1–D6 are recorded. Revisit only if a data source or licence posture changes.
- Staging target none (prod covers staging via `APP_ENV=staging`)

## Security Notes
- Core data: OpenF1 historical (free, non-commercial, 3 req/s + 30 req/min, cached/single-flight). Jolpica only if D5 posture later accepted. No secrets in repo/client; AI key server-only.

## Last Updated
2026-11-14: optional 3D replay shipped (`v3.5.0`): lazy three.js chunk (523 KB / 131 KB gzip), 2D default, orbit + click-to-select, WebGL fallback, offline-disabled. 79 pytest + 68 vitest, ruff/tsc/oxlint/build clean, CI green on `v3.5.0`; prod healthy. AI key replaced and live `/ai/explain` verified.
