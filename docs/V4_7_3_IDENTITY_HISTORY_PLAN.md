# V4.7.3 plan — identity integrity and full event history

**Target:** `v4.7.3`  
**Baseline:** `v4.7.2`

## Phase 1 — identity

- Add `matchDriverMedia` with number + timing-code agreement.
- Use canonical game driver name/team/code in all identity surfaces.
- Use media only for a validated headshot; key the image by URL.
- Add a collision test (wrong code at the same number must not match).
- E2E hover VER/SAI/NOR and compare text plus image URL.

## Phase 2 — history

- Add **All events** to the live feed.
- Add **View all events** to the result.
- Use a shared `RaceFeedModal` with the full model feed; live view filters to
  events already reached, result shows the full distance.
- Label it as simulated history.

## Phase 3 — verification/release

- Refresh screenshots 85/86 (all events, result events), result 57.
- Full tests/build/browser; update README, CLAUDE, architecture/testing,
  screenshots README, closeout, state; commit per progress; tag `v4.7.3`.

## Acceptance

- A driver can never receive another driver's name or photo from a number
  collision.
- The full event history is reachable during the race and after the flag.
- Existing incident expiry, loading feedback and data failure handling remain.

## Shipped

`v4.7.3` shipped on 2026-11-23. Evidence: 94 pytest + 109 vitest, media
number+code collision test, VER/SAI/NOR portrait URL check, live all-events
modal and full-distance result history; screenshots 85/86.
