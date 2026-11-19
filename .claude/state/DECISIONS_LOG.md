# .claude/state/DECISIONS_LOG.md — Decisions and Rationale

## Bootstrap Decisions (2026-10-28)

---
**Decision:** Root `CLAUDE.md` as auto-loaded entry point importing four files
**Date:** 2026-10-28
**Context:** Claude Code auto-loads only `CLAUDE.md`; other `.claude/` files are not auto-loaded
**Rationale:** Single compact entry point keeps context budget small while guaranteeing rules, standards, and live state load every session
**Alternatives Rejected:** Splitting context across many auto-loads (not supported); one giant file (blows context, stale-prone)
**Security Implications:** Security standards load every session by construction, so the Gate cannot be skipped by forgetting a file
**Impact:** All future sessions start with identical baseline context
---

---
**Decision:** Security-first `settings.json` baseline (deny > ask > allow, no defaultMode)
**Date:** 2026-10-28
**Context:** Need enforcement, not just guidance, for secrets and destructive ops
**Rationale:** Deny secret reads/edits and force-push/sudo; ask on push, destructive deletes, network fetch, prod compose ops; allow only safe read-only git/compose dev commands
**Alternatives Rejected:** Broad `Bash(*)` allow (unsafe); wildcard `.env.*` deny (would block `.env.example`)
**Security Implications:** Reduces accidental secret exposure and destructive runs; Bash matching is text-based, not a full boundary — sandboxing recommended
**Impact:** Stack-specific allow-list proposed after TASK-001 with user confirmation
---

---
**Decision:** Compose v2 dev/prod pattern (`compose.yaml` + auto `compose.override.yaml` + explicit `compose.prod.yaml`)
**Date:** 2026-10-28
**Context:** Need dev/prod parity without dev tooling leaking into production
**Rationale:** Matches Compose v2 automatic-override semantics; prod requires explicit `-f` flags so it never runs accidentally
**Alternatives Rejected:** Single compose file with env conditionals (leak-prone); legacy `docker-compose` binary and `version:` key (obsolete)
**Security Implications:** Prod config drops source mounts, debug ports; least-privilege defaults
**Impact:** Verified commands replace generics once the real Docker setup exists
---

---

## Proposed (pending file-tree confirmation, 2026-10-28)

---
**Decision:** Stack + sources per brief v2 (Python 3.12 satisfies 3.11+; Streamlit/Plotly/pandas-pyarrow/httpx/ruff/pytest; OpenF1 primary, Jolpica memory, FastF1 reference-only)
**Date:** 2026-10-28
**Context:** First real project task; TASK-001 needs purpose + stack confirmed
**Rationale:** Free, auto-updating data; proof shows 2026 sessions already flowing (131); stdlib-only probe respected 3 req/s, no deps installed
**Alternatives Rejected:** FastF1 as fetcher (auth sessions fragile — reference only); live timing (paid window — out of scope)
**Security Implications:** No-auth public APIs; LLM token stays in env (name TBD at M4); empty-telemetry sessions hidden, never faked
**Impact:** Locks M0–M6 scope; Compose pattern likely skipped (no containers — to confirm)
---

---

## Decided during M1 (2026-10-28)

---
**Decision:** Telemetry probe = one driver's car_data per session; hidden sessions listed with reason in an expander
**Date:** 2026-10-28
**Context:** Picker must hide telemetry-empty sessions without downloading full-grid car_data (~20x bytes)
**Rationale:** Single-driver probe is representative and cached; expander keeps the hide reason visible per brief rule
**Alternatives Rejected:** Full-grid probe (bandwidth-heavy); silent omission (brief requires the reason shown)
**Security Implications:** None — same public endpoint, fewer requests (rate-limit friendly)
**Impact:** `session_has_telemetry()` in `data_loader.py`; M1 picker depends on it
---

## v3 Scope Decisions (2026-11-14)

