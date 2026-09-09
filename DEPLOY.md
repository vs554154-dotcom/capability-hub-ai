# Deploying CyBridge

The app is a single Node.js process: an Express server (`server.ts`) that also serves the
built Vite frontend from `dist/`. One build, one start command, one port. That makes it
portable across AI Studio, container platforms, and plain VMs.

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `PORT` | no | `3000` | Port to listen on. **Injected by most hosts** (Cloud Run, Render, Railway, Fly, Heroku, Replit); the app reads it automatically. |
| `SESSION_SECRET` | **yes in prod** | insecure dev default | Signs the session cookie. Set a long random string, or anyone who knows the default can forge sessions. The server logs a warning if it's missing on an HTTPS deploy. |
| `DEMO_MODE` | no | `false` (off) | When `true`, a bare `userId` is accepted as login (no password). **Leave off/unset in any shared environment** — it is a full authentication bypass. |
| `GEMINI_API_KEY` | no | — | Enables the real Gemini AI copilots. Without it, AI endpoints return deterministic fallbacks. Never commit it; set it in the host's secrets. |
| `DATABASE_PATH` | no | `capability-hub.db` (cwd) | Path to the SQLite file. Point it at a **mounted, persistent, writable volume** on hosts whose app dir is ephemeral or read-only (see the SQLite note below). |
| `NODE_ENV` | prod | — | Set to `production` on deploy: serves the built `dist/` (not the Vite dev server) and enables Secure cookies. |
| `COOKIE_SAMESITE` | no | `none` on HTTPS, else `lax` | Override the session-cookie SameSite policy. AI Studio embeds the app in an iframe and needs `none`; a **standalone** deployment can set `lax` for stricter CSRF protection. |
| `APP_URL` | no | — | Public HTTPS URL of the deploy. Used as an HTTPS signal for cookie flags and for self-referential links. |

## Build and run (any host)

```bash
npm ci
npm run build        # vite build + esbuild -> dist/ (frontend + dist/server.cjs)
NODE_ENV=production node dist/server.cjs
```

The server listens on `$PORT` (or 3000) at `0.0.0.0`. Health check: `GET /api/health` → `{"status":"ok",...}`.

## Docker (works on any container platform)

```bash
docker build -t cybridge .
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e SESSION_SECRET="$(openssl rand -hex 32)" \
  -e GEMINI_API_KEY=your-key \
  cybridge
```

The image binds `$PORT` and ships a `HEALTHCHECK` that hits `/api/health`.

## Platform notes

- **Google AI Studio / Cloud Run** — reads `PORT` and secrets automatically. Keep
  `COOKIE_SAMESITE` unset (defaults to `none`) because the app runs inside an iframe.
- **Render / Railway / Fly.io / Heroku** — build with `npm run build`, start with
  `node dist/server.cjs`, health-check path `/api/health`. `PORT` is injected. Set
  `SESSION_SECRET` (and `GEMINI_API_KEY`) in the dashboard. These are not framed, so
  `COOKIE_SAMESITE=lax` is recommended.
- **Replit / plain VM** — same build/start; set the env vars in the host's config.

## SQLite persistence caveat

The database is a single SQLite file. On platforms with an **ephemeral filesystem**
(most PaaS free tiers, Cloud Run without a volume) it resets on every restart or redeploy.
For a demo that is fine — the schema and seed data (including the computed Skill-vs-Will
signals) are recreated on boot by `server-db.ts`. For anything durable, mount a persistent
volume and point `DATABASE_PATH` at it, or migrate to a networked database.

## Not needed at runtime

The `backend/` directory is a **frozen** Python reference implementation (see
`AGENTS.md`). It is excluded from the Docker image and is not part of any deployment.
