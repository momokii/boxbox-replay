# BoxBox Replay

**Replay any Formula 1 race on a pit-wall timing screen — every driver on track, gaps counting down, and an engineer you can ask about any corner.**

Free, no account, no live-timing subscription. Data comes from public archives and is cached locally, so a race you have opened once works offline from your own machine.

![BoxBox Replay — race replay](docs/screenshots/01-replay.png)

<sub>Suzuka 2024, lap 25. Timing tower on the left, circuit and playback in the middle, driver card and engineer on the right.</sub>

## What it does

- **Full-field replay.** All 20+ cars on the circuit at once, moving on the real session clock (lights out to chequered flag). Play, pause, 1×–8×, scrub, or press Space.
- **Timing tower.** Classification order with live gaps, position numbers, and retired cars marked DNF/OUT instead of showing a stale gap.
- **Track map.** Circuit drawn from the session's own telemetry, with corners detected from curvature and DRS zones read from the cars' DRS state.
- **Battle view.** Pick an anchor and up to two challengers: relative gap over the whole session, lap-by-lap pace deltas, pairwise head-to-head, and the overtakes between them.
- **Performance.** Stint timeline with pit-stop notches, wear per stint grouped by driver, lap-time evolution, weather over the race, team radio (audio links), and the full race-control log with search and filters.
- **Driver drill-down.** Click any car or tower row for position, gap, tyre age, result, a five-lap strip, pit stops, overtakes — each opening a full view.
- **Lap times.** Sortable by time or sector (fastest first), filterable by driver, and comparable across any number of drivers.
- **Lap duel.** Two laps race the same circuit, aligned by distance around the lap, with a live delta that starts at 0.000 and closes exactly on the official lap-time difference.
- **Pit strategy toy model.** "Pit now or stay out?" using measured pace and wear, with the breakdown and every assumption shown.
- **Shareable moments.** "Copy link" stores the exact timestamp, so a link reopens the same frame.
- **Dark and light themes**, keyboard shortcuts, reduced-motion support, and a layout that stacks on phones.

| Battle | Performance |
|---|---|
| ![Battle](docs/screenshots/03-battle.png) | ![Performance](docs/screenshots/04-performance.png) |

| Pit wall | Lap times (full view) |
|---|---|
| ![Pit wall](docs/screenshots/05-pit-wall.png) | ![Lap times](docs/screenshots/06-lap-times.png) |

| Lap duel | Light theme |
|---|---|
| ![Lap duel](docs/screenshots/08-duel.png) | ![Light theme](docs/screenshots/02-replay-light.png) |

| Phone | |
|---|---|
| ![Mobile](docs/screenshots/07-mobile.png) | |

## Architecture

```
                 browser (React SPA, TypeScript, hand-drawn canvas)
                ┌───────────────────────────────────────────────────┐
                │ tower · session map · timeline · charts · coach   │
                └───────────────▲───────────────────────────────────┘
                                │  JSON over /api (same origin)
                ┌───────────────┴───────────────────────────────────┐
                │ nginx (serves the built SPA, proxies /api)        │
                └───────────────▲───────────────────────────────────┘
                                │
                ┌───────────────┴───────────────────────────────────┐
                │ FastAPI (api/main.py)                             │
                │  serialises DataFrames → JSON, clamps windows,    │
                │  exposes session/replay, gaps, pit, overtakes …   │
                └───────┬───────────────────────────────┬───────────┘
                        │                               │
        ┌───────────────┴──────────────┐   ┌────────────┴─────────────┐
        │ analysis.py (pure functions) │   │ coach.py (LLM, on ask)   │
        │ corners, deltas, wear, model │   │ opencode run, grounded   │
        └───────────────▲──────────────┘   └────────────┬─────────────┘
                        │                               │
                ┌───────┴───────────────────────────────▼───────────┐
                │ data_loader.py                                    │
                │ 3/s + 30/min bucket · retry · session clamp       │
                │ parquet cache in ./data/cache                     │
                └───────▲───────────────────────────────▲───────────┘
                        │                               │
                ┌───────┴────────┐              ┌───────┴────────────┐
                │ OpenF1 (chief) │              │ local LLM CLI      │
                │ sessions, laps │              │ (optional, on ask) │
                │ location, car… │              └────────────────────┘
                └────────────────┘
```

**How a replay is built.** Selecting a session triggers three stages: the lap
clock (so the timeline, `LAP x/y` and gaps work immediately), the circuit
geometry from one representative lap, then positions for every driver (streamed
in, so cars appear progressively). Car telemetry for the drivers you follow is
fetched on demand. Everything is cached as parquet keyed by session, so the
first visit to a race takes about a minute and every visit after that is instant.

**Playback model.** One shared store owns the clock. The map, timeline and charts
subscribe to it directly and redraw on the animation frame; the heavier page
around them re-renders at ~8 Hz, which keeps playback at 60 fps.

**Honesty rules baked into the code.** Numbers come from the feeds or are
computed from them; when a feed is missing the UI says so and hides the block
rather than inventing a value. Retired cars are classified last. The tower is
ordered by classification gap (what a timing screen shows), not by physical
track order. The pit model prints its inputs and its assumptions.

More detail: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · UI decisions in
[`docs/UI_REDESIGN_V2.md`](docs/UI_REDESIGN_V2.md) · data-source research in
[`docs/UI_RESEARCH.md`](docs/UI_RESEARCH.md).

## Run it

### Docker (recommended)

```bash
cp .env.example .env          # optional: defaults work without it
./scripts/setup.sh            # builds api + web, serves http://localhost:8501
./scripts/setup.sh --prod     # production stack (asks for confirmation)
```

