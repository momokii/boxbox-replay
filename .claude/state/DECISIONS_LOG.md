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
