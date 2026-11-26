# V4.7.6 wrap-up — AI abuse controls and repository readiness

**Release:** `v4.7.6` (final v4 candidate)  
**Baseline:** `v4.7.5`

## AI rate limits — changed

The previous shared budget **slept** until a slot was free. A burst could hold
API threads and one browser could consume the whole shared allowance. The
following boundaries now apply:

| Boundary | Limit | Behaviour |
|---|---|---|
| Shared provider budget | 1/second, 6/minute | HTTP 429 + `Retry-After`; no sleeping/queueing |
| Per client (`X-Real-IP`) | 3/minute, 20/hour | HTTP 429 + `Retry-After` |
| One chat turn | 1,600 chars | Pydantic `422` |
| Chat request | 1–10 turns | Pydantic `422` |
| Question | 3–400 chars | `422` (existing) |
| nginx request body | 256 KB | proxy `413` before the API |

The guard covers `/ai/chat`, `/ai/explain`, `/ai/pit`, `/ai/report`,
`/ai/recap` and `/coach/ask`. A missing key still returns 503; provider quota
still maps to 429; per-client overflow is distinguishable by the message and
`Retry-After`.

Configuration defaults are in `.env.example`:
`AI_RATE_PER_MIN=6`, `AI_CLIENT_RATE_PER_MIN=3`,
`AI_CLIENT_RATE_PER_HOUR=20`, plus the existing token/timeout caps.

## Code-review axes

### Standards

No hard documented-standard violations found in the v4 diff.

Findings resolved:
- Race/result feeds were recomputed every frame → memoized.
- An incident could remain visible through the finish → `visibleRaceEvent`.
- AI budget was blocking and had no per-client limit → non-blocking shared
  budget + per-client sliding window.
- Chat bodies were only bounded after parsing → schema and nginx limits.

Judgement call, intentionally not changed in a wrap-up patch:
- `GameView.tsx` is still large and repeats some table-row hover wiring. A
  follow-up extraction into `grid/` components is sensible, but a broad refactor
  now would add regression risk to a verified release candidate.

### Spec

All v4.4–v4.7 requirements are present: Grid explainer, two-run qualifying,
start lights, 20 s/lap, driver desk/modal, active incident windows, all-events
history, identity hover, zoom/pan/angle, result image, themed scrollbars,
loading/error states and the v4 replay/3D/archive surfaces.

No missing spec requirement was found.

## Repository readiness

- Tracked files contain no `.env`, cache, coverage, `dist` or `__pycache__`
  artifacts; those are ignored.
- `skills-lock.json` is intentional skill-tool metadata.
- `docs/` preserves per-milestone research/plan/close-out history.
- Generated local caches and the production bundle are not committed.
- Production images are non-root, nginx terminates same-origin API traffic and
  security headers/body limits are configured.

## E2E evidence

- 2026 Canadian GP: replay loads; 3D Follow loads; Archive opens.
- Grid: 25 drivers; identity hover with correct portrait; VSC active/cleared;
  result; full event history.
- 2024 Baku: code-first portraits for VER/RIC/PER/SAI.
- Loading: skeleton/spinner/bar on delayed standings.
- Mobile: no horizontal overflow; order before feed/desk.
- Data failure: bounded 503 + Retry; headshots fallback.
- Browser errors: none.

## Verification

- **97 pytest passed**
- **109 vitest passed** across 23 files
- ruff clean
- `tsc -b` exit 0
- `npm run build` exit 0
- production bundle served and `/api/healthz` OK

## Remaining public-release tasks (user-side)

GitHub Release objects, key rotation and the LinkedIn launch remain external
chores. The application build itself is a verified v4 production candidate.
