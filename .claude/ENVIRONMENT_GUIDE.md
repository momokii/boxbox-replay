# .claude/ENVIRONMENT_GUIDE.md — Dev / Staging / Prod Discipline

> On-demand reference. Self-updates with real commands once the stack exists.

## Environment Definitions

| Environment   | Purpose                  | Characteristics                                              |
|---------------|--------------------------|--------------------------------------------------------------|
| `development` | Local development        | Debug on, verbose logs, hot reload, mock or sandbox services |
| `staging`     | Pre-production validation| Production-like config, sandboxed real services, debug off  |
| `production`  | Live system              | Debug off, minimal logs, hardened config, real secrets       |

`APP_ENV` selects behavior (`development|staging|production`). The app must fail
closed: missing or unknown `APP_ENV` applies production-safe defaults (debug off).

## Agent Behavior

- **development:** verbose logging allowed; dev tooling and debug ports allowed; seed scripts and migrations allowed.
- **staging/production:** no destructive operations or migrations without written confirmation; never modify live config or secrets; present a plan before acting; the agent should not hold production credentials at all. If it detects it has them, tell the user.
- **unknown environment:** treat as production for safety.

## Docker Compose Pattern (Compose v2: `docker compose`, not `docker-compose`)

- `compose.yaml`: base definitions, environment-agnostic (no obsolete top-level `version:` key).
- `compose.override.yaml`: development overrides (hot reload, debug ports, volume mounts); loaded automatically by `docker compose up`.
- `compose.prod.yaml`: production overrides (no source mounts, restart policy, resource limits, no debug ports, pinned image tags); used explicitly.

```bash
# Development (override file loaded automatically)
docker compose up

# Production (explicit -f flags disable automatic override loading)
docker compose -f compose.yaml -f compose.prod.yaml up -d
```

The agent must always ask before running any Compose command that is not clearly
development (`--prod` asks for YES itself). No other compose files exist in this project.

## Verified Commands (M0)

```bash
./scripts/setup.sh              # dev: build + up (http://localhost:8501)
./scripts/setup.sh --build-only # CI/verify: build + compose config check
./scripts/setup.sh --prod       # prod: asks for YES, then -f compose.yaml -f compose.prod.yaml up -d
```

## Environment Files

```text
.env.example      # committed; every variable with placeholder + comment
.env              # never committed; local development values
.env.staging      # never committed
.env.production   # never committed; ideally injected by the deployment platform
```

Development and production dependencies, debug endpoints, seed data, and admin tools
must be absent or disabled in production images and configuration.

> Self-update done (M0): commands above are verified. Staging uses the prod
> files with `APP_ENV=staging` when a staging target exists.
