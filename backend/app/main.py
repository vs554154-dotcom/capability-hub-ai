"""CyBridge Python backend (local / on-prem).

Parallel implementation of the same API contract served by server.ts, which
remains the AI Studio deployment path. The React frontend is unchanged and can
talk to either.

Topology note: server.ts runs Vite in middleware mode, so one Node process serves
both API and frontend on :3000. Python cannot host Vite, so in development the
Vite dev server runs separately on :5173 and proxies /api here (see
vite.config.ts). In production this app serves the built dist/ directly.
"""
from __future__ import annotations

import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from .config import (
    DEMO_MODE,
    DEV_ORIGINS,
    DIST_DIR,
    GEMINI_API_KEY,
    IS_HTTPS_DEPLOY,
    SESSION_COOKIE_NAME,
    SESSION_MAX_AGE_SECONDS,
    SESSION_SECRET,
    SESSION_SECRET_IS_DEFAULT,
)
from .routers import agents, auth, capability, core, demand

logger = logging.getLogger("cybridge")
logging.basicConfig(level=logging.INFO, format="%(message)s")

app = FastAPI(title="CyBridge Capability Hub API", version="1.0.0")

# Session cookie. Starlette signs the payload into the cookie itself, whereas
# express-session keeps it server-side and stores only an id - so a session
# created by one backend is not readable by the other. Only one serves at a time,
# and the frontend never reads the cookie (httpOnly), so the contract is unaffected.
app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    session_cookie=SESSION_COOKIE_NAME,
    max_age=SESSION_MAX_AGE_SECONDS,
    same_site="none" if IS_HTTPS_DEPLOY else "lax",
    https_only=IS_HTTPS_DEPLOY,
)

# Credentialed CORS for the separate Vite dev origin. allow_origins cannot be "*"
# when allow_credentials is True, or browsers drop the session cookie.
app.add_middleware(
    CORSMiddleware,
    allow_origins=DEV_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Error-shape parity.
# Express returns `{"error": "..."}`; FastAPI's default is `{"detail": "..."}`.
# The React client reads `data.error` in every handler, so without this it would
# silently discard the server's message and show a generic fallback instead.
@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    _: Request, exc: RequestValidationError
) -> JSONResponse:
    # Express hand-rolls 400s with a human-readable message; mirror that rather
    # than leaking pydantic's nested error structure to the UI.
    return JSONResponse(
        status_code=400,
        content={"error": "Invalid request payload.", "details": exc.errors()},
    )


app.include_router(auth.router)
app.include_router(core.router)
app.include_router(capability.router)
app.include_router(demand.router)
app.include_router(agents.router)


@app.on_event("startup")
async def on_startup() -> None:
    if SESSION_SECRET_IS_DEFAULT:
        logger.warning(
            "WARNING: SESSION_SECRET is not set. Using an insecure development "
            "fallback secret - set SESSION_SECRET in production."
        )
    if not GEMINI_API_KEY:
        logger.warning(
            "WARNING: GEMINI_API_KEY is not defined in environment secrets. "
            "AI endpoints will run with fallback logic."
        )
    if DEMO_MODE:
        logger.warning(
            "DEMO_MODE is enabled: password-free quick login and the in-app role "
            "switcher will work for ANY account. Do not enable this outside a "
            "trusted demo/pilot."
        )
    logger.info("CyBridge Python API ready.")


# Liveness/readiness probe for hosting platforms and load balancers. Public, so it
# deliberately reports nothing security-relevant: it used to include demoMode, which
# told any anonymous caller whether the authentication bypass was switched on. That
# flag is still surfaced to operators, as a startup warning in the logs.
@app.get("/api/health")
async def health() -> dict[str, object]:
    return {"status": "ok", "backend": "python"}


# Serve the built frontend when it exists, the way server.ts serves dist/.
if DIST_DIR.exists():
    DIST_ROOT = DIST_DIR.resolve()
    app.mount("/assets", StaticFiles(directory=DIST_ROOT / "assets"), name="assets")

    # HEAD as well as GET: some platforms probe the root with HEAD, which would
    # otherwise come back 405 from a GET-only route.
    @app.api_route("/{full_path:path}", methods=["GET", "HEAD"])
    def spa(full_path: str) -> FileResponse:
        # Containment check. This route previously served `DIST_DIR / full_path` for
        # any path that existed, and `..` segments survive routing - so /../.env
        # returned SESSION_SECRET and GEMINI_API_KEY, and /../capability-hub.db
        # returned the entire database. In a container, /../../proc/self/environ would
        # have exposed the secrets even with no .env file on disk. Resolve first
        # (which also collapses symlinks), then require the result to stay under
        # dist/. Anything outside gets the SPA shell, exactly like an unknown route.
        candidate = (DIST_ROOT / full_path).resolve()
        if full_path and candidate.is_relative_to(DIST_ROOT) and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(DIST_ROOT / "index.html")
