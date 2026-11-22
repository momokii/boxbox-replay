# Architecture

How a session becomes a replay, where each number comes from, and which
trade-offs were made on purpose. Pairs with the README's diagram.

## Services

| Process | Responsibility | Not responsible for |
|---|---|---|
| `web` (nginx) | Serve the built SPA, proxy `/api`, gzip JSON, mime types | Any data logic |
| `api` (FastAPI) | Validate request params, clamp windows, serialise DataFrames, map upstream errors | Business maths (lives in `analysis.py`) |
| `data_loader.py` | Talk to OpenF1: fetch, retry, session-window clamp, parquet cache | Formatting, aggregation decisions |
| `ratelimit.py` | Enforce the OpenF1 budget (3 req/s and 30 req/min) | Any I/O of its own |
| `analysis.py` | Pure functions: corners, deltas, wear, gap derivation, pit model, duel alignment | I/O |
| `ai.py` | OpenCode Go client: chat, recap, pit explanation, scope guard, budget, cache | Measuring anything; it never computes race numbers |
| `coach.py` | Corner coach: grounded prompt, deterministic fallback; answers via `ai.py` when configured | Measuring anything |

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
                              └─ miss: for each driver → /location (3/s + 30/min, retried)
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
- The telemetry canvas is always mounted with its stage; the draw effect waits
  for data and the `useCanvasSize` hook measures the live element. Its window is
  resolved by `windows.ts` (replay lap / fixed lap / full session).
- Battle can freeze its clock on a replay lap marker; returning to replay resumes
  the normal clock without touching the shared playback store.
- Map hover speed is fetched on demand for the hovered driver and cached;
  failed/empty responses are cached as empty so the card can show `speed —`
  rather than an endless loading label.
- A cold replay is built one driver at a time from `/location`; the free OpenF1
  budget is 30 req/min, so the loader exposes progress and a cancellation flag.
  Switching sessions cancels the stale build; partial replay files are never
  written, but per-driver location caches are reused.
- `SessionReport.tsx` is a print-first A4 report; `@media print` hides app chrome
  and keeps report sections from splitting. AI-enhanced mode calls the
  `/ai/report` three-part analysis, and a failed summary never blocks the data
  tables. The report includes key takeaways and a glossary; its circuit is a
  closed polygon.
- Downloads are session-wide and live in Report: nine tables including
  classification and fastest laps, one dataset per CSV file or a JSON bundle;
  no server export route or secret is involved.
- The share card rotates raw car coordinates by `-(geometry.angle)` before the
  layout transform, matching the already-rotated outline.
- OpenF1's `headshot_url` is an optional remote image (hosted by F1) with a
  number fallback; it is never rehosted.
- Duel draws both complete lap traces plus an inputs chart resampled onto the
  shared distance grid; Battle fetches the current five-second input window for
  its anchor and challengers.
- The 3D view (`Track3D.tsx`) is a lazy-loaded three.js chunk built from the
  same outline and replay positions. V4 uses true relative car/track
  proportions, a low-poly car, kerbs, a checkered start, corner/DRS markers, a
  recorded-or-schematic pit guide and a minimap. **Follow / Overview / Free**
  cameras keep the car readable without pretending the whole circuit is
  car-sized. Overview uses markers at true track scale; Follow shows the car.
  Track width is a visual constant (OpenF1 has no lateral placement) and the
  scene stays flat. WebGL failure falls back to 2D; the chunk is not cached
  offline.
- `retirements.ts` turns DNF/DNS/DSQ rows plus last-lap evidence into replay
  exit clocks. `SessionMap`/`Track3D` hide a car only after its exit; the
  “Not on track” rail keeps the result visible. `pitlane.ts` builds the guide
  from a recorded short transit, or falls back to a labelled schematic.
- `game.ts` is a pure seeded BoxBox Grid engine (form ratings, qualifying,
  race snapshots). `GameView.tsx` loads a real OpenF1 circuit and Jolpica
  standings, drafts 1–4 player drivers, then runs a local 3/5/10-lap race. It
  is a game model, not a prediction; no tyre/pit/collision/reliability claims.
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

## Performance vocabulary

- **Stint**: one continuous run on a tyre set (`lap_start`–`lap_end`).
- **Stop**: a recorded pit visit; `stop_duration` is stationary time.
- **Best stop**: the fastest recorded stationary time, not the full pit-lane
  loss.
- **Overtakes made/lost**: counts from the separate overtakes feed, which may be
  incomplete.

