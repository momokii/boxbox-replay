# V3.11 — Cold replay loads and session switching

## What is slow

A cold replay calls `/location` once per driver. OpenF1's documented free
budget is **3 requests/second and 30 requests/minute**, and the bulk
`/location?session_key=...` request is rejected by the upstream as “too much
data at once” (verified). Twenty drivers therefore cost roughly 40 seconds of
mandatory budget even before network latency; the full build can approach a
minute. That is a **cold-cache/rate-limit cost**, not general internet speed.

The other problem is switching. The UI starts the next session while the
previous per-driver build is still running/queued against the same limiter. The
old request no longer renders, but it keeps consuming the budget and the new
session waits behind it. That is why Baku → Austria could feel stuck.

## Decision

1. Expose **build progress** for the active replay: driver count, elapsed time,
   and whether it is still building. Loading copy should name the OpenF1
   rate-limit reason and show progress instead of a generic indefinite bar.
2. Add an explicit **cancel** for the previous session build when switching.
   Cancellation stops the driver loop before the next request; already-cached
   per-driver location files remain reusable. The old HTTP response is ignored
   by the client because its key is no longer current.
3. Keep the existing parquet caches and the 30/min limiter; do not raise the
   upstream budget.
4. Tests: build progress/cancel at the data-loader seam; API status/cancel
   contract; browser check that switching shows progress and does not leave the
   new session waiting behind the old build.

## Sources

1. OpenF1 API docs — `/location` is one driver's positions, with an arbitrary
   origin; the free historical budget is 3 req/s and 30 req/min:
   <https://openf1.org/docs/>
2. Project source — `data_loader.build_session_replay` and
   `ratelimit.TokenBucket` (verified cold path and shared limiter).
