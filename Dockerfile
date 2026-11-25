# Build the Vite client and bundled Express server.
FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Keep the runtime image separate from the build toolchain and database server.
FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
# Schema setup uses the project's locked drizzle-kit and its local dependencies.
RUN npm ci --include=dev && npm cache clean --force

COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/shared ./shared
COPY --chown=node:node drizzle.config.ts ./drizzle.config.ts
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint

USER node
EXPOSE 5000

ENTRYPOINT ["docker-entrypoint"]
