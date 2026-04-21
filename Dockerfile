# ─── Stage 1: Install all dependencies ───────────────────────────────────────
FROM node:20-slim AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --include=dev

# ─── Stage 2: Build client (Vite) + server (esbuild) ─────────────────────────
FROM deps AS build
WORKDIR /app

COPY . .
RUN npm run build

# ─── Stage 3: Production image ────────────────────────────────────────────────
FROM node:20-slim AS production

# Install PostgreSQL (bundled single-container deployment)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      postgresql \
      postgresql-client \
      openssl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Runtime environment ────────────────────────────────────────────────────────
ENV NODE_ENV=production
ENV PORT=5000

# PostgreSQL (defaults — override with docker run -e or docker-compose)
ENV PGDATA=/var/lib/postgresql/data
ENV PGUSER=cipherguard
ENV PGPASSWORD=cipherguard
ENV PGDATABASE=cipherguard
ENV PGHOST=localhost
ENV PGPORT=5432
ENV DATABASE_URL=postgresql://cipherguard:cipherguard@localhost:5432/cipherguard

# SESSION_SECRET — auto-generated at container start if not supplied
# Override with:  docker run -e SESSION_SECRET=your-secret ...
ENV SESSION_SECRET=""

# ── Production Node dependencies ──────────────────────────────────────────────
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# ── Build artefacts ───────────────────────────────────────────────────────────
COPY --from=build /app/dist ./dist

# Drizzle schema + config needed for db:push at startup
COPY --from=build /app/shared ./shared
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts

# ── Global CLI tools for schema migration ─────────────────────────────────────
RUN npm install -g drizzle-kit tsx

# ── Entrypoint ────────────────────────────────────────────────────────────────
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# PostgreSQL socket directory
RUN mkdir -p /run/postgresql && chown postgres:postgres /run/postgresql

EXPOSE 5000

# Persist database between container restarts
VOLUME ["/var/lib/postgresql/data"]

ENTRYPOINT ["/docker-entrypoint.sh"]
