"""Shared test harness.

Every test runs in-process against the real FastAPI app with no server, no network,
and no access to the developer's database: config.py reads its settings at import
time, so an isolated environment is put in place *before* the app is imported.

The isolated tree also contains a deliberate bait file beside the web root
(site/secret.env) - the exact shape of the path-traversal bug this suite guards
against. A naive `web_root / requested_path` join can reach it; the app must not.
"""
from __future__ import annotations

import asyncio
import atexit
import os
import shutil
import tempfile
from pathlib import Path

import pytest

_TMP = Path(tempfile.mkdtemp(prefix="cybridge-tests-"))
WEB_ROOT = _TMP / "site" / "dist"
BAIT_FILE = _TMP / "site" / "secret.env"
PRIVATE_DIR = _TMP / "private"

INDEX_HTML = b'<!doctype html><div id="root"></div><!-- test shell -->'
ASSET_JS = b"console.log('asset');"
BAIT_CONTENT = b"SESSION_SECRET=bait-must-never-be-served"
ARCHIVE_BYTES = b"PK-test-archive-bytes"

(WEB_ROOT / "assets").mkdir(parents=True)
(WEB_ROOT / "index.html").write_bytes(INDEX_HTML)
(WEB_ROOT / "assets" / "app.js").write_bytes(ASSET_JS)
BAIT_FILE.write_bytes(BAIT_CONTENT)
PRIVATE_DIR.mkdir()
(PRIVATE_DIR / "capability_hub_ai_source.zip").write_bytes(ARCHIVE_BYTES)

# Explicit values win over the repo's .env (load_dotenv does not override).
os.environ.update({
    "DATABASE_PATH": str(_TMP / "test.db"),
    "DIST_DIR": str(WEB_ROOT),
    "PRIVATE_DIR": str(PRIVATE_DIR),
    "SESSION_SECRET": "test-only-secret",
    "DEMO_MODE": "false",
    "GEMINI_API_KEY": "",          # AI endpoints use their deterministic fallbacks
    "GEMINI_MODEL": "",            # the default, whatever the developer's .env says
    "GEMINI_BACKUP_MODELS": "",    # one model, unless a test says otherwise
    "AUTH_RATE_LIMIT_MAX": "100000",
    "NODE_ENV": "test",
    "APP_URL": "",
})

atexit.register(shutil.rmtree, _TMP, ignore_errors=True)

from fastapi.testclient import TestClient  # noqa: E402

from backend.app import ratelimit  # noqa: E402
from backend.app.main import app  # noqa: E402

PASSWORD = "test-pass"

# First sign-in claims the password, so these work against the freshly seeded DB.
ACCOUNTS = {
    "employee": "E1000",
    "manager": "marcus.sterling@capabilityhub.ai",
    "ld": "sarah.jenkins@capabilityhub.ai",
    "leadership": "david.vance@capabilityhub.ai",
}


@pytest.fixture(autouse=True)
def _fresh_rate_limit():
    ratelimit.reset()
    yield
    ratelimit.reset()


def signed_in(role: str) -> TestClient:
    client = TestClient(app)
    response = client.post(
        "/api/auth/login", json={"identifier": ACCOUNTS[role], "password": PASSWORD}
    )
    assert response.status_code == 200, f"{role} login failed: {response.text}"
    return client


@pytest.fixture
def anon() -> TestClient:
    return TestClient(app)


@pytest.fixture
def employee() -> TestClient:
    return signed_in("employee")


@pytest.fixture
def manager() -> TestClient:
    return signed_in("manager")


@pytest.fixture
def ld() -> TestClient:
    return signed_in("ld")


@pytest.fixture
def leadership() -> TestClient:
    return signed_in("leadership")


def raw_get(path: str) -> tuple[int, bytes]:
    """Send a GET with an exact, un-normalised path straight into the ASGI app.

    HTTP clients (httpx included) collapse `..` segments before sending, so a test
    written with TestClient would pass even against a vulnerable route. A real
    attacker's raw request reaches the server un-normalised; this reproduces that.
    """

    async def _run() -> tuple[int, bytes]:
        status: dict[str, int] = {}
        chunks: list[bytes] = []
        scope = {
            "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
            "method": "GET", "scheme": "http", "path": path,
            "raw_path": path.encode(), "root_path": "", "query_string": b"",
            "headers": [(b"host", b"testserver")],
            "client": ("testclient", 50000), "server": ("testserver", 80),
        }

        async def receive():
            return {"type": "http.request", "body": b"", "more_body": False}

        async def send(message):
            if message["type"] == "http.response.start":
                status["code"] = message["status"]
            elif message["type"] == "http.response.body":
                chunks.append(message.get("body", b""))

        await app(scope, receive, send)
        return status["code"], b"".join(chunks)

    return asyncio.run(_run())
