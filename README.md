# BoxBox Replay — F1 Telemetry Viz + Race Replay + LLM Coach

Fun, free, always-updated F1 web app. Pick any Grand Prix with data (2023+),
watch the **full-field replay** (canvas track map + speed + gaps), highlight any
drivers you like, dig into battle/performance/pit panels, and ask the LLM race
engineer about any corner — on trigger, never automatically. Facts only: the
LLM explains measured numbers and never invents them.

Dark **Night Pit-Wall** design: charcoal chrome, one amber signal accent, driver
identity in official team colors on lines/dots/labels only, F1-standard
purple/green sector coloring, tabular numbers, 3-decimal times, mono deltas.

## Stack

- **API**: Python 3.12 + FastAPI over `data_loader` / `analysis` / `coach`
  (throttled, retried, parquet-cached OpenF1 fetch; pure tested analysis)
- **Web**: React + TypeScript + Vite SPA, hand-rolled canvas (60fps map, synced
  traces), no chart library, fully responsive
- **Deploy**: Docker Compose (`api` + `web` behind nginx), one command

## Quickstart

```bash
./scripts/setup.sh              # build + start dev stack -> http://localhost:8501
./scripts/setup.sh --build-only # CI/verify: build + compose config check
./scripts/setup.sh --prod       # production stack (asks for YES first)
```

Dev runs the API with hot reload at `localhost:8000` and serves the web app at
port 8501. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for production,
updates, and Tailnet access. See [docs/UI_RESEARCH.md](docs/UI_RESEARCH.md) for
why this stack replaced the original Streamlit prototype.

## What it does

- **Replay (main)**: the WHOLE session from lights out (e.g. 1:26:08, LAP 26/52),
  all drivers on the map, trails, corner labels and DRS zones derived from
  telemetry. Timeline with lap ticks — click or drag to seek. Play/pause,
  1x–8x, Space, reduce-motion. Click a car to follow it; the tower is ordered by
  live gap. Day/night theme toggle, remembered between visits.
- **Battle** (tab): head-to-head speed overlay for two laps + signed delta
  (below 0.05s is noise).
- **Speed telemetry**: for the drivers you pick, the speed trace of the lap
  under the playhead (labelled), never an unexplained changing set.
- **Performance** (tab): degradation slopes, stint timeline (compound colors),
  weather, team radio (audio links — the API has no transcripts, none invented),
  race-control flags.
- **Pit wall** (tab): what-if model (stay vs pit on linear deg + traffic check),
  bannered **TOY MODEL**, grounded in live pace/deg/gaps.
- **Race engineer** (side panel): click a corner, press **Ask engineer** —
  measured corner loss vs a reference lap, LLM answer in team-radio style with
  [HIGH/MED/LOW] and a "based on lap X vs ref Y" citation. Cached per query;
  numbers-only fallback when the LLM is unreachable.

## Data (free, auto-updating, no auth)

- **OpenF1** (`https://api.openf1.org/v1`, primary): car data 3.7Hz,
  positions, laps, intervals, stints, weather, radio, race control. Historical
  since 2023; ~3 req/s respected with throttle + retry; 404 means "no data"
  and renders as empty, never a crash. Parquet cache in `data/cache/`.
- **Jolpica Ergast memory** (schedule/results context, Streamlit-era reference).

## Testing

```bash
pytest                          # 49 Python tests, all HTTP mocked
ruff check .                     # lint
cd web && npm test              # vitest (17)
cd web && npm run build         # tsc + vite (type-checks)
docker compose up -d --build    # boot, then curl localhost:8501/api/healthz
```

One milestone = one commit (`feat(rX): ...`); tests + lint + build green before
every commit.

## Project layout

```
api/main.py            FastAPI wrap: feeds, geometry, corner-loss, coach-ask, pit-call
data_loader.py         OpenF1 fetch: throttle/retry/parquet cache + list_* + telemetry feeds
analysis.py            Pure analysis: best lap, deltas, corners, deg, pit toy model
coach.py               Grounded LLM prompts + team-radio rendering
web/src/               React+TS SPA (api.ts, playback store, canvas map/traces/tower, panels)
scripts/setup.sh       One-command dev/prod setup
compose.yaml / compose.override.yaml / compose.prod.yaml   api + web services
.github/workflows/ci.yml   pytest + ruff + gitleaks + pip-audit + Trivy
```

## Configuration

Copy `.env.example` to `.env` (the setup script does it). All variables
documented there. `APP_ENV`: `development` | `staging` | `production`
(fail-closed to production-safe defaults). `BOXBOX_MODEL` optionally overrides
the coach model; auth uses your existing opencode setup — never keys in the repo.

## Security notes

- No secrets in code, logs, fixtures, or history (gitleaks in pre-commit + CI).
- Pinned requirements + lockfile, pip-audit in CI, non-root containers,
  `no-new-privileges`.
- See `.claude/SECURITY_STANDARDS.md` for the full standard incl. the Security Gate.
