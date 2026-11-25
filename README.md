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

The app applies the database schema at startup. PostgreSQL data is stored in the
`postgres_data` named volume and survives container recreation. Stop the stack
with `docker compose down`. **To permanently delete the database and all stored
app data**, run `docker compose down -v`.
