# syntax=docker/dockerfile:1
#
# Portable container image for the CyBridge Node/Express + Vite app.
# Works on any container host (Cloud Run, Render, Railway, Fly.io, a plain VM, ...).
# The platform provides $PORT at runtime; see DEPLOY.md for the full env contract.

# ---- Build stage: install all deps and produce dist/ ----
FROM node:20-bookworm-slim AS build
WORKDIR /app

# better-sqlite3 is a native module. It ships prebuilt binaries, but keep a toolchain
# available so `npm ci` can still compile from source if no prebuild matches this
# platform/Node combination.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Runtime stage: only what the server needs to run ----
# Same base image as the build stage, so the compiled better-sqlite3 binary is compatible.
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
# Drop dev dependencies without recompiling the native module we just copied.
RUN npm prune --omit=dev

# Documentation only - the real port comes from $PORT at runtime; 3000 is the local default.
EXPOSE 3000

# Container-level health check against the app's own probe.
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.cjs"]