The stack is two containers: `api` (FastAPI, internal port 8000) and `web`
(nginx serving the SPA and proxying `/api`). The dev override hot-reloads the API
and bind-mounts the source; the prod override adds restart policies, resource
limits and `no-new-privileges`.

### Local development

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn api.main:app --reload --port 8000     # API

cd web && npm install && npm run dev                    # SPA on :5173, proxies /api
```

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `APP_ENV` | `development` | `development`, `staging` or `production`; unknown values are treated as production for safety |
| `APP_PORT` | `8501` | Host port for the web container |
| `OPENF1_BASE_URL` | `https://api.openf1.org/v1` | Data feed base URL |
| `OPENF1_API_KEY` | empty | Only needed if the feed starts requiring credentials; sent as Bearer and `api_key` |
| `OPENF1_RATE_PER_SEC` | `3` | Request budget, part 1. Raise to `6` only on the sponsor tier |
| `OPENF1_RATE_PER_MIN` | `30` | Request budget, part 2: rolling 60 s window |
| `CACHE_DIR` | `data/cache` | Where parquet caches live |
| `BOXBOX_MODEL` | empty | Optional model override for the coach (`opencode run -m …`) |

Every variable is documented with a placeholder in [`.env.example`](.env.example).
`.env` is gitignored; never commit real values.

## API

| Endpoint | Returns |
|---|---|
| `GET /years` | Seasons with data |
| `GET /meetings?year=` | Grands Prix for a season |
| `GET /sessions?year=&meeting_key=` | Sessions for a meeting |
| `GET /sessions/status?keys=` | Telemetry availability per session |
| `GET /drivers?session_key=` | Entry list |
| `GET /session/info` | Session clock, race distance, entry count |
| `GET /session/geometry` | Circuit outline, corners, DRS zones, rotation |
| `GET /session/replay` | Every driver's positions, sampled; lap markers |
| `GET /session/gaps` | Gaps to leader (live intervals, else derived from lap times) |
| `GET /session/speed?driver_number=` | One driver's speed for the session |
| `GET /session/duel?a_driver=&a_lap=&b_driver=&b_lap=` | Two laps aligned by distance: traces plus the time delta at equal progress |
| `GET /session/pit` · `/overtakes` · `/result` · `/positions` | Stops, passes, classification, official order |
| `GET /laps`, `/stints`, `/weather`, `/radio`, `/race-control` | Session feeds |
| `POST /corner-loss` | Measured time lost at a corner vs a reference lap |
| `POST /coach/ask` | Grounded engineer answer (or an honest "unavailable") |
| `POST /pit-call` | Toy pit-strategy comparison |

`GET /api/healthz` is the health probe. Full shapes are in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#api).

## Quality gates

```bash
pytest                       # 54 Python tests, all HTTP mocked
ruff check .                 # lint
cd web && npm test           # 45 frontend tests (vitest)
cd web && npm run build      # tsc type check + bundle
docker compose build         # image build
```

CI runs both stacks on every push — `ruff`, `pytest`, `npm test`, `tsc`, `oxlint`
and `vite build` — plus a secret scan (gitleaks), dependency audits (`pip-audit`,
`npm audit`) and an advisory container scan (Trivy). See
`.github/workflows/ci.yml`. Containers run as a non-root user with
`no-new-privileges` in production.

## Project layout

```
api/main.py          FastAPI: endpoints, JSON serialisation, error mapping
data_loader.py       OpenF1 client: throttle, retry, clamp, parquet cache
analysis.py          Pure math: corners, deltas, wear, positions, pit model
coach.py             Grounded LLM prompts and radio-style rendering
web/src/             React SPA: api client, playback store, canvas map,
                     charts, panels, modals
scripts/setup.sh     One-command dev/prod stack
docs/                Architecture, deployment, design notes, screenshots
Dockerfile           API image (non-root, healthcheck)
web/Dockerfile       Multi-stage SPA build → nginx
compose*.yaml        base / dev override / prod override
```

## Data sources and limits

- **[OpenF1](https://openf1.org)** — sessions, laps, positions, car telemetry,
  intervals, stints, weather, radio, race control, pit stops, overtakes,
  results. Anonymous access is rate-limited; this app enforces both documented
  limits (3 req/s and 30 req/min) with one bucket, single-flights concurrent
  builds, and caches every response to disk.
- **[Jolpica (Ergast)](https://api.jolpi.ca/ergast/)** — historical schedule and
  results context.

Known limitations, stated plainly:

- **First open of a race takes ~1 minute** (dozens of telemetry requests), then
  it is served from cache. Popular sessions can be pre-warmed by opening them.
- **OpenF1 availability.** If the feed rate-limits or blocks a client, uncached
  sessions show a clear message and cached ones keep working. If it begins
  requiring credentials, set `OPENF1_API_KEY`.
- **Corners are detected**, not official: labels T1…Tn come from curvature, so
  they are indicative rather than FIA numbering.
- **The pit model is a toy**, and says so: linear wear, static rivals, a pit
  loss you choose.
- **No live timing.** Historical sessions only (a day behind at the earliest),
  because OpenF1's live window is paid.

This project is not affiliated with Formula 1, the FIA or any team. OpenF1 is an
unofficial community API.

## Contributing

Issues and pull requests are welcome. Please run the quality gates above before
opening a PR, keep commits focused, and follow the honesty rule: never fabricate
a number the feeds do not provide — show an empty state instead.

## License

[MIT](LICENSE) © 2026 Kelana Chandra Helyandika — use it, fork it, learn from it.
Data belongs to its sources; see the credits above.
