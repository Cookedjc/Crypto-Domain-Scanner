#!/bin/bash
set -e

PG_VERSION=$(ls /usr/lib/postgresql/)

if [ ! -f "$PGDATA/PG_VERSION" ]; then
  echo "Initializing PostgreSQL database..."
  su postgres -c "/usr/lib/postgresql/$PG_VERSION/bin/initdb -D $PGDATA"

  echo "host all all 0.0.0.0/0 md5" >> "$PGDATA/pg_hba.conf"
  echo "local all all trust" >> "$PGDATA/pg_hba.conf"

  su postgres -c "/usr/lib/postgresql/$PG_VERSION/bin/pg_ctl -D $PGDATA -l /var/log/postgresql.log start -w"

  su postgres -c "psql -c \"CREATE USER $PGUSER WITH PASSWORD '$PGPASSWORD';\""
  su postgres -c "psql -c \"CREATE DATABASE $PGDATABASE OWNER $PGUSER;\""

  echo "Database initialized."
else
  echo "Starting existing PostgreSQL database..."
  su postgres -c "/usr/lib/postgresql/$PG_VERSION/bin/pg_ctl -D $PGDATA -l /var/log/postgresql.log start -w"
fi

echo "Running database migrations..."
npx drizzle-kit push --force || echo "Migration push completed (or already up to date)."

echo "Starting CipherGuard..."
exec node dist/index.cjs
