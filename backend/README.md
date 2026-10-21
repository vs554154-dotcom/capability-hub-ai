# CyBridge — Python backend (FastAPI)

> **This is the live backend as of 2026-09-09.** Backend work lands here.
> See the *Architecture Decision* section of `AGENTS.md`.
>
> `server.ts` / `server-db.ts` is retained only as the Google AI Studio
> deployment path — that applet host runs Node and cannot run Python. It is
> frozen for feature work.

A FastAPI implementation of the full API contract, serving the same React
frontend. It is **self-sufficient**: it owns its schema, seeds itself, and serves
the built SPA, so no Node process is involved at runtime.

## Status — 42 / 42 endpoints

| Area | Scope | State |
|---|---|---|
| Foundation | Config, SQLite layer, sessions, bcrypt, 4 authorization guards | **Done** |
| Capability | Evidence, validation, learning plans, reminders, target roles, CRS | **Done** |
| Demand | Project demand: list/create/match/handoff/eligibility/resume | **Done** |
| AI | Gemini endpoints (orchestrator, JD assessment, interview eval, insights) | **Done** |
| Metrics | Skill-vs-Will motivation scores, workforce metrics, shortlist status | **Done** |
| Hardening | Auth rate limiting, learning-step ownership, gated staff directory | **Done** |

**Verification:** `scripts/verify_authz_scenarios.py` reports **46/46** against
this backend — the same suite the Node path passes.

## Where this folder must live

`app/config.py` resolves the repo root as `Path(__file__).parents[2]`, so this
folder sits at **`<repo>/backend/`**, alongside `dist/` and the repo-root `.env`.

One prerequisite before first run: a **`.env` at the repo root** (see
`.env.example`). `SESSION_SECRET` is worth setting; `DEMO_MODE` should stay
`false` or unset, because `true` makes the server accept a bare `userId` as proof
of identity.

## Running it

```bash
python -m venv backend/.venv
backend/.venv/Scripts/python -m pip install -r backend/requirements.txt   # Windows
python -m uvicorn backend.app.main:app --reload --reload-dir backend --port 8000
```

Run from the **repo root**, not from `backend/`. Configuration is read from the
repo-root `.env`, the same file `server.ts` uses — `SESSION_SECRET`, `DEMO_MODE`,
`GEMINI_API_KEY`.

### Pointing the frontend at it

`server.ts` runs Vite in middleware mode, so Node serves API and frontend together
on :3000. Python cannot host Vite, so development uses two processes. The frontend
calls the API with relative paths (`fetch("/api/users")` — there are no absolute
URLs in `src/`), so Vite needs to forward `/api` to Uvicorn.

`vite.config.ts` does this **only when `API_TARGET` is set**:

```powershell
# terminal 1
python -m uvicorn backend.app.main:app --reload --reload-dir backend --port 8000

# terminal 2  (PowerShell)
$env:API_TARGET="http://127.0.0.1:8000"; npx vite --port 5173
```

```bash
# terminal 2  (bash)
API_TARGET=http://127.0.0.1:8000 npx vite --port 5173
```

The opt-in matters. An unconditional proxy leaks into the Node path: `server.ts`
mounts `vite.middlewares` *after* its own routes, so any `/api` path Express does
not define (`/api/health`, say) falls through to Vite and would be forwarded to
:8000 instead of the SPA handler. Verified both ways — with `API_TARGET` unset,
`GET :3000/api/health` returns the HTML shell exactly as before.

In production this app serves the built `dist/` itself, so it is a single process
again and no proxy is involved. Note `dist/` only exists after `npm run build`.

## This backend owns the database

The schema is versioned. On startup `database.py` applies every migration in
`app/migrations.py` newer than the database (the version lives in SQLite's
`PRAGMA user_version`), then seeds any table that is still **empty** from
`seed/seed.json` (306 rows) - so a deployment with live data is never overwritten on
restart, and a fresh deployment builds itself.

Migration 1 is the baseline in `app/schema_sql.py`: all 12 tables, including every
column `server-db.ts` added by ALTER TABLE. It upgrades any older database in place,
Node-built ones included. Migration 2 adds the `sessions` table: sign-ins are
recorded there, and the cookie holds only a session id, so signing out or changing
a password ends sessions on the server. To change the schema, add a migration; never
edit `schema_sql.py` (a test fails if it changes). See `ARCHITECTURE.md` for the
rules.

