FROM node:20-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --include=dev

FROM deps AS build
COPY . .
RUN npm run build

FROM node:20-slim AS production

RUN apt-get update && \
    apt-get install -y --no-install-recommends postgresql postgresql-client && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000
ENV PGDATA=/var/lib/postgresql/data
ENV PGUSER=cipherguard
ENV PGPASSWORD=cipherguard
ENV PGDATABASE=cipherguard
ENV PGHOST=localhost
ENV PGPORT=5432
ENV DATABASE_URL=postgresql://cipherguard:cipherguard@localhost:5432/cipherguard

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/shared ./shared
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules/.drizzle ./node_modules/.drizzle

RUN npm install -g drizzle-kit tsx

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

RUN mkdir -p /run/postgresql && chown postgres:postgres /run/postgresql

EXPOSE 5000

VOLUME ["/var/lib/postgresql/data"]

ENTRYPOINT ["/docker-entrypoint.sh"]
