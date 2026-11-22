# v4 close-out — 3D truth + BoxBox Grid

**Release:** `v4.0.0`. V4 is the final planned major pass for BoxBox Replay
before the project moves to a new build. It is still the same free,
non-commercial historical product; no new paid data source was added.

## Shipped surface

| Area | What v4 adds |
|---|---|
| 3D truth | True relative car/track proportions, a readable low-poly car, kerbs, start/finish, corner/DRS markers, a minimap and Follow / Overview / Free cameras |
| Pit guide | A recorded short pit transit when the feed supports one, otherwise a clearly labelled schematic; the guide is never described as measured width |
| Retirement truth | Final classification plus last-lap evidence produces an exit clock; DNF/DNS/DSQ cars leave the map at the right time and appear in a “Not on track” rail |
| Race control | The latest `/race-control` message is shown as text under the replay; no invented spatial collision marker |
| BoxBox Grid | Local 1–4 player race room, 2023–2026 circuits, real season standings, 3/5/10 laps, run/skip qualifying, seeded grid/race, player badges, live order and result |
| 2D | Wider circuit surface, pit guide, smaller proportional car markers, retirement filtering, status rail |

## Boundaries

- OpenF1 `/location` is approximate and has **no lateral placement**; track
  width is a visual constant. The 3D ribbon is flat (no fake elevation). See
  [`V4_RESEARCH.md`](./V4_RESEARCH.md).
- A recorded pit transit is approximate; a fallback is explicitly labelled
  schematic. The app never claims a measured pit lane.
- Retirements are timed from the last recorded lap, not an official retirement
  timestamp; the feed does not provide one.
- BoxBox Grid supports only **2023–2026** because those seasons have OpenF1
  circuit geometry. Completed seasons use final Jolpica standings; the latest
  season is labelled as the current table.
- BoxBox Grid v1 is a **seeded time model**: 64% driver form + 36% team form,
  with qualifying/race variation. It does not model tyres, pit stops,
  collisions or reliability, and it is not presented as a real-world prediction.
- The AI is unchanged: optional, server-side key only, six requests/minute on
  one shared free allowance, honest 429 when exhausted.

## Verification baseline

- 93 pytest + 93 vitest
- `ruff`, `tsc`, Vite build, CI
- Browser checks at 1440×900 and 390×844:
  - 2026 Canada: five DNFs, one DNS, status rail, recorded pit guide
  - 3D Follow / Overview / Free / day theme / mobile
  - Grid 1-player and 2-player setup, qualifying, race, result, mobile
  - no page errors, no CSP violations
- Production health: `/api/healthz`

Screenshots: `docs/screenshots/49`–`59`. Research/plan:
[`V4_RESEARCH.md`](./V4_RESEARCH.md), [`V4_PLAN.md`](./V4_PLAN.md),
[`V4_RESEARCH_SOURCES.md`](./V4_RESEARCH_SOURCES.md).

## Not shipped

- Metrically measured pit-lane geometry or track elevation.
- Pre-2023 circuit geometry in BoxBox Grid.
- Online multiplayer, accounts, leaderboards or AI race prediction.
- Tyre/pit/collision/reliability simulation in the game.