---
**Decision:** D1 — v3 headline is Strategy engine + Telemetry Lab + grounded AI (V3.1–V3.3); 3D is not an equal headline
**Date:** 2026-11-14
**Context:** v2 can show and answer a historical session; v3 needs depth that is feasible on free data
**Rationale:** These three deepen shipped surfaces (pit wall, duel, inputs, Ask) using cached feeds; 3D is visual but high-risk/effort and does not improve the analysis
**Alternatives Rejected:** 3D/WebGL as an equal headline (kept as a gated stretch, V3.5a)
**Security Implications:** None new; same free historical feeds
**Impact:** V3.1–V3.3 are the committed core; V3.5a is go/no-go only
---

---
**Decision:** D2 — Live timing is out of core; v3 stays strictly historical/free
**Date:** 2026-11-14
**Context:** OpenF1 gates live data behind the €9.90/month sponsor tier; the portfolio must work on demand
**Rationale:** A demo cannot depend on a live session or a paid subscription; historical data is free and complete
**Alternatives Rejected:** Paid live tier as a required path (optional personal demo only, never a dependency)
**Security Implications:** No paid credentials in the repo; API key stays server-side where used
**Impact:** Live sessions remain out of scope in docs/plans
---

---
**Decision:** D3 — AI narration is on-demand by default; proactive narration only behind an explicit opt-in
**Date:** 2026-11-14
**Context:** Always-on narration increases cost and the hallucination surface
**Rationale:** Every AI answer should follow a user action and a server-built fact bundle; cost is bounded by the existing 6/min budget and caching
**Alternatives Rejected:** Always-on proactive key-moment narration
**Security Implications:** Smaller prompt/response surface; no client-supplied facts (see V3.3 contract)
**Impact:** Chat/recap/explain actions only; no background AI calls
---

---
**Decision:** D4 — Track geometry stays GPS-derived from session data; MultiViewer is not a dependency
**Date:** 2026-11-14
**Context:** MultiViewer's circuit endpoint has no documented public SLA and its terms are unclear
**Rationale:** The existing session-derived outline is free, reliable and already tested; a best-effort overlay may be added only with graceful fallback
**Alternatives Rejected:** Hard dependency on MultiViewer/f1-circuits for geometry
**Security Implications:** No third-party licensed assets baked in
**Impact:** V3.2/3D work uses the existing geometry path
---

---
**Decision:** D5 — Jolpica 1950+ archive is not in the v3 core; only a separate, isolated view if the licence posture is accepted
**Date:** 2026-11-14
**Context:** Jolpica data is CC BY-NC-SA 4.0 with share-alike/non-commercial constraints and no telemetry pre-2023
**Rationale:** Mixing an archive into the 2023+ replay core risks licence confusion and scope creep; it can be a separate adapter later
**Alternatives Rejected:** 1950+ archive inside the replay core
**Security Implications:** No bulk redistribution; attribution and non-commercial use required if added
**Impact:** V3.5b is a stretch item behind an explicit go/no-go
---

---
**Decision:** D6 — Demo prewarm set is scripted, not ad hoc: 2026 United States GP, 2024 Suzuka, 2024 Monaco
**Date:** 2026-11-14
**Context:** Cold opening a race takes ~1 minute against the 30 req/min free budget
**Rationale:** Prewarming a small, known set makes a demo feel instant without extra code
**Alternatives Rejected:** No prewarm / ad-hoc opening at demo time
**Security Implications:** None; cache only
**Impact:** Ops action before a public demo; documented in DEPLOYMENT/V3 plan
---

## v3 Stretch Decisions (2026-11-14)

---
**Decision:** D7 — 3D/WebGL replay is a no-go for v3
**Date:** 2026-11-14
**Context:** V3.5a gated on a performance budget and a 2D fallback
**Rationale:** The 2D canvas already holds 60 fps and carries the data; 3D adds a renderer, camera controls and a11y work without making the analysis better. No user request justifies it now.
**Alternatives Rejected:** Three.js scene for v3
**Security Implications:** Avoids a large new dependency surface
**Impact:** 3D stays a future go/no-go, not a v3 promise
**Superseded:** D10 (user requested the optional view; shipped in `v3.5.0`)
---

