#!/bin/bash
set -e

# ── Session secret ────────────────────────────────────────────────────────────
if [ -z "$SESSION_SECRET" ]; then
  export SESSION_SECRET=$(openssl rand -hex 32)
  echo "[entrypoint] SESSION_SECRET not set — generated a random value for this run."
  echo "[entrypoint] For persistent sessions across restarts, set SESSION_SECRET explicitly."
fi

# ── PostgreSQL setup ──────────────────────────────────────────────────────────
PG_VERSION=$(ls /usr/lib/postgresql/)
PG_CTL="/usr/lib/postgresql/$PG_VERSION/bin/pg_ctl"
INITDB="/usr/lib/postgresql/$PG_VERSION/bin/initdb"

if [ ! -f "$PGDATA/PG_VERSION" ]; then
  echo "[entrypoint] Initializing PostgreSQL data directory..."
  su postgres -c "$INITDB -D $PGDATA"

  # Allow password auth from all hosts, trust local socket
  echo "host  all  all  0.0.0.0/0  md5"  >> "$PGDATA/pg_hba.conf"
  echo "local all  all             trust" >> "$PGDATA/pg_hba.conf"

  su postgres -c "$PG_CTL -D $PGDATA -l /var/log/postgresql.log start -w"

  echo "[entrypoint] Creating database user and database..."
  su postgres -c "psql -c \"CREATE USER $PGUSER WITH PASSWORD '$PGPASSWORD';\""
  su postgres -c "psql -c \"CREATE DATABASE $PGDATABASE OWNER $PGUSER;\""
  echo "[entrypoint] Database initialised."
else
  echo "[entrypoint] Starting existing PostgreSQL database..."
  su postgres -c "$PG_CTL -D $PGDATA -l /var/log/postgresql.log start -w"
fi

# ── Database schema migration ─────────────────────────────────────────────────
echo "[entrypoint] Applying schema migrations (drizzle-kit push)..."
npx drizzle-kit push --force && echo "[entrypoint] Schema up to date." \
  || echo "[entrypoint] WARNING: Schema push failed — continuing anyway."

# ── Start application ─────────────────────────────────────────────────────────
echo "[entrypoint] Starting CipherGuard on port $PORT..."
exec node dist/index.cjs
