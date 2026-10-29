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

## Tailnet access (this host)

The host's Tailnet IP is `<host>` (check with
`ip -4 addr show tailscale0`). The app publishes `8501:8501` on all interfaces,
so from any device on the same Tailnet:

```text
http://<host>:8501
```

Verify from the host itself:

```bash
curl -sf http://<host>:8501/_stcore/health   # -> ok
```

If it doesn't load from another device, check Tailnet ACLs allow port 8501
between your devices (default policy allows all).

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