---
**Decision:** D8 — Jolpica 1950+ archive is a no-go under the current licence posture
**Date:** 2026-11-14
**Context:** V3.5b required accepting CC BY-NC-SA share-alike/attribution and a separate archive surface
**Rationale:** Mixing an archive into a 2023+ replay product adds licence care (share-alike) for no telemetry benefit; the portfolio does not need pre-2023 data.
**Alternatives Rejected:** Jolpica adapter in v3
**Security Implications:** No third-party archive data cached or redistributed
**Impact:** Revisit only if the licence posture is explicitly accepted
**Superseded:** D11 (non-commercial use accepted; shipped `v3.6.0`)
---

---
**Decision:** D9 — Championship progression is deferred, not built
**Date:** 2026-11-14
**Context:** V3.5c could use OpenF1 championship beta endpoints
**Rationale:** A season/standings view is a separate product surface; the beta endpoints are per-session points snapshots, and v3 already covers the race-analysis core. Adding it would dilute the milestone.
**Alternatives Rejected:** Season tab in v3
**Security Implications:** None new
**Impact:** Documented as a future feature; no code
**Superseded:** D11 (shipped `v3.6.0`)
---

## v3.5 3D Decision (2026-11-14)

---
**Decision:** D10 — Ship V3.5a as an optional, lazy 3D view inside Replay
**Date:** 2026-11-14
**Context:** The user asked for a visually pleasing 3D view after D7; the 2D map is still the analytical surface
**Rationale:** A perspective view of the same cars/clock adds visual value without changing the data or the analysis. Keeping it inside Replay avoids a second product surface; lazy loading keeps it out of the main bundle.
**Alternatives Rejected:** Top-level 3D menu (splits replay context); CSS-only 3D (no camera/scene); fabricated elevation/width (violates the honesty rule)
**Security Implications:** three.js is a lazy frontend-only dependency; no new API, key or data source; the chunk is not cached offline
**Impact:** V3.5a shipped in `v3.5.0`; D7 is superseded. V3.5b (Jolpica, D8) and V3.5c (standings, D9) are unchanged
---

## v3.6 Archive Decision (2026-11-15)

---
**Decision:** D11 — Use Jolpica F1 for season standings and the pre-2023 archive
**Date:** 2026-11-15
**Context:** The user asked for standings and a Jolpica archive with missing-data fallbacks; D8/D9 assumed a stricter licence posture
**Rationale:** Jolpica's Terms allow free non-commercial use under CC BY-NC-SA 4.0 with attribution and a custom User-Agent. The app is non-commercial, displays the source/licence, caches responses, and does not redistribute dumps. One adapter serves both the standings tab and the archive.
**Alternatives Rejected:** OpenF1 beta championship endpoints for progression (session-scoped, 2023+ only); scraping; paid archives
**Security Implications:** Server-side only, validated year/round integers, 4/s + 500/h limits, one-hour cache, no key, no user URL passthrough
**Impact:** V3.5b/V3.5c shipped in `v3.6.0`; D8/D9 superseded. Replay telemetry remains OpenF1-only from 2023
---

## v3.7 Freshness / Comparison Decision (2026-11-15)

---
**Decision:** D12 — Show checked time + Refresh, compare selected drivers, and keep archive loading explicit
**Date:** 2026-11-15
**Context:** User feedback on stale-looking archive/standings, missing chart tooltips, blank telemetry, and unexplained controls
**Rationale:** Jolpica is volunteer-maintained and cached for one hour; a visible checked time and bypass make freshness honest. Round tooltips and a selected-driver/head-to-head view turn a busy chart into an auditable comparison. Archive changes clear the old table and show what is loading.
**Alternatives Rejected:** Silent polling (load/rate cost with no visible freshness), hover-only charts, keeping old archive tables during a season switch
**Security Implications:** Refresh respects the existing 4/s + 500/h limiter; no new input surface
**Impact:** v3.7.0; all related docs/screenshots updated
---

## v3.8 Windows / Share Card Decision (2026-11-15)

---
**Decision:** D13 — Make time windows explicit, freeze Battle on demand, and rotate share-card cars
**Date:** 2026-11-15
**Context:** User feedback on the moving Telemetry window, Battle always following replay, mini-sector readability, driver images, and cars falling below the share-card circuit
**Rationale:** A stable window is required for comparison; replay/lap/session scopes cover both live and analytical use. Share the pure resolver, keep Battle's playback untouched, and apply the same geometry rotation to cars as the outline. Driver images are available from OpenF1's `headshot_url` but are hosted by F1, so they stay remote with a number fallback.
**Alternatives Rejected:** Forcing a single fixed window (breaks live use); letting Battle move the main playback (destructive); rehosting headshots (rights/caching risk)
**Security Implications:** No new input surface; headshots are remote and optional
**Impact:** v3.8.0; docs/screenshots/state updated
---

