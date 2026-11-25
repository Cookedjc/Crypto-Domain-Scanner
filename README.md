This is a hosted App on Replit that uses OpenSSL to discover cryptographic elements on any external domain and port
<img width="4032" height="497" alt="Mermaid-preview" src="https://github.com/user-attachments/assets/2ec8972c-9295-403a-be1e-a7e7e1b3e55a" />

## Run with Docker

Docker Compose runs the app and PostgreSQL as separate containers. Docker Engine
and the Docker Compose plugin must be installed.

1. Copy `.env.example` to `.env`.
2. Generate two secrets and use them to replace the example values in `.env`:

   ```sh
   openssl rand -hex 24
   openssl rand -hex 32
   ```

   Use the first value for `POSTGRES_PASSWORD` and the second for
   `SESSION_SECRET`. Keep `.env` private and do not commit it.
3. Build and start the containers:

   ```sh
   docker compose up --build -d
   ```
4. Open `http://localhost:5000` (or the port set by `APP_PORT`).

The app applies the database schema at startup. Back up an existing database
before upgrading; schema changes can require manual review. PostgreSQL data is stored in the
`postgres_data` named volume and survives container recreation. Stop the stack
with `docker compose down`. **To permanently delete the database and all stored
app data**, run `docker compose down -v`.

### First login and access

This creates a **new, empty database**; it does not copy data from Replit.
For a fresh install, create an administrator from the Docker host:

```sh
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
INSERT INTO users (email, display_name, user_type)
VALUES ('admin@example.com', 'Administrator', 'admin')
ON CONFLICT (email) DO NOTHING;
SQL
```

The app's existing authentication intentionally allows administrator login
without a password. **Do not expose this installation to the public internet
without an access-control layer or changes to authentication.** The Compose
file binds the web port to the Docker host's loopback interface only.

OpenSSL is included for scans. Custom scripts requiring additional commands
(including Azure CLI for Azure Key Vault operations) need those tools added to
the image. Files uploaded to `/tmp` are temporary and are not persisted by the
database volume. Configured script output directories are container paths;
mount a host directory if you need those outputs to survive recreation.
