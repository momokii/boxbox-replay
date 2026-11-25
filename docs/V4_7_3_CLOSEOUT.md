# V4.7.3 close-out — identity integrity and full event history

**Release:** `v4.7.3`  
**Baseline:** `v4.7.2`

## What fixed

### No more borrowed driver identities

`matchDriverMedia` now requires the OpenF1 **driver number and timing code** to
agree. If the number is missing it requires the code; otherwise it returns
`null`. The hover card, desk and canvas use the canonical game driver name/team/
code, and the headshot is only used after that validation. Images are keyed by
URL so a previous portrait cannot stay on screen.

The regression test uses a colliding number with a different code and asserts
that it does not match.

Verified against 2026 Australia:

- `VER` → Max Verstappen, Red Bull, maxver01 URL;
- `SAI` → Carlos Sainz, Williams, carsai01 URL;
- `NOR` → Lando Norris, McLaren, lannor01 URL.

### Full event history

The live feed still shows the latest four reports, but now has **All events**.
It opens a wide modal containing every model event reached so far. The result
screen has **View all events** with the full-distance feed.

The modal shows lap, text and model time and remains labelled as a
model-derived feed, not real race control.

## Verification

| Check | Evidence |
|---|---|
| API tests | `.venv/bin/python -m pytest` → **94 passed** |
| Web tests | `cd web && npx vitest run` → **23 files, 109 tests passed** |
| Lint/type/build | ruff clean · `tsc -b` exit 0 · `npm run build` exit 0 |
| Hover identity | VER/SAI/NOR names, teams and portrait URLs all agree |
| Collision test | conflicting number/code returns no media |
| All events, live | modal opened with event rows (“Race events so far”) |
| All events, result | full-distance feed opened with 10 rows in the check |
| Existing behavior | incident expiry, loading feedback and data Retry remain |
| Browser errors | none |

## Screenshots

`85-grid-all-events.png`, `86-grid-result-events.png`; `57-grid-result.png`
refreshed for the new result action.

## Honest limits

The event history is model-derived. OpenF1 headshots remain optional; a missing
or mismatched portrait falls back to the driver number, never another driver.
