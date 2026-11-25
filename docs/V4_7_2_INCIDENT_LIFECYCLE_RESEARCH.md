# V4.7.2 research — incident lifetime and loading feedback

**Date:** 2026-11-23  
**Baseline:** `v4.7.1`  
**Target:** `v4.7.2` (patch)

## Problems

1. The setup/roster can wait a long time on data with only text; the user asks
   for visible, dynamic loading feedback across the Grid.
2. Incidents never leave the screen:
   - a crash ring and red banner remain until another event;
   - a VSC/SC orange/yellow circuit remains until another event;
   - the final race can still show SC.

## Cause

`GameRace` previously computed:

```ts
const latestEvent = p.sim.events
  .filter((event) => event.t <= elapsed)
  .sort((a, b) => b.t - a.t)[0] ?? null;
```

That is the latest **historical** event, not the latest **active** event. It
was passed to the event banner, the live feed's current card and `GameCanvas`.
The canvas drew its incident spotlight from that value forever. The feed's
history should remain, but the active incident must expire.

Loading had text (`Loading the table…`, `Building circuit…`) but no animated
indicator in the Grid. The app's replay screen already has a loading card/bar;
the Grid did not reuse that vocabulary.

## Fix

- Define `RACE_EVENT_ACTIVE_SECONDS`: SC 12, VSC 8, crash 6 model seconds.
- `activeRaceEvent(events, elapsed)` returns only an event inside its active
  window. Use it for the banner, feed current card, playback slowdown and
  canvas spotlight.
- Keep `buildRaceFeed` history unchanged, so the report remains after the
  incident clears. After the window the current card says “No active incident”.
- Add a Grid loading bar, spinner and skeleton rows while standings are
  pending; show the spinner inside “Building circuit…”; add a top indeterminate
  progress bar for any Grid loading state. Respect reduced motion.

## Verification

- At an incident time the banner/circuit highlight exists; after its window it
  is gone while the feed history still contains the report.
- A race can finish with no active SC.
- Loading screenshot shows spinner + skeleton + bar; it clears after data.
- 94 pytest + 108 vitest; desktop/mobile E2E; no page errors.
