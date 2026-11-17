# V3.9 — Battle snapshot semantics and driver-image state

**Question.** Why did Battle's lap snapshot appear to change only “Battles now”,
why did every driver sometimes show the number fallback, and is the share card
now correct?

## 1. What a lap snapshot should mean

The Battle tab has two kinds of content:

- **Now content:** Battles now, anchor/challenger gaps, current inputs.
- **History content:** relative gap over the session, lap pace vs anchor,
  overtakes.

Freezing only the first kind makes the control look inert: the historical charts
still span the whole session. The narrow, useful definition is: a snapshot is a
point in time, so history shown in snapshot mode should stop at that point. The
main replay clock must not move.

**Decision.** In Lap snapshot mode:

- all “now” calculations use the selected lap marker;
- the relative-gap chart ends at the snapshot;
- lap-pace rows stop at the snapshot lap;
- overtakes after the snapshot are hidden;
- the full-view lap-pace modal uses the same limit;
- an explicit note says the session charts stop at the snapshot;
- Follow replay restores the full history.

## 2. Driver headshots

OpenF1 documents `headshot_url`; the live response confirms real F1 media URLs.
The first implementation keyed the image-ready state only by a boolean. When a
different driver was selected, the previous “ready” state survived one render,
then the reset effect hid the new image before its `onLoad` could fire; the
number fallback remained. The fix keys ready/failed state by
`driver_number + headshot_url`, so each driver gets its own image lifecycle.

## 3. Share card assessment

The earlier failure was geometric: raw car coordinates were drawn against an
already-rotated circuit outline, so cars fell below the track. The current card
passes `angle` and rotates cars with the same transform. A 1200×630 download was
checked: the cars sit on the circuit. No further layout change is needed.

## Implementation result (v3.9.0)

- Battle snapshot truncates the relative-gap canvas at the marker, filters pace
  rows to the snapshot lap, hides later overtakes and applies the same limit to
  the full-view pace modal. The scope note says the main replay clock/tower are
  unchanged.
- Driver headshot ready/failed state is keyed by `driver_number + headshot_url`;
  switching ANT → STR keeps a real image instead of the number fallback.
- Share card verified at 1200×630 with cars on the circuit.
- Added pure window tests; 89 pytest + 74 vitest.

## Sources

1. OpenF1 `/drivers` documentation and `headshot_url` sample:
   <https://openf1.org/docs/>
2. OpenF1 lap markers / historical data behavior:
   <https://openf1.org/docs/>
3. Existing project geometry: `shareCard.ts` and `analysis.map_plane` (raw cars
   vs rotated outline).
