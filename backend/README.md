# CyBridge — Python backend ❄️ FROZEN

> **This backend is frozen as of 2026-09-06 and is NOT maintained.**
>
> The project settled on a single backend: **Node.js/Express (`server.ts`)**.
> See the *Architecture Decision* section of `AGENTS.md` for the reasoning.
>
> **Do not add features here. Do not mirror `server.ts` changes into this tree.**
> It will drift behind Node, and that is the intended outcome.
>
> The parity suites below are **not a CI gate**. They passed at the moment of
> freezing; once `server.ts` moves ahead they will legitimately fail. Do not
> "fix" this backend to make them pass again.
>
> Kept rather than deleted because it is a complete, tested reference
> implementation of all 38 endpoints — cheap to retain, expensive to rebuild —
> and it is the starting point if the project ever leaves AI Studio. Reviving it
> would also require moving schema ownership out of `server-db.ts`, which was
> deliberately never done.

---

A FastAPI implementation of the same API contract served by `server.ts`, reached
at full behavioural parity before being frozen.

`server.ts` is the production backend and the Google AI Studio deployment path,
because that applet host runs Node.

## Status — complete, 38 / 38 endpoints

| Stage | Scope | State |
|---|---|---|
| 1 | Config, SQLite layer, sessions, bcrypt, 4 authorization guards | **Done** |
| 2 | Evidence, validation, learning plans, reminders, target roles, CRS | **Done** |
| 3 | Project demand: list/create/match/handoff/eligibility/resume | **Done** |
| 4 | Gemini endpoints (orchestrator, JD assessment, interview eval, insights) | **Done** |

Every route in `server.ts` has a counterpart here, verified by
`scripts/../coverage` comparison of both source files.

## Where this folder must live

`app/config.py` resolves the repo root as `Path(__file__).parents[2]`, so this
folder has to sit at **`<repo>/backend/`** — alongside `server.ts`, `package.json`
and `capability-hub.db`. It reads the repo-root `.env` and the repo-root SQLite
file from there. Unpacking it anywhere else will fail at startup with a
"database not found" error pointing at the wrong path.

Two prerequisites before first run:

1. **`capability-hub.db` must exist.** The schema and seed are owned by
   `server-db.ts`; run `npm run dev` once against the Node server to create it.
   This backend never creates or seeds the database.
2. **`.env` at the repo root**, same file `server.ts` uses. See `.env.example`.
   `SESSION_SECRET` is worth setting; `DEMO_MODE` should stay `false` or unset,
   because `true` makes the server accept a bare `userId` as proof of identity.

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

## The database is shared

Both backends read and write the same `capability-hub.db`. There is no data
migration and no duplicated seed data.

The schema and seed remain **owned by `server-db.ts`**. This backend does not
create or seed the database — if the file is missing it fails with an explicit
message telling you to run `npm run dev` once. That keeps a single source of truth
for the schema while both backends exist; folding the seed into Python is a
later-stage decision, not an accident.

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

**`verify_auth`** — 13 probes asserting that authority comes from the session
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
which `JSON.stringify` drops from the payload. `db._compact()` reproduces that by
omitting `None` values rather than emitting `null`, so both backends return
byte-identical JSON — confirmed across all 27 users.

**Rounding.** JavaScript's `Math.round()` rounds halves toward +Infinity; Python's
`round()` uses banker's rounding. `Math.round(62.5) === 63` but `round(62.5) == 62`,
and 62.5% is exactly what 5 of 8 matched competencies produces. Every percentage in
the scoring engines therefore uses `numeric.js_round()`. Using the builtin silently
produced scores one point below the Node backend — same ranking, different numbers.

**Number formatting.** JavaScript has a single number type, so `Number(8)` serialises
as `8`. Python would emit `8.0` for the same SQLite REAL column, a 2-byte difference
in every user payload. `db._js_number()` collapses integral floats back to `int`.

## Layout

```
backend/
  app/
    config.py            env contract, shared with server.ts
    db.py                SQLite access + row mappers
    security.py          bcrypt hashing
    deps.py              the 4 authorization guards
    main.py              app, session/CORS middleware, error shape, static serving
    routers/
      auth.py            /api/auth/*
      core.py            users, skills, roles, courses, team
  scripts/
    verify_auth.py       authorization parity probes
  requirements.txt
```