This is what made Python deployable on its own. It previously refused to start
unless the Node server had created the database first.

Password hashes are deliberately absent from the seed: a claimed credential is
local state, not seed data. The first sign-in to an account sets its password.

`passwordHash` lives in a column on `users` and is written by `bcryptjs` at cost
factor 10. Python's `bcrypt` reads and writes the identical format, so an account
whose password was set under one backend authenticates under the other. This is
verified, not assumed — the probes below sign in as accounts whose hashes the Node
server wrote.

## Verifying parity

Run with both backends up (Node on :3000, Uvicorn on :8000).

```bash
python backend/scripts/verify_auth.py http://127.0.0.1:8000   # Python
python backend/scripts/verify_auth.py http://localhost:3000   # Node
python backend/scripts/verify_parity.py                       # compares both
python backend/scripts/verify_writes.py                       # write side effects
python backend/scripts/verify_target_role.py                  # role seeding
```

**`verify_auth`** — 14 probes asserting that authority comes from the session
cookie alone, never from an id in the URL or body: an employee is refused a
manager's team, profile and capability; a manager is refused another manager's;
a bare `userId` login is rejected.

**`verify_parity`** — 19 checks comparing the JSON both backends return for every
read endpoint, plus validation-error shapes. Read-only.

**`verify_writes`** — the side effects the read suites cannot reach. Submitting
evidence must move the skill to *practicing*; approving must promote it one level
(capped at 5) and mark it *validated*; rejecting must drop it to *learning*.

**`verify_target_role`** — selecting a role must seed the user's skill rows for
that role's requirements, at level 1 with the role's `minLevel` as target.

The two write suites snapshot the affected rows, run the identical sequence
against each backend, and restore — the shared database is left exactly as found,
and each run asserts that it was.

## Gemini

`app/ai.py` wraps the `google-genai` SDK with the same posture as `server.ts`:
the client is optional, and every AI endpoint falls back to deterministic text on
a missing key or a failed call, returning HTTP 200. The UI assumes these endpoints
always answer. `generate_json()` additionally strips ``` fences and recovers the
outermost JSON span, because models routinely wrap structured output in prose.

Set `GEMINI_API_KEY` in the repo-root `.env` to exercise real generation.

## Four fidelity details worth keeping

**Error shape.** Express returns `{"error": "..."}`; FastAPI defaults to
`{"detail": "..."}`. The React client reads `data.error` everywhere, so an
exception handler in `main.py` rewrites the key. Without it the UI silently
discards every server message and shows generic fallback text.

**Omitted vs null.** `server-db.ts` maps absent optional columns to `undefined`,
which `JSON.stringify` drops from the payload. `repositories/_common.compact()` reproduces that by
omitting `None` values rather than emitting `null`, so both backends return
byte-identical JSON — confirmed across all 27 users.

**Rounding.** JavaScript's `Math.round()` rounds halves toward +Infinity; Python's
`round()` uses banker's rounding. `Math.round(62.5) === 63` but `round(62.5) == 62`,
and 62.5% is exactly what 5 of 8 matched competencies produces. Every percentage in
the scoring engines therefore uses `numeric.js_round()`. Using the builtin silently
produced scores one point below the Node backend — same ranking, different numbers.

**Number formatting.** JavaScript has a single number type, so `Number(8)` serialises
as `8`. Python would emit `8.0` for the same SQLite REAL column, a 2-byte difference
in every user payload. `repositories/_common.js_number()` collapses integral floats back to `int`.

## Layout

The full design - layers, request lifecycle, transactions, authorization rule and
route map - is in [`ARCHITECTURE.md`](../ARCHITECTURE.md) at the repo root.

```
backend/
  app/
    main.py              assembly: middleware, error handlers, routers, static serving
    routers/             HTTP only: guard, validate input, call a service
    deps.py              JSON body + authorization guards
    services/            business rules and transaction boundaries
    repositories/        SQL and row mapping, one module per aggregate
    database.py          connections, transactions, schema + seed initialisation
    schema_sql.py        DDL for all 12 tables
    ai.py  security.py  ratelimit.py  config.py  errors.py  numeric.py
  seed/seed.json         rows loaded into empty tables on first boot
  tests/                 pytest suite - in-process, isolated database
  scripts/               probes run against a live server
  requirements.txt  requirements-dev.txt
```
