#!/usr/bin/env bash
# BoxBox Replay one-command setup.
#   ./scripts/setup.sh              -> build + start development stack
#   ./scripts/setup.sh --build-only -> build image only (CI / verify)
#   ./scripts/setup.sh --prod       -> start production stack (asks first)
set -euo pipefail

cd "$(dirname "$0")/.."
MODE="${1:-dev}"
export UID GID="$(id -g)"

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing: $1" >&2; exit 1; }; }
need docker
docker compose version >/dev/null 2>&1 || { echo "missing: docker compose plugin" >&2; exit 1; }

if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
  echo "created .env from .env.example (edit values as needed)"
fi
mkdir -p data/cache

case "$MODE" in
  --build-only)
    docker compose build
    docker compose config >/dev/null
    echo "build + config OK"
    ;;
  --prod)
    echo "About to start the PRODUCTION stack (compose.yaml + compose.prod.yaml)."
    read -r -p "Type YES to continue: " confirm
    [ "$confirm" = "YES" ] || { echo "aborted"; exit 1; }
    docker compose -f compose.yaml -f compose.prod.yaml up -d --build
    echo "prod up: http://localhost:8501"
    ;;
  *)
    docker compose up -d --build
    echo "dev up: http://localhost:8501"
    ;;
esac
