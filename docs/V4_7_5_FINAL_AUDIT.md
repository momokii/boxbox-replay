# V4.7.5 final audit — standards, spec and end-to-end

**Fixed point:** `v3.13.0` (start of v4)  
**Audit HEAD:** `v4.7.4` plus the memo/expiry fixes in this patch  
**Spec:** `docs/V4_PLAN.md`, `docs/V4_4_GRID_RACE_PLAN.md`,
`docs/V4_5_GRID_EXPERIENCE_PLAN.md`, `docs/V4_6_GRID_RACE_DEPTH_PLAN.md`,
`docs/V4_7_GRID_INTERACTIVE_PLAN.md`, `docs/V4_7_1_GRID_REFINEMENT_PLAN.md`,
`docs/V4_7_2_INCIDENT_LIFECYCLE_PLAN.md`,
`docs/V4_7_3_IDENTITY_HISTORY_PLAN.md`,
`docs/V4_7_4_SCROLLBARS_IMAGES_PLAN.md`
**Standards:** `.claude/CODING_STANDARDS.md`, `.claude/AGENT_RULES.md`,
`CONTRIBUTING.md`, plus the Fowler smell baseline.

## Standards

### Hard violations

None found in the audited v4 Grid changes.

### Findings fixed in this pass

1. **Repeated expensive computation (performance, judgement).**
   `buildRaceFeed` ran on every animation frame in `GameRace` and every result
   render. It calls `raceState` once per lap. Wrapped the race feed in
   `useMemo` keyed by `sim/drivers`; result feed likewise.
2. **Incident visible at the chequered flag (behaviour edge).**
   `activeRaceEvent` could still be inside its window at the finish. Added
   `visibleRaceEvent`, which returns `null` at the finish, so the banner,
   track overlay and crash ring cannot decorate the result transition. The
   event remains in history.

### Judgement calls not changed

- `GameView.tsx` is large and has repeated table-row hover wiring across setup,
  qualifying, grid and order. It is a candidate for extraction into shared
  primitives, but the current behavior is covered by E2E; a broad refactor is
  out of scope for a final audit.
- `GameCard` computes lap-led at lap boundaries rather than using exact car
  crossing times; that is the same model granularity as the live order and is
  documented.

## Spec

All audited requirements are implemented:

- v4 replay truth: exits, not-on-track rail, schematic pit guide, 3D cameras,
  kerbs/start, zoom/fit, minimap.
- Grid: real circuits/standings, 1–4 players, 3/5/10 laps, two seeded attempts,
  five-light start, 20 s/lap, order strip, driver desk/modal, zoom/pan/angle,
  incidents, active windows, event history, identity hover, loading feedback,
  result image.
- Data contract: bounded standings/timeout/Retry, optional bounded headshots,
  no fabricated values.
- Search/archive/report/download surfaces remain in the v4 build.

No missing spec requirement was found in this pass.

## End-to-end evidence

| Flow | Result |
|---|---|
| 2026 Canadian Grand Prix | replay loaded; 3D Follow loaded (`3D REPLAY · FOLLOW`); Archive opened with results |
| Grid setup | 25 drivers loaded; VER hover: Max Verstappen, Red Bull, portrait URL; no page errors |
| Race | VSC banner + PLAYBACK SLOWED; after 5 s banner 0, current feed GREEN “No active incident”; history retained |
| Result | winner rendered; View all events opened 10-row full feed |
| 2024 Baku | VER/RIC/PER/SAI portraits all matched correct URLs after code-first matching |
| Scrollbars | themed scrollbar color computed; no native arrow screenshot |
| Mobile Grid | no horizontal overflow, order before feed/desk, modal/loading states checked |
| Data failure | bounded 503 + Retry; headshot failure falls back to number |
| Browser errors | none |

## Verification

- **94 pytest passed**
- **109 vitest passed** across 23 files
- ruff clean
- `tsc -b` exit 0
- `npm run build` exit 0
- production `web/dist` served and `/api/healthz` OK

## Remaining honest limits

The Grid is a seeded game, not a prediction; incident windows are playback
choices; the live feed is model-derived; no tyre/pit/collision physics; missing
portraits fall back to numbers. These are stated in the README and closeouts,
not audit failures.
