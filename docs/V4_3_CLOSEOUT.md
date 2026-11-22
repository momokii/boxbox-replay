# v4.3 close-out — lap geometry + qualifying visibility

**Release:** `v4.3.0`, a correction of v4.2. No API or data-source change.

## Fixed

### The lap mapping

`GameCanvas` was drawing at `row.progress / sim.laps`, which compressed all five
laps into one circuit. A car at lap 2 of 5 appeared about 20–40% around the
only visible circuit. It now uses `lapFraction(row.progress)` (`progress % 1`):
every lap crosses the whole circuit. The pure helper is covered by a regression
test (`0`, `1`, `2.25`, `4.9`, `5`, negative guard).

### Qualifying is visibly different

- Setup now has an explicit **Run / Skip** segmented choice, not a checkbox.
- The main button says **Run qualifying →** or **Set the seeded grid →**.
- Running opens a live single-flying-lap session: rows reveal in order, a
  progress count/bar is visible, and **Continue to grid** is disabled until the
  session completes.
- Skipping shows **Qualifying skipped. The grid is still modelled.**
- A late calendar response can no longer snap an explicit Grand Prix selection
  back to round 1.

### Grid discoverability

- The race screen now says: “Hover a car for position, pace, gap and race
  mode.”
- Hover card remains: position, player/AI, lap, pace, gap and
  Leading/Attacking/Defending/Clear air.
- No fake km/h; Grid is a time model.

### 3D

Unchanged in this pass, per the user’s request. Follow/Overview/Free, selected
driver telemetry card and schematic pit guide remain as shipped in v4.2.

## Verification

- **93 pytest + 94 vitest** (22 files); the frontend count includes the new
  lap-fraction regression test.
- `ruff`, `tsc`, Vite build.
- Browser:
  - Canada Grid → live qualifying (15/25 mid-session) → complete → grid →
    race → result;
  - lap 2/5 shows the field on the circuit; lap strip advances;
  - skip path shows `Qualifying skipped`;
  - hover card with pace/gap/mode;
  - selected header is **Canadian Grand Prix**, not round 1;
  - no page errors.
- Screenshots 53, 55, 56, 57, 62, 63 updated/added.

## Limits

- Grid remains 2023–2026, local, final/current standings, 64% driver + 36%
  team + seeded variation.
- Qualifying is one simulated flying lap; not Q1/Q2/Q3.
- No tyre, pit-stop, collision or reliability model.
- No Grid km/h; pace is the honest speed readout.
