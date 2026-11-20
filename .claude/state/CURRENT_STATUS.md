## Project Phase
v2 shipped (`v1.0.0`…`v2.13.1`). v3 complete through **`v3.13.0`**: V3.1 strategy, V3.2 Telemetry Lab, V3.3 grounded explain, V3.4a/c/d/e supporting analytics, the optional lazy **3D replay** (V3.5a), plus **championship standings** and the **results archive through 2026** (V3.5b/c, Jolpica), plus the v3.7 freshness/comparison/telemetry fixes and the v3.8 window/snapshot/mini/share-card pass.
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
- [x] V3.5b archive + V3.5c standings (Jolpica; D11) — `v3.6.0`
- [x] 3D visual pass: procedural F1 cars, asphalt/start/corner detail, fitted camera
- [x] v3.7 freshness/comparison/archive/telemetry fixes
- [x] v3.8 Telemetry scopes, Battle snapshots, mini Detail/Overall, driver headshots, share-card rotation, strategy recommendation
- [x] v3.9 Battle snapshot history truncation + headshot state keyed per driver
- [x] v3.10 scoped Telemetry AI, stint/pit definitions, session-wide downloads in Report, printable Data/AI report
- [x] v3.10.1 report polish: closed circuit, key takeaways/glossary, three-part AI analysis, no blank print pages
- [x] v3.10.3 direct header Download, AI-busy print lock, pit-visit vs timed-stop clarity
- [x] v3.10.4 unambiguous Download data label and explicit empty timed-stops state
- [x] v3.11 replay build progress + cancellation on session switch
- [x] v3.12 on-demand hover speed with loading/unavailable distinction
- [x] v3.13 close-out: security headers (CSP), artifact/dead-script cleanup, SECURITY/CONTRIBUTING/closeout docs, final verification

## Blocked / Deferred (deliberate, documented)
- V2-4 historical Fight Finder: DEFERRED (noisy/sparse feeds)
- V2-7 race mini-sectors: BLOCKED for races; V3.4a conditional for quali/practice when segments meaningful
- GitHub Releases (tags only), demo prewarm: user-side pending. API key replaced in `.env` and live-verified; rotate again if the pasted key was exposed.

## Open Questions
- None blocking implementation; D1–D12 are recorded. Revisit only if a data source or licence posture changes.
- Staging target none (prod covers staging via `APP_ENV=staging`)

## Security Notes
- Core data: OpenF1 historical (free, non-commercial, 3 req/s + 30 req/min, cached/single-flight). Jolpica results/standings are non-commercial CC BY-NC-SA 4.0 with attribution and a 1-hour cache. No secrets in repo/client; AI key server-only.

## Last Updated
2026-11-15: **v3.13.0 — v3 complete.** Security headers/CSP, tracked coverage and dead scripts removed, SECURITY.md/CONTRIBUTING.md and V3_CLOSEOUT.md added, docs/screenshots aligned. 93 pytest + 74 vitest; ruff/tsc/build clean; CI green; production healthy under the CSP.
