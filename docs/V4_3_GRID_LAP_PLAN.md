# V4.3 plan — Grid lap geometry + qualifying visibility

**Target:** `v4.3.0`, a correction of v4.2. No API or data-source change.

## Phase 1 — lap mapping

- Add pure `lapFraction(progress)` to `game.ts`; return `0..1`.
- Use it in `GameCanvas` (`sample(lapFraction(row.progress))`).
- Add a unit test proving 5 laps cross the circuit 5 times, not one.
- Keep the lap strip and `Lap n/N` header.

## Phase 2 — qualifying visibility

- Replace the setup checkbox with **Run qualifying / Skip** segmented controls.
- Change the main button label to match the choice.
- Make `GameQuali` a live session:
  - rows reveal in qualifying order;
  - a progress count/bar;
  - Continue disabled until complete;
  - then “Session complete”.
- Keep skipped mode on the explicit skipped-grid path.

## Phase 3 — discoverability

- Add a visible hover hint on the Grid race screen.
- Keep the pace/gap/mode hover card; no fake km/h.

## Phase 4 — verification and release

- `pytest`, `vitest`, `ruff`, `tsc`, build.
- Browser: checked and unchecked qualifying; 1× and 4×; hover; desktop and
  mobile; lap geometry screenshot at lap 2 vs lap 4.
- Replace affected screenshots, update README/docs/state, commit per phase,
  tag `v4.3.0`.


## Completion status

Shipped as `v4.3.0`. Verification and screenshots are recorded in
[`V4_3_CLOSEOUT.md`](./V4_3_CLOSEOUT.md).

## Completion status

Shipped as `v4.3.0`. Verification and screenshots are recorded in
[`V4_3_CLOSEOUT.md`](./V4_3_CLOSEOUT.md).
