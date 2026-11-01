# Architecture

How a session becomes a replay, where each number comes from, and which
trade-offs were made on purpose. Pairs with the README's diagram.

## Services

| Process | Responsibility | Not responsible for |
|---|---|---|
| `web` (nginx) | Serve the built SPA, proxy `/api`, gzip JSON, mime types | Any data logic |
| `api` (FastAPI) | Validate request params, clamp windows, serialise DataFrames, map upstream errors | Business maths (lives in `analysis.py`) |
| `data_loader.py` | Talk to OpenF1: throttle, retry, session-window clamp, parquet cache | Formatting, aggregation decisions |
| `analysis.py` | Pure functions: corners, deltas, wear, gap derivation, pit model | I/O |
| `coach.py` | Build a grounded prompt, call the local LLM CLI, render a radio card | Measuring anything |

The split is deliberate: everything in `analysis.py` is pure and unit-tested,
the loader is the only component that touches the network, and the API layer only
does transport concerns.

## Request flow

```
browser ── GET /api/session/replay?session_key=9496 ──► nginx ──► FastAPI
                                                                    │
                          data_loader.build_session_replay(key) ◄───┘
                              │
                              ├─ cache hit?  data/cache/by_session_key/9496/session_pos_v2_1hz.parquet
                              └─ miss: for each driver → /location (throttled 3/s, retried)
                                       clamp to [session.date_start, session.date_end]
                                       drop (0,0) placeholders, downsample to 1–2 Hz
                                       write parquet (never an empty one)
```

Responses are plain JSON arrays/objects. Nothing is cached at the HTTP layer:
the parquet cache is the cache, which keeps behaviour obvious and avoids stale
HTTP caches during development.

## Time model

Everything in the UI is **seconds from lights out**, not wall-clock time.

- The origin is the leader's first lap, taken from the lap table (median of the
  per-lap start across cars, forced monotonic).
- Red-flag laps (many times a normal lap) are dropped from the marker set; source
  lap numbers can therefore have gaps, so markers also carry a sequential
  `index` that the UI displays as `LAP x/y`.
- Session windows come from `/sessions` and clamp every telemetry frame, because
  OpenF1 occasionally returns rows outside the session (before the start or a day
  early).
- `positions_end_s` reports where car positions stop when a feed is truncated;
  the timeline shades that region and the UI says the map holds last-known
  positions.

## Geometry

Built from one representative lap: the fastest lap that actually has positions
inside that driver's coverage window.

1. Resample the lap trace uniformly by arc length, in **fractions of lap
   length** — OpenF1 coordinates are not metres (roughly 10×), so every geometry
   threshold is scale-free.
2. Detect corners from heading change over a fixed arc window, with a minimum
   separation of ~1.2% of the lap; aim for a plausible count per circuit
   (Suzuka 18, COTA 22).
3. Read DRS zones from the car's DRS channel (bit 4 set) grouped into contiguous
   runs.
4. Rotate the whole map so the start straight is horizontal, and flip Y for the
   canvas. The same rotation is applied to cars, corners and DRS zones — a
   mismatch here was the cause of an early "cars are off the circuit" bug.

## Classification vs track order

Two feeds disagree by design:

- `/intervals` → `gap_to_leader`, **classification** order (a car that has just
  pitted is classified behind even if it is physically ahead).
- `/position` → **physical track order**.

The timing tower shows classification order, matching the gaps printed beside
it. The position feed is used only as a tie-break when a driver has no gap, and
retired cars (result feed, or no fresh laps) are classified last.

## Playback

- One `Playback` store owns `t`, `dur`, `playing`, `speed`, `calm`.
- The map, timeline, speed strip and charts subscribe and redraw per frame.
- The page around them subscribes through a **trailing-edge throttle** (~8 Hz).
  A drop-if-too-soon throttle was the cause of the "button stuck on Pause" bug:
  the last event of a burst was discarded, so pause never repainted.
- `prefers-reduced-motion` switches the calm mode on by default.

## Caching rules

- Cache keys: `data/cache/<year>/_sessions.parquet`, `_meetings.parquet`, and
  `by_session_key/<key>/<feed>.parquet`.
- Telemetry caches are **versioned** (`session_pos_v2_…`); an old algorithm can
  never be mistaken for current data.
- Empty results are never written, so a transient upstream failure cannot make a
  session permanently "no data". A cache hit is revalidated for emptiness.
- `refresh=1` clears the replay cache for a session and rebuilds.

## API

| Method & path | Notes |
|---|---|
| `GET /years` | 2023 → current year (local computation, no upstream call) |
| `GET /meetings?year=` · `/sessions?year=&meeting_key=` | Cached session list, joined with meeting names |
| `GET /sessions/status?keys=1,2` | One-driver telemetry probe per session |
| `GET /drivers?session_key=` | Entry list |
| `GET /session/info` | Clock, race distance, driver count, scheduled window |
| `GET /session/geometry` | `outline[]`, `corners[]`, `zones[]`, `angle` |
| `GET /session/replay` | `drivers[{driver_number,t[],x[],y[]}]`, `laps[]`, `positions_end_s`, coverage counts |
| `GET /session/speed?driver_number=` | 1 Hz speed |
| `GET /session/gaps` | `source: intervals \| lap_times \| none` + points |
| `GET /session/pit` | `summary[]` (stops, best/total) + `stops[]` |
| `GET /session/overtakes` | `counts[]` + `events[]` |
| `GET /session/result` · `/positions` | Final classification; official order over time |
| `GET /laps` · `/stints` · `/weather` · `/radio` · `/race-control` | Session feeds, all with a session-relative `t` where sensible |
| `POST /corner-loss` | `{session_key, ref, chal, corner}` → measured loss + confidence |
| `POST /coach/ask` | Grounded prompt → `{answer|null, confidence, basis, llm}` |
| `POST /pit-call` | Toy model inputs → totals + recommendation |

Errors: `404` means "this session genuinely has no such data"; `503` means the
upstream feed did not answer (network, rate limit, or credentials) and the client
offers a retry.

## Security and deployment

- No secrets in the repo; `.env` is gitignored and `.env.example` is the
  contract. The optional OpenF1 key is only read from the environment and is
  never logged.
- Containers run as non-root; production adds `no-new-privileges`, resource
  limits and a named cache volume. The API is not published in production (nginx
  proxies it).
- The coach shells out to a local CLI; if it is unavailable the API returns
  `answer: null` and the UI shows the measured numbers only.
- CI: ruff + pytest (API), npm test + tsc + oxlint + vite build (web), gitleaks,
  pip-audit and npm audit, plus an advisory Trivy scan of the API image.

## Testing strategy

- `analysis.py` is covered by pure unit tests (corners, lap markers, gap
  derivation, pit summary, overtake counts, rotation of points *and* segments).
- `data_loader.py` tests use a mocked HTTP client: cache hit/miss, empty payloads,
  retry on 429, 404-as-empty, and "never cache an empty replay".
- The SPA tests pure helpers (formatting, sector flags, gap maths, sorting,
  throttling, playback interpolation) with vitest.
- UI behaviour is verified with a headless browser during development
  (screenshots + canvas pixel checks + frame-timing measurements); those scripts
  are development tools, not part of CI.
