# BoxBox Replay — F1 Telemetry Viz + Race Replay + LLM Coach

Fun, free, always-updated F1 web app. Pick any Grand Prix with data (2023+),
choose up to 3 drivers, watch a race replay (track map + speed + gaps), click
any corner for an LLM race-engineer coach, and explore stints, weather, radio,
race control, plus a what-if pit toy model. Facts only — the LLM explains
measured numbers and never invents them.

Dark **Night Pit-Wall** design: charcoal chrome, one amber signal accent,
driver identity in official team colors on lines/dots/labels only, F1-standard
purple/green sector coloring, tabular numbers, 3-decimal times, mono deltas.

## Quickstart

```bash
./scripts/setup.sh              # build + start dev stack -> http://localhost:8501
./scripts/setup.sh --build-only # CI/verify: build + compose config check
./scripts/setup.sh --prod       # production stack (asks for YES first)
```

Dev runs with hot reload (bind mounts) at port 8501. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
for production, updates, and Tailnet access.

## What it does (M0–M7)

- **Chooser + picker**: season → Grand Prix → session → drivers (max 3) → lap
  table. Sessions without telemetry are hidden with the reason shown.
- **Battle**: speed-trace overlay for two laps, signed lap delta (below 0.05s
  is flagged noise), gap-to-leader chart.
- **Replay**: animated track map (5s trails, auto-detected T1..Tn corners,
  data-derived DRS zones in amber), timing tower with live gaps, Play/Pause +
  1x/2x/4x + scrub + Space shortcut, reduce-motion toggle, hover shows
  speed/gear/throttle, synced amber playhead.
- **Coach**: click a corner diamond → measured loss vs reference lap →
  `opencode run` LLM explains in team-radio style with [HIGH/MED/LOW] and a
  "based on lap X vs ref Y" citation. No LLM in an environment = numbers only,
  never fabricated advice.
- **Performance**: tyre degradation slopes, stint timeline (compound colors),
  weather, team radio (audio links — the API has no transcripts, none invented),
  race-control flags.
- **What-if pit wall**: stay-vs-pit on linear deg + traffic check, bannered
  **TOY MODEL**, grounded in live pace/deg/gaps.

## Data (free, auto-updating, no auth)

- **OpenF1** (`https://api.openf1.org/v1`, primary): car data 3.7Hz,
  positions, laps, intervals, stints, weather, radio, race control. Historical
  since 2023; ~3 req/s respected with throttle + retry; 404 means "no data"
  and renders as empty, never a crash. Parquet cache in `data/cache/`.
- **Jolpica Ergast memory** (schedule/results context).

## Testing

```bash
pytest                          # 41 unit tests, all HTTP mocked
ruff check .                    # lint (line-length 100)
.venv/bin/python scripts/smoke_app.py   # headless end-to-end (needs network)
docker compose up -d --build && curl -sf localhost:8501/_stcore/health
```

One milestone = one commit (`feat(mX): ...`); tests + ruff green before every commit.

## Project layout

```
app.py                 Streamlit entry (pickers, battle, replay, coach, performance, pit)
data_loader.py         OpenF1 fetch: throttle/retry/parquet cache + list_* + telemetry feeds
analysis.py            Pure analysis: best lap, deltas, corners, deg slope, pit toy model
viz.py                 Plotly builders (Pit-Wall theme, amber playhead)
coach.py               Grounded LLM prompts + team-radio rendering
scripts/setup.sh       One-command dev/prod setup
scripts/smoke_app.py   Headless AppTest smoke (sparse + rich paths)
compose.yaml / compose.override.yaml / compose.prod.yaml   dev/prod Docker
.github/workflows/ci.yml   pytest + ruff + gitleaks + pip-audit + Trivy
```

## Configuration

Copy `.env.example` to `.env` (setup script does it). All variables documented
there. `APP_ENV`: `development` | `staging` | `production` (fail-closed to
production-safe defaults). `BOXBOX_MODEL` optionally overrides the coach model;
auth uses your existing opencode setup — never keys in the repo.

## Security notes

- No secrets in code, logs, fixtures, or history (gitleaks in pre-commit + CI).
- Pinned requirements, pip-audit in CI, non-root container, `no-new-privileges`.
- See `.claude/SECURITY_STANDARDS.md` for the full standard incl. the Security Gate.
