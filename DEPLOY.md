# Deploying CyBridge

The app is a single **Python/FastAPI** process (`backend/app`) that serves both the API
and the built Vite frontend from `dist/`. One build, one start command, one port.

> **Node path:** `server.ts` is retained only for the Google AI Studio applet host, which
> runs Node and cannot run Python. Everywhere else, deploy the Python backend below.

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `PORT` | no | `8000` | Port to listen on. **Injected by most hosts** (Cloud Run, Render, Railway, Fly, Heroku, Replit); the app reads it automatically. |
| `SESSION_SECRET` | **yes in prod** | insecure dev default | Signs the session cookie. Set a long random string, or anyone who knows the default can forge sessions. The server logs a warning if it's missing on an HTTPS deploy. |
| `DEMO_MODE` | no | `false` (off) | When `true`, a bare `userId` is accepted as login (no password). **Leave off/unset in any shared environment** — it is a full authentication bypass. |
| `GEMINI_API_KEY` | no | — | Enables the real Gemini AI copilots. Without it, AI endpoints return deterministic fallbacks. Never commit it; set it in the host's secrets. |
| `GEMINI_TIMEOUT_SECONDS` | no | `120` | Upper bound on a single Gemini call, which is never retried. Raise it if long reports are being cut off (each timeout is logged). Zero, negative or non-numeric values stop startup. |
| `DATABASE_PATH` | no | `capability-hub.db` (cwd) | Path to the SQLite file. Point it at a **mounted, persistent, writable volume** on hosts whose app dir is ephemeral or read-only (see the SQLite note below). |
| `AUTH_RATE_LIMIT_MAX` | no | `30` | Login attempts allowed per IP per 15 minutes. |
| `TRUST_PROXY` | no | `true` | Read the client IP from `X-Forwarded-For`. Set `false` if not behind a proxy. |
| `COOKIE_SAMESITE` | no | `none` on HTTPS, else `lax` | Override the session-cookie SameSite policy. AI Studio embeds the app in an iframe and needs `none`; a **standalone** deployment can set `lax` for stricter CSRF protection. |
| `APP_URL` | no | — | Public HTTPS URL of the deploy. Used as an HTTPS signal for cookie flags and for self-referential links. |

## Build and run (any host)

The frontend is built once with Node; the runtime is Python only.

```bash
npm ci && npm run build                      # -> dist/ (SPA assets)
pip install -r backend/requirements.txt
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

The server listens on `$PORT` (default 8000) at `0.0.0.0` and serves the SPA from `dist/`
at the same origin. Health check: `GET /api/health`.

The database is created and seeded automatically on first boot - no migration step.

## Docker (works on any container platform)

```bash
docker build -t cybridge .
docker run -p 8000:8000 \
  -e SESSION_SECRET="$(openssl rand -hex 32)" \
  -e GEMINI_API_KEY=your-key \
  -v cybridge-data:/app/data \
  cybridge
```

The image builds the frontend with Node in one stage and runs FastAPI in the next, so no
Node is present at runtime. The volume keeps the SQLite file across restarts.

## Platform notes

- **Render / Railway / Fly.io / any container host** — build from the bundled
  `Dockerfile`, health-check path `/api/health`. `PORT` is injected. Set `SESSION_SECRET`
  and `GEMINI_API_KEY` in the dashboard, and mount a volume at `/app/data` so the database
  survives redeploys. Not framed, so `COOKIE_SAMESITE=lax` is recommended.
- **Plain VM** — the three commands under *Build and run*, behind nginx or Caddy.
- **Google AI Studio** — **cannot run Python.** That host runs the Node path
  (`server.ts`) only. It is the one target the Python backend does not serve; see the
  Architecture Decision in `AGENTS.md`.

## SQLite persistence caveat

The database is a single SQLite file. On platforms with an **ephemeral filesystem**
(most PaaS free tiers, Cloud Run without a volume) it resets on every restart or redeploy.
For a demo that is fine — the schema and seed data (including the computed Skill-vs-Will
signals) are recreated on boot from `backend/app/schema_sql.py` and `backend/seed/seed.json`. For anything durable, mount a persistent
volume and point `DATABASE_PATH` at it, or migrate to a networked database.

## Not needed at runtime

`server.ts`, `server-db.ts` and `node_modules/` are **not** in the runtime image. Node is
used only to build the frontend; the container that ships runs Python alone.
