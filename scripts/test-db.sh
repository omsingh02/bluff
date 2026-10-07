#!/usr/bin/env bash
# Runs the database engine tests (tests/db) against a throwaway Postgres 16 in Docker.
# To use your own Postgres instead, export TEST_DATABASE_URL (a SUPERUSER url; each run creates and
# drops its own scratch database) and the Docker step is skipped.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -n "${TEST_DATABASE_URL:-}" ]]; then
  exec npx vitest run tests/db "$@"
fi

command -v docker >/dev/null 2>&1 || {
  echo "docker not found. Install Docker, or set TEST_DATABASE_URL=postgres://postgres:***@host:5432/postgres" >&2
  exit 1
}

NAME="leery-test-pg-$$"
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$NAME" -e POSTGRES_PASSWORD=postgres -p 127.0.0.1::5432 postgres:16-alpine >/dev/null
PORT="$(docker port "$NAME" 5432/tcp | head -1 | sed 's/.*://')"

for _ in $(seq 1 60); do
  docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done

export TEST_DATABASE_URL="postgres://postgres:postgres@127.0.0.1:${PORT}/postgres"
npx vitest run tests/db "$@"
