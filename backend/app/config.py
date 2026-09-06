"""Runtime configuration.

Mirrors the environment contract of server.ts so the two backends behave
identically for the same .env file.
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# Repo root is two levels up from this file (backend/app/config.py -> repo root).
REPO_ROOT = Path(__file__).resolve().parents[2]

load_dotenv(REPO_ROOT / ".env")

# The SQLite file is shared with the Node server. Both backends read and write the
# same schema, so there is no data migration and no seed duplication.
DB_PATH = Path(os.getenv("CAPABILITY_DB_PATH", REPO_ROOT / "capability-hub.db"))

# Signs the session cookie. server.ts uses the same variable and the same insecure
# development fallback, and warns when it is unset.
SESSION_SECRET = os.getenv("SESSION_SECRET") or "dev-insecure-secret-change-me"
SESSION_SECRET_IS_DEFAULT = not os.getenv("SESSION_SECRET")

# When true the server accepts a bare userId as proof of identity. This is the flag
# that, left on, let anyone open a manager's cockpit with one click. Off by default.
DEMO_MODE = os.getenv("DEMO_MODE", "false").lower() == "true"

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Matches the express-session cookie in server.ts.
SESSION_COOKIE_NAME = "chub_sid"
SESSION_MAX_AGE_SECONDS = 60 * 60 * 8  # 8 hours

# Local/on-prem: plain HTTP, so Secure must be off and SameSite=lax.
IS_HTTPS_DEPLOY = (
    os.getenv("NODE_ENV") == "production"
    or (os.getenv("APP_URL") or "").startswith("https://")
)

PORT = int(os.getenv("PORT", "8000"))

# Vite dev server origin, allowed through CORS with credentials so the React app can
# hold a session while running on its own port.
DEV_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

# Built frontend, served in production the way server.ts serves dist/.
DIST_DIR = REPO_ROOT / "dist"
