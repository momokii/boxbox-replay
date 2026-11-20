# V3.12 — Hover-card speed loading

## What was wrong

The replay hover card calls `hoverInfo(driver)` from the shared `speedByDriver`
map. Speed was prefetched only for the followed drivers, the selected driver,
or the default leader. Hovering any other car therefore found no entry and the
card permanently said “speed loading…”, even though no request existed.

## Decision

- Fetch speed for the hovered driver on demand, once per driver/session, and
  cache it in the existing map.
- Keep a separate `speedLoading` flag so the card can distinguish:
  - **loading** — request in flight;
  - **speed —** — request completed with no speed samples;
  - **NNN km/h** — a measured value.
- Cache an empty result after a failed/empty response so hovering does not keep
  hammering OpenF1.
- Do not prefetch all drivers: that would spend the 30 req/min budget on cars
  the user only passes over.

## Implementation

`SessionMap` reports the hovered driver to App. App requests
`/session/speed?session_key=&driver_number=` only when the speed map has no
entry, stores the result (including an empty series), and passes `speedLoading`
to the card. This complements v3.11's replay-build cancel/progress work.

## Sources

1. OpenF1 API docs — `/car_data` speed samples are per driver:
   <https://openf1.org/docs/>
2. This repo — `App.tsx` hoverInfo/speedByDriver, `SessionMap` HoverCard.
