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
