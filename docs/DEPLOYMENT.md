# Deployment

Two services: `api` (FastAPI :8000, internal except dev) and `web`
(nginx :80, published as `${APP_PORT:-8501}`). `/api/*` on the web service
proxies to the API.

## Environments

| Command | Stack | Notes |
|---|---|---|
| `./scripts/setup.sh` | dev (`compose.yaml` + auto `compose.override.yaml`) | Hot reload, `./data` bind mount, `http://localhost:8501` |
| `./scripts/setup.sh --build-only` | verify only | Build + `compose config` check, no containers |
| `./scripts/setup.sh --prod` | prod (explicit `-f compose.yaml -f compose.prod.yaml`) | Asks for YES; restart policy, 2 CPU/2 GB limits, named cache volume, no source mounts |

Production differences are configuration only (`APP_ENV=production`); same image
shape, no debug ports, no secrets baked in.

## Reaching it over a private network (e.g. Tailscale)

The stack publishes `${APP_PORT:-8501}` on all interfaces, so any device that can
route to the host can open it. On Tailscale, read the host's own address:

```bash
ip -4 addr show tailscale0 | grep -oP 'inet \K[0-9.]+'
# then, from another device on the same tailnet:
#   http://<tailnet-ip>:8501
```

Verify from the host itself:

```bash
curl -sf http://localhost:8501/api/healthz   # -> {"ok":true}
```

If it does not load from another device, check that your Tailnet ACLs allow the
port (default policy allows all between your own devices).

## Operating

```bash
docker compose ps                                    # dev status (api + web)
docker compose -f compose.yaml -f compose.prod.yaml ps   # prod status
docker compose logs --tail=50 app                    # logs
./scripts/setup.sh --prod                            # redeploy (rebuilds)
docker compose -f compose.yaml -f compose.prod.yaml down  # stop prod
```

- Cache lives in `./data` (dev, inspectable) or the `cache` volume (prod).
  Delete it to force a refetch; the app rebuilds it automatically.
- Health: API `HEALTHCHECK` hits `/healthz`; web checks `/`. The app health
  endpoint is `GET /api/healthz` through the proxy. Unhealthy containers show
  in `ps` and should be investigated via logs, not restarted blindly.
- Updates: `git pull`, then re-run setup (rebuilds the image with new pins).
- Never edit `.env` values into chat/logs; `.env` is gitignored and required
  only for local overrides — defaults work without it.


## First run on a new machine

The first time a session is opened, the API fetches its telemetry (about a
minute for a race). Everything is cached under the `cache` volume afterwards.
If you are preparing a demo, open each race once beforehand so the audience only
sees instant loads.

Watch the API logs while a session builds:

```bash
docker compose -f compose.yaml -f compose.prod.yaml logs -f api | grep -E "GET|Error"
```

## If the data feed asks for credentials

OpenF1 has, at times, answered `401` for anonymous historical requests. The app
handles this without failing:

- Cached sessions (parquet under the cache volume) keep playing, including all
  derived panels.
- Anything uncached returns `503` with a plain message; the UI shows it and
  tells you what to set.
- To restore fetching, put a key in `.env` and restart:

```bash
OPENF1_API_KEY=your-key
docker compose -f compose.yaml -f compose.prod.yaml up -d
```

The key is sent as `Authorization: Bearer …` and as `api_key=…`, never logged.


## What a public deployment needs to know

- **One shared cache.** All visitors read the same parquet cache, so the cost of
  a race is paid once, not per visitor.
- **Upstream rate limit.** The app enforces both documented OpenF1 limits
  (3 req/s and 30 req/min) with one bucket and single-flights concurrent builds.
  A busy instance that opens many *new* sessions can still hit the per-minute
  ceiling; the client then sees a clear "feed did not answer" message plus a
  retry. Pre-warming is the mitigation.
- **Pre-warming.** Opening the races you expect people to visit is the cheapest
  way to make a public demo feel instantaneous.
- **OpenF1 needs no key today.** Anonymous access works; `OPENF1_API_KEY` exists
  only so a future credential requirement can be met without a code change.
- **AI is optional and keyed.** The Ask tab and the pit-wall explanation need
  `OPENCODE_API_KEY` (OpenCode Go). Without it they return a plain "AI is not
  configured" message and every other panel keeps working.

### Enabling the AI

```bash
# .env (gitignored)
OPENCODE_BASE_URL=https://opencode.ai/inference/go/openai/v1
OPENCODE_API_KEY=oc_...
OPENCODE_MODEL=deepseek-v4.1-flash
AI_MAX_TOKENS=1200
AI_RATE_PER_MIN=6
```

```bash
docker compose -f compose.yaml -f compose.prod.yaml up -d --force-recreate api
curl -s localhost:8501/api/ai/status   # {"configured":true,"ready":true,...}
```

Without a key, the Ask tab and the pit-wall explanation say so, and the corner
coach falls back to a measured sentence instead of an AI answer. The OpenCode Go
plan also has a monthly usage allowance: when it is exhausted the provider
returns 429, the API maps it to a clear "usage limit reached" response, and the
UI says so. It resets automatically; nothing else stops working.

The key is server-only: the browser calls our API, never the provider. The
server sends the session facts, not the key. Use a dedicated key, keep `.env`
at `chmod 600`, never paste it into an issue or a chat, and rotate it if it has
been exposed. Chat history stays in the visitor's tab (`sessionStorage`), not on
the server.

## Cache behaviour

`web/nginx.conf` serves the HTML entry with `Cache-Control: no-store` and the
hashed files under `/assets/` as `immutable` for a year. A normal reload picks up
a deploy; an already-open tab keeps its old bundle until refreshed.
