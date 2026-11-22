# V4.4 plan — Grid race desk, incidents and angles

**Target:** `v4.4.0`. Builds on v4.3. No API or data-source change.

## Phase 1 — explain + fill the card

- Add a visible **How a Grid weekend works** panel to setup:
  - steps: season/race → drivers → qualifying/skip → race/result;
  - exact formula and data provenance;
  - incident disclosure and “not a prediction”.
- Add right-side facts to qualifying summary: pole, pole lap, player, field size.
- Keep mobile stacking.

## Phase 2 — driver desk + compare

- `GameRace` state: `selectedId`, `compareId`.
- Click a car in `GameCanvas` or a row in the order table to select.
- Persistent desk beneath the race:
  - selected driver, team, player/AI, position, lap, gap, pace, last lap,
    race mode, form;
  - compare select + A/B deltas (gap/pace/position).
- Draw a distinct selected ring on the canvas.
- No fake speed; pace is the readout.

## Phase 3 — seeded incidents

- Pure engine additions:
  - `RaceEvent { t, lap, kind: "SC" | "VSC" | "CRASH", driverId? }`;
  - seeded generation in `simulateRace`;
  - SC/VSC time loss applied to that lap;
  - crash sets a retirement clock/lap and removes/classifies the car.
- `raceState` exposes `event`, `retired` state; event ticker in Grid race.
- Add tests for determinism, SC/VSC time loss, crash retirement and result
  classification.

## Phase 4 — circuit angle

- Add `Top / Angle` toggle above the Grid canvas.
- Use one projection function for track, markers, hit map and labels:
  - top: current view;
  - angle: rotated + vertically compressed illustrative view.
- Keep hover/click coordinates correct in both.
- Label it as an illustrative viewing angle, not data.

## Phase 5 — verification/release

- Full pytest/vitest/ruff/tsc/build.
- Browser: setup explainer, qualifying summary, click/compare, event banner,
  angle toggle, 1×/4×, mobile; no page errors.
- Refresh screenshots; README/architecture/testing/closeout/state; commit per
  phase; tag `v4.4.0`.
