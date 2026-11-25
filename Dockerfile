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
ENV NODE_PATH=/app/node_modules:/usr/local/lib/node_modules

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
  && npm cache clean --force \
  && npm install --global drizzle-kit@0.31.8

COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/shared ./shared
COPY --chown=node:node drizzle.config.ts ./drizzle.config.ts
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint

USER node
EXPOSE 5000

ENTRYPOINT ["docker-entrypoint"]
