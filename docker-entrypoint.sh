#!/bin/sh
set -eu

: "${DATABASE_URL:?Set DATABASE_URL to a reachable PostgreSQL database}"
: "${SESSION_SECRET:?Set SESSION_SECRET to a long, random value}"

echo "[entrypoint] Applying database schema..."
drizzle-kit push --force

echo "[entrypoint] Starting CipherGuard on port ${PORT:-5000}..."
exec node dist/index.cjs
