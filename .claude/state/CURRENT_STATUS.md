## Project Phase
v4 shipped as **`v4.7.6`**. It closes the v3 replay work with a truthful
3D/circuit view, retirement/pit status, and the local **BoxBox Grid** race room
(2023–2026 circuits, real season tables, 1–4 players, 3/5/10 laps, explainer,
live driver desk/compare, two-run qualifying, per-lap modal, identity hovers,
a 20 s/lap viewing pace, VSC playback slowdown, live model feed, order directly
below the circuit, zoom/pan and a downloadable result image).
v4.7.3 validates driver text and event history; v4.7.4 restores matching
portraits and themes scrollbars; v4.7.5 memoizes the feed and clears incident
decoration at the flag; v4.7.6 adds AI shared/per-client rate limits and bounded
chat bodies.
DEPLOYED prod, healthy at http://localhost:8501.

## Completed
- [x] v4.0.0: true-scale 3D + cameras + minimap, exit clocks + pit guide + race-control rail, BoxBox Grid
- [x] v4.1.0: schematic pit guide, Free/Overview car markers, exact Grid positions and an 8 s/lap 1× clock; screenshots 49–60
- [x] v4.2.0: real Grid qualifying phase, hover pace/gap/intention, lap strip and selected-driver 3D card; screenshots 55/56/57/61/62
- [x] v4.3.0: fixed five-lap circuit mapping, Run/Skip choice, live qualifying and preserved GP selection; screenshots 55/56/62/63
- [x] v4.4.0: Grid explainer + full-width qualifying facts, driver desk/compare, seeded SC/VSC/crash incidents, Top/Angle view; screenshots 64–69
- [x] v4.5.0: two-run qualifying best counts, 12 s/lap 1× pace, five-light start, full-width card and 1200×630 result image; screenshots 54–72
- [x] v4.6.0: 20 s/lap 1× pace, per-lap driver modal, richer result card, visible VSC slowdown, zoom/pan and font/calendar resilience; screenshots 54–74
- [x] v4.6.1: bounded Jolpica requests (4 s × 2), 15 s frontend timeout, explicit Retry and no stuck roster; screenshot 75
- [x] v4.7.0: driver identity hovers with headshots, order strip with Int/Last/Best/Mode below circuit, live model feed, richer result card; screenshots 76–79
- [x] v4.7.1: current-clock lap modal (no future laps), order placement, column tooltips and on-track incident spotlight; screenshot 80/81
- [x] v4.7.2: incident active windows (no stale SC/crash), loading bar/spinner/skeleton; screenshots 82–84
- [x] v4.7.3: validated headshots/no wrong identity, live All events and result event history; screenshots 85/86
- [x] v4.7.4: themed scrollbars, code-first portrait matching (champion-number safe); screenshot 87
- [x] v4.7.5: final v4 audit, memoized feed, incident clear at finish
- [x] v4.7.6: AI shared/per-client rate limits, bounded bodies; final v4 repo wrap-up
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
- V4 3D: no metrically measured pit lane, track width or elevation; OpenF1 location has no lateral placement. Recorded transit is labelled approximate; fallback is schematic.
- V4 Grid: no pre-2023 circuit geometry, online play, accounts, leaderboards, tyres/pit stops/collision physics/reliability, or real-world prediction. SC/VSC are seeded stated lap-time losses and VSC playback slowdown is a viewing effect; crash is a seeded retirement, not real race control. Qualifying is two runs, not Q1/Q2/Q3; the result card is top 10 + players, not all classified rows. 1× is a 20 s/lap viewing pace.
- V2-4 historical Fight Finder: DEFERRED (noisy/sparse feeds)
- V2-7 race mini-sectors: BLOCKED for races; V3.4a conditional for quali/practice when segments meaningful
- GitHub Releases (tags only), demo prewarm: user-side pending. API key replaced in `.env` and live-verified; rotate again if the pasted key was exposed.

## Open Questions
- None blocking implementation; D1–D58 are recorded. Revisit only if a data source or licence posture changes.
- Staging target none (prod covers staging via `APP_ENV=staging`)

## Security Notes
- Core data: OpenF1 historical (free, non-commercial, 3 req/s + 30 req/min, cached/single-flight). Jolpica results/standings are non-commercial CC BY-NC-SA 4.0 with attribution and a 1-hour cache. No secrets in repo/client; AI key server-only.

## Last Updated
2026-11-23: **v4.7.6 — final v4 production candidate.** AI shared 6/min + per-client 3/min/20-hour limits, 429/Retry-After and bounded bodies; 97 pytest + 109 vitest; v4 surfaces E2E; production healthy.