These definitions are shown in the Performance panel and in the printable
report.

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
| `GET /session/replay/status?session_key=` | Local cold-build progress: state, total, done, elapsed_s |
| `POST /session/replay/cancel?session_key=` | Cancel a superseded cold build |
| `GET /session/speed?driver_number=` | 1 Hz speed |
| `GET /session/timeline` | Weather + race-control events normalized to the replay clock; counts and bands |
| `POST /session/telemetry` | Multi-driver traces over a session-time window; channels, not distance alignment (that is `/session/duel`) |
| `POST /session/strategy` | Ranked stay-vs-pit options, break-even, undercut, coverage, assumptions (`strategy.py`) |
| `GET /standings?year=&round=` | Driver + team standings after a round (Jolpica) |
| `GET /standings/progression?year=&round=` | Points after each round (all series) with race context |
| `GET /archive/seasons` · `/archive/{year}/races` · `/archive/{year}/{round}/results` | Results/standings archive through the latest season |
| `GET /ai/status` | `{configured, ready, model}` — never the key |
| `POST /ai/chat` | Multi-turn: last 10 turns, user ≤400 chars, facts in the system message |
| `POST /ai/pit` | Explains a `pit_toy_model` result; the server recomputes the numbers |
| `POST /ai/recap` | Session recap; 503 unconfigured, 502 upstream |
| `GET /session/inputs` | `t[]`, `speed[]`, `throttle[]`, `brake[]`, `gear[]`, `drs[]` over a `t0`/`t1` window (nulls when a channel is absent) |
| `GET /session/duel` | `traces.a/b: [[f,x,y,t]]` (600 points, anchored to official lap duration) + `delta: [[f,dt]]` |
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

## Archive and standings boundary

`jolpica.py` is a separate, read-only adapter for results and season standings. It uses the same cache volume with a one-hour TTL, a custom
`BoxBoxReplay/3.6.0` User-Agent, 4 req/s and 500 req/h limits, and returns empty
lists for absent rounds instead of inventing data. Responses carry a checked
time; the cache TTL is one hour and `refresh=1` bypasses it. The Standings chart
selects series, exposes round/race tooltips and a head-to-head table; the
archive covers every available season through the latest and shows explicit
loading/empty states. The API exposes `/standings`,
`/standings/progression`, `/archive/seasons`, `/archive/{year}/races` and
`/archive/{year}/{round}/results`. The Standings tab maps the selected weekend to
a round by name/date; the Archive is a separate full-screen surface and is
explicitly results-only. Attribution: Jolpica F1, CC BY-NC-SA 4.0.

## Browser security baseline

`nginx.conf` sets a same-origin CSP, `nosniff`, `DENY` framing, a strict
referrer policy and a permissions policy. The CSP allows Google Fonts styles and
the F1 media host for driver headshots, and HTTPS audio for team-radio links;
everything else is same-origin. Headers are included in the document and hashed
asset locations because nginx does not inherit a server-level `add_header` into
a location that defines its own.

## Security and deployment

- No secrets in the repo; `.env` is gitignored and `.env.example` is the
  contract. The optional OpenF1 key is only read from the environment and is
  never logged.
- Containers run as non-root; production adds `no-new-privileges`, resource
  limits and a named cache volume. The API is not published in production (nginx
  proxies it).
- The AI layer calls the configured OpenAI-compatible endpoint server-side;
  unconfigured is `503`, provider quota is `429`, and the UI shows the measured
  numbers plus an honest message.
- CI: ruff + pytest (API), npm test + tsc + oxlint + vite build (web), gitleaks,
  pip-audit and npm audit, plus an advisory Trivy scan of the API image.

## Testing strategy

- `analysis.py` is covered by pure unit tests (corners, lap markers, gap
  derivation, pit summary, overtake counts, rotation of points *and* segments).
- `data_loader.py` tests use a mocked HTTP client: cache hit/miss, empty payloads,
  retry on 429, 404-as-empty, and "never cache an empty replay".
- `jolpica.py` parsing is tested with fixture MRData and mocked fetches, including
  an empty archive round and a missing progression round (never fabricated).
- The SPA tests pure helpers (formatting, sector flags, gap maths, sorting,
  throttling, playback interpolation, 3D ribbon geometry) with vitest.
- UI behaviour is verified with a headless browser during development
  (screenshots + canvas pixel checks + frame-timing measurements); those scripts
  are development tools, not part of CI.

## AI boundary

`api/main.py` builds the facts; `ai.py` only talks to the model. The split keeps
the model away from anything it could get wrong.

- `_ai_facts` compresses the cached session into a few kilobytes: result/order,
  fastest lap, sectors, ideal lap, clean-lap pace, consistency, pit stops, tyre
  plans, overtakes, weather and race control. It reads the session type and
  labels the order accordingly; race-only sections (winner, points, retirements,
  positions, pit stops, overtakes) are omitted for qualifying and practice.
- The system prompt makes the model the app's engineer: full names, no "the
  data"/"the feed" phrasing, no race language in a non-race session, and a
  sentinel (`OUT_OF_SCOPE`) for anything unrelated to the session or F1.
- `api/main.py` prepends a compact `KEY FACTS` line (winner, fastest lap, pit
  count) for races; the prompt treats present sections as authoritative and
  forbids claiming absence when a section exists.
- `POST /ai/chat` sends the session notes in the system message and at most the
  last 10 turns; `/ai/recap` is cached per session; `/ai/pit` recomputes the pit
  model server-side and only asks for an explanation.
- The corner coach (`/coach/ask`) uses the same client: `coach.build_prompt`
  embeds the measured loss, `ai.py` answers it when configured, and
  `coach.fallback_answer` returns a measured sentence when the AI is off. There
  is no local CLI dependency.
- The key is read from `OPENCODE_API_KEY` at process start and never leaves the
  server. Requests carry a custom user agent and a stable
  `x-opencode-session` header; a sliding budget (6/min) and an answer cache
  protect the subscription. Missing key → `503` with a plain message and the
  rest of the app unaffected.
