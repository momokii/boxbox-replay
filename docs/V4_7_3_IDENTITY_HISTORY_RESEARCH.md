# V4.7.3 research — identity mismatch and full event history

**Date:** 2026-11-23  
**Baseline:** `v4.7.2`  
**Target:** `v4.7.3` (patch)

## Problems

1. A hover over Max Verstappen could show Daniel Ricciardo, and another capture
   showed the correct name with a different driver's photo.
2. The live feed shows only four recent reports; there is no way to inspect the
   full race history, including from the result screen.

## Identity mismatch

The original matcher selected OpenF1 media by **driver number alone**:

```ts
driverMedia.find((row) => row.driver_number === Number(driver.number))
```

Driver numbers are not a stable identity across seasons or feeds. A number can
collide while the timing code still identifies the correct person. The hover
card also used the matched media's full name/team as its primary identity, so a
bad match made both name and photo wrong. The image element was reused across
hover targets, which can briefly leave the previous portrait on screen.

## Fix

- Add `matchDriverMedia(driver, media)`:
  - require the number **and** timing code to agree;
  - if the number is missing, require the code;
  - otherwise return `null` rather than borrowing another driver's photo.
- Use the canonical `GameDriver.name/team/code` for the hover/desk/canvas text;
  OpenF1 media is used only for a validated portrait.
- Key the image by URL so React replaces the element.
- Add a unit test where a number collides but the code differs: it must not
  match.

## Event history

`buildRaceFeed` already returns every model event (pole start, leader changes,
largest move per lap, SC/VSC/crash, finish). Only the side panel sliced the last
four.

## Fix

- Add an **All events** button to the live feed, opening a wide modal with
  every event that has happened so far (`t <= elapsed`).
- Add **View all events** to the result screen, opening the full-distance race
  feed.
- Keep the modal labelled as a model feed, not real race control.

## Verification

- Hover VER/SAI/NOR: name, team and portrait URL all agree (no RIC fallback).
- Hover with a conflicting media row: no image is used.
- Live **All events** contains more than four entries as the race evolves.
- Result **View all events** shows the full feed.
- 94 pytest + 109 vitest; desktop/mobile browser checks; no page errors.
