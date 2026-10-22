# CyBridge — backend (Python / FastAPI)

The only backend. It serves the API and the built React app from one process, owns
its schema (versioned migrations) and seed, and runs on any Python or container host.
How it works in depth: [`ARCHITECTURE.md`](../ARCHITECTURE.md). Why there is one
backend: the Architecture Decision in [`AGENTS.md`](../AGENTS.md).

## Where this folder must live

`app/config.py` resolves the repo root as `Path(__file__).parents[2]`, so this
folder sits at **`<repo>/backend/`**, alongside `dist/` and the repo-root `.env`.

Configuration comes from the environment and the repo-root `.env`; every setting and
its default is in `.env.example`. `SESSION_SECRET` is worth setting; `DEMO_MODE`
should stay `false` or unset, because `true` makes the server accept a bare `userId`
as proof of identity.

## Running it

```bash
python -m venv backend/.venv
backend/.venv/Scripts/python -m pip install -r backend/requirements.txt   # Windows
python -m uvicorn backend.app.main:app --reload --reload-dir backend/app --port 8000
```

Run from the **repo root**, not from `backend/`. The built frontend is served from
`dist/`, which exists after `npm run build`.

For frontend work, run `npm run dev` as well: Vite serves the app with hot reload on
`:5173` and proxies `/api` to this server, so the browser sees one origin and the
session cookie works unchanged. `API_TARGET` points the proxy elsewhere.

In production add `--workers N` for more CPU cores. Sessions and sign-in rate limits
live in the database, so every worker shares them.

## This backend owns the database

The schema is versioned. On startup `database.py` applies every migration in
`app/migrations.py` newer than the database (the version lives in SQLite's
`PRAGMA user_version`), then seeds any table that is still **empty** from
`seed/seed.json` (306 rows), so a deployment with live data is never overwritten on
restart, and a fresh deployment builds itself.

| Migration | Adds |
|---|---|
| 1 | The baseline in `app/schema_sql.py`: 12 tables, and any column an older database lacks. Databases built by the former Node server upgrade in place. |
| 2 | `sessions`: sign-ins are recorded here and the cookie holds only a session id, so signing out or changing a password ends sessions on the server. |
| 3 | `rate_limits`: sign-in attempt counters shared by every worker. |
| 4 | `eri_snapshots`: one Enterprise Readiness Index reading per day, for its trend. |
| 5 | Data only: corrects one seeded job title, where it is still the original value. |

To change the schema, add a migration; never edit `schema_sql.py` (a test fails if
it changes).

Password hashes are deliberately absent from the seed: a claimed credential is
local state, not seed data. The first sign-in to an account sets its password.
Hashes are bcrypt at cost factor 10; those written by the former Node server's
`bcryptjs` use the same format and still verify.

## Verifying it

```bash
backend/.venv/Scripts/python -m pytest backend/tests                       # no server needed
python backend/scripts/verify_authz_scenarios.py http://localhost:8000      # the gate: 59/59
python backend/scripts/verify_auth.py http://localhost:8000                 # 14 probes
python backend/scripts/verify_ai.py http://localhost:8000                   # AI endpoints
```

**`pytest`** — 96 tests, in-process against an isolated database: object-level
authorization, path traversal, migrations, sessions, rate limits, the readiness
index, and Gemini through the real SDK against a local stand-in.

**`verify_authz_scenarios`** — 59 checks across six scenarios, run against a live
server: employee, manager and leadership features, an employee reaching for manager
data, a manager reaching into another team, user-id manipulation, and anonymous
access. The gate for any backend change.

**`verify_auth`** — 14 probes asserting that authority comes from the session
cookie alone, never from an id in the URL or body: an employee is refused a
manager's team, profile and capability; a manager is refused another manager's;
a bare `userId` login is rejected.

## Gemini

`app/ai.py` wraps the `google-genai` SDK. The client is optional: every AI endpoint
falls back to deterministic, recognisable text on a missing key or a failed call,
returning HTTP 200, because the UI assumes these endpoints always answer. Every call
is bounded by `GEMINI_TIMEOUT_SECONDS` and never retried. `generate_json()` strips
``` fences and recovers the outermost JSON span, because models routinely wrap
structured output in prose.

Set `GEMINI_API_KEY` in the repo-root `.env` to exercise real generation.

## The JSON contract the frontend relies on

**Error shape.** Errors are `{"error": "..."}`, not FastAPI's default
`{"detail": "..."}`. The React client reads `data.error` everywhere, so an exception
handler in `main.py` rewrites the key; without it the UI silently discards every
server message. The handler also keeps an exception's headers, such as the
`Retry-After` on a 429.

**Omitted vs null.** Absent optional fields are left out of the payload rather than
sent as `null` (`repositories/_common.compact()`), the shape the client was built
against.

**Rounding.** JavaScript's `Math.round()` rounds halves toward +Infinity; Python's
`round()` uses banker's rounding. `Math.round(62.5) === 63` but `round(62.5) == 62`,
and 62.5% is exactly what 5 of 8 matched competencies produces. Every displayed score
therefore uses `numeric.js_round()`.

**Number formatting.** A whole-number REAL column is sent as `8`, not `8.0`
(`repositories/_common.js_number()`).

## Layout

```
backend/
  app/
    main.py              assembly: middleware, error handlers, routers, static serving
    routers/             HTTP only: guard, validate input, call a service
    deps.py              JSON body, sessions, authorization guards
    services/            business rules and transaction boundaries
    repositories/        SQL and row mapping, one module per aggregate
    database.py          connections, transactions, startup (migrate, then seed)
    migrations.py        versioned schema migrations
    schema_sql.py        the frozen version-1 baseline: DDL for 12 tables
    ai.py  security.py  ratelimit.py  config.py  errors.py  numeric.py
  seed/seed.json         rows loaded into empty tables on first boot
  tests/                 pytest suite - in-process, isolated database
  scripts/               probes run against a live server
  requirements.txt  requirements-dev.txt
```
