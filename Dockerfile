# syntax=docker/dockerfile:1
#
# Portable container image for CyBridge.
# Stage 1 builds the React frontend with Node; stage 2 runs the FastAPI backend,
# which serves that build and the API from a single process. No Node at runtime.
# The platform provides $PORT; see DEPLOY.md for the full env contract.

# ---- Stage 1: build the frontend ----
FROM node:20-bookworm-slim AS frontend
WORKDIR /build
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build            # -> /build/dist (SPA assets)

# ---- Stage 2: Python runtime ----
FROM python:3.12-slim-bookworm AS runtime
WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    NODE_ENV=production

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Application code, its schema/seed, and the frontend built in stage 1.
COPY backend/app ./backend/app
COPY backend/seed ./backend/seed
COPY backend/scripts ./backend/scripts
COPY --from=frontend /build/dist ./dist

# Written on first boot if absent; point DATABASE_PATH at a mounted volume to persist.
ENV DATABASE_PATH=/app/data/capability-hub.db
RUN mkdir -p /app/data

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import os,urllib.request,sys; \
url='http://127.0.0.1:'+os.getenv('PORT','8000')+'/api/health'; \
sys.exit(0 if urllib.request.urlopen(url, timeout=4).status==200 else 1)"

# $PORT is supplied by the host; 8000 is the local default.
CMD ["sh", "-c", "python -m uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
