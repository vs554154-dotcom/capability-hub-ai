"""CyBridge backend: application assembly.

One process serves both the JSON API under /api and the built React app from
frontend/dist/, on a single origin. This module only wires the pieces together:

    request -> CORSMiddleware -> SessionMiddleware -> router (routers/*)
            -> guard (deps.py) -> service (services/*) -> repository (repositories/*)
            -> SQLite (database.py)

(Starlette wraps middleware in reverse order of registration, so CORSMiddleware,
added last below, is the outermost layer and sees the request first.)

Route handlers are plain `def` functions, so FastAPI runs them in its threadpool.
Database and Gemini calls are blocking; running them on the event loop would stall
every other request for as long as the slowest call took.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from .config import (
    COOKIE_SAMESITE,
    COOKIE_SECURE,
    DEMO_MODE,
    DEMO_TOOLS,
    DEV_ORIGINS,
    DIST_DIR,
    GEMINI_API_KEY,
    SESSION_COOKIE_NAME,
    SESSION_MAX_AGE_SECONDS,
    SESSION_SECRET,
    SESSION_SECRET_IS_DEFAULT,
)
from .database import init_database
from .errors import DomainError
from .routers import agents, auth, capability, core, demand, demo

logger = logging.getLogger("cybridge")
logging.basicConfig(level=logging.INFO, format="%(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Build the database before the first request, and say which unsafe defaults
    are in force - in the logs, never through a public endpoint."""
    init_database()
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
    if DEMO_TOOLS:
        logger.warning(
            "DEMO_TOOLS is enabled: someone signed in on this computer can switch between the "
            "sample people and reset the demo. Keep it off on a shared host."
        )
    logger.info("CyBridge Python API ready.")
    yield


app = FastAPI(title="CyBridge Capability Hub API", version="1.0.0", lifespan=lifespan)

# The session lives in a signed cookie (Starlette signs the payload itself), so no
# server-side session store is needed and sessions survive a restart.
app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    session_cookie=SESSION_COOKIE_NAME,
    max_age=SESSION_MAX_AGE_SECONDS,
    same_site=COOKIE_SAMESITE,
    https_only=COOKIE_SECURE,
)

# Credentialed CORS for a separately-served dev frontend. allow_origins cannot be
# "*" when allow_credentials is True, or browsers drop the session cookie.
app.add_middleware(
    CORSMiddleware,
    allow_origins=DEV_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Every error leaves as {"error": message} - the shape the React client reads in
# every handler. FastAPI's default {"detail": ...} would be silently discarded.
@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    # Keep the exception's headers: a 429 carries Retry-After.
    return JSONResponse(
        status_code=exc.status_code, content={"error": exc.detail}, headers=exc.headers
    )


@app.exception_handler(DomainError)
async def domain_error_handler(_: Request, exc: DomainError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"error": exc.message})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content={"error": "Invalid request payload.", "details": exc.errors()},
    )


app.include_router(auth.router)
app.include_router(core.router)
app.include_router(capability.router)
app.include_router(demand.router)
app.include_router(agents.router)
app.include_router(demo.router)


# Liveness probe for hosting platforms. Public, so it reports nothing
# security-relevant (whether DEMO_MODE is on, for instance, goes to the logs).
@app.get("/api/health")
def health() -> dict[str, object]:
    return {"status": "ok", "backend": "python"}


# The built frontend. dist/ is the public web root: everything in it is served to
# any browser, so nothing private may live there.
if DIST_DIR.exists():
    DIST_ROOT = DIST_DIR.resolve()
    app.mount("/assets", StaticFiles(directory=DIST_ROOT / "assets"), name="assets")

    # HEAD as well as GET: some platforms probe the root with HEAD.
    @app.api_route("/{full_path:path}", methods=["GET", "HEAD"])
    def spa(full_path: str) -> FileResponse:
        # Containment: resolve the requested path (collapsing `..` and symlinks)
        # and serve it only if it is still inside dist/. Everything else - unknown
        # routes and any path that would escape the web root - gets the SPA shell.
        candidate = (DIST_ROOT / full_path).resolve()
        if full_path and candidate.is_relative_to(DIST_ROOT) and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(DIST_ROOT / "index.html")