## v3.9 Battle Snapshot Decision (2026-11-15)

---
**Decision:** D14 — Snapshot truncates history, and image state is per driver
**Date:** 2026-11-15
**Context:** Battle snapshot only appeared to change “Battles now”; driver cards showed fallback images after switching drivers
**Rationale:** A point-in-time snapshot must stop historical charts at that point, or it reads as inert. The main playback stays independent. Headshot state keyed only by a boolean leaked across reused cards; keying by driver+URL gives each card its own lifecycle.
**Alternatives Rejected:** Only freezing “Battles now” (confusing); moving the global replay clock (destructive); rehosting headshots (rights/caching)
**Security Implications:** Remote images remain optional and fall back to a number
**Impact:** v3.9.0; docs/screenshots/state updated
---

## v3.10 Report / Download Decision (2026-11-15)

---
**Decision:** D15 — Print-first report and client-side CSV/JSON downloads
**Date:** 2026-11-15
**Context:** User requested scoped AI fixes, stint explanations, a download menu, and a professional per-session report with data and AI modes
**Rationale:** A print-first HTML report keeps one layout, preserves graphics/tables and produces A4 PDFs through the browser without adding a parallel PDF renderer. CSV/JSON keep exports local and honest; CSV is labelled Excel-compatible and limited to one table per file, while JSON bundles several.
**Alternatives Rejected:** jsPDF/ReportLab parallel layout (duplicate design, extra dependency); fake .xlsx files (misleading); server export endpoints (unnecessary data movement)
**Security Implications:** No secrets or new API surface; exports are generated in the browser from already-loaded data
**Impact:** v3.10.0; docs/screenshots/state updated
---

## v3.10.1 Report Polish Decision (2026-11-15)

---
**Decision:** D16 — Make the report the session-wide data surface and print it without app layout
**Date:** 2026-11-15
**Context:** The printable report had an unclosed circuit path, blank lead pages, sparse definitions, and downloads were placed inside Performance even though they covered the whole session
**Rationale:** Session-wide data belongs with the session report. A closed polygon represents the circuit; hiding non-report root siblings removes blank print pages. Measured key takeaways and a glossary make the report readable without F1 expertise; `/ai/report` adds the three-part analysis (what decided it, tyres/pits, caveat) rather than a story alone.
**Alternatives Rejected:** Keeping downloads only in Performance (wrong scope); hiding with visibility only (reserves blank pages); a free-form AI paragraph (insufficient analysis)
**Security Implications:** No new data source; AI remains optional and failure-isolated
**Impact:** v3.10.1; docs/screenshots/state updated
---

## v3.10.3 Download Access / Print Gate Decision (2026-11-15)

---
**Decision:** D17 — Put session downloads in the header and gate printing on AI completion
**Date:** 2026-11-15
**Context:** Downloads were only reachable after opening Report; Print could be pressed while AI analysis was still generating; report pit visits were confused with timed stops
**Rationale:** Session-wide data should be one click from the session header. Printing mid-generation risks an incomplete AI section, so Print/Save PDF is disabled until the analysis resolves or fails. Report cards explicitly distinguish all pit visits from visits with a timed stationary stop.
**Alternatives Rejected:** Leaving downloads only inside Report (hidden); disabling the whole report while AI runs (data report must stay usable); treating unmeasured stops as timed
**Security Implications:** None new; same client-side export and optional AI endpoint
**Impact:** v3.10.3; docs/screenshots/state updated
---

## Decision Template (copy for every new decision)

---
**Decision:** [What was decided]
**Date:** [YYYY-MM-DD]
**Context:** [Why it was needed]
**Rationale:** [Why this option]
**Alternatives Rejected:** [Other options and why not]
**Security Implications:** [Any security impact]
**Impact:** [What it affects downstream]
---
