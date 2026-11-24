"""Runtime configuration, read once from the environment (and .env) at import.

Every variable is listed, with its default, in .env.example and DEPLOY.md.
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# Repo root is two levels up from this file (backend/app/config.py -> repo root).
REPO_ROOT = Path(__file__).resolve().parents[2]

load_dotenv(REPO_ROOT / ".env")

# This backend owns its schema and seed (see schema_sql.py and seed/seed.json) and
# creates the database if it is absent. The older name CAPABILITY_DB_PATH is still
# accepted, so existing deployments keep working.
DB_PATH = Path(
    os.getenv("DATABASE_PATH")
    or os.getenv("CAPABILITY_DB_PATH")
    or (REPO_ROOT / "capability-hub.db")
)

# Seed rows loaded into any table that is still empty on startup.
SEED_PATH = Path(__file__).resolve().parent.parent / "seed" / "seed.json"

# A larger made-up company for demos, added to those rows unless SEED_DEMO_DATA is
# "false" (see seed_data.py).
DEMO_SEED_PATH = SEED_PATH.with_name("demo_seed.json")
SEED_DEMO_DATA = os.getenv("SEED_DEMO_DATA", "true").lower() != "false"

# Multiple-choice questions per skill, for assessments and knowledge checks.
QUESTION_BANK_PATH = SEED_PATH.with_name("question_bank.json")

# Other names a job description may use for a catalogue skill ("K8s" for Kubernetes).
SKILL_ALIASES_PATH = SEED_PATH.with_name("skill_aliases.json")

# Signs the session cookie. Unset, an insecure development fallback is used and
# startup logs a warning.
SESSION_SECRET = os.getenv("SESSION_SECRET") or "dev-insecure-secret-change-me"
SESSION_SECRET_IS_DEFAULT = not os.getenv("SESSION_SECRET")

# When true the server accepts a bare userId as proof of identity. This is the flag
# that, left on, let anyone open a manager's cockpit with one click. Off by default.
DEMO_MODE = os.getenv("DEMO_MODE", "false").lower() == "true"

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")


def _positive_seconds(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = float(raw)
    except ValueError:
        raise ValueError(f"{name} must be a number of seconds, got {raw!r}") from None
    if value <= 0:
        raise ValueError(f"{name} must be greater than zero, got {raw!r}")
    return value


# Upper bound on one Gemini call. Without it a call that never answers holds a
# worker thread indefinitely. It bounds hung calls, not slow ones, so it sits well
# above normal generation time: long reports have been observed to take over 90s.
# A misconfigured value fails at startup rather than silently removing the bound.
GEMINI_TIMEOUT_SECONDS = _positive_seconds("GEMINI_TIMEOUT_SECONDS", 120.0)

# The model every agent uses, and the ones tried in order when Google answers that it
# is overloaded, out of quota or gone. Set the second to an empty string for none.
GEMINI_MODEL = os.getenv("GEMINI_MODEL") or "gemini-3.6-flash"
GEMINI_BACKUP_MODELS = [
    name.strip()
    for name in os.getenv("GEMINI_BACKUP_MODELS", "gemini-3.5-flash,gemini-flash-lite-latest,gemini-3.1-flash-lite").split(",")
    if name.strip() and name.strip() != GEMINI_MODEL
]

SESSION_COOKIE_NAME = "chub_sid"
SESSION_MAX_AGE_SECONDS = 60 * 60 * 8  # 8 hours

# Local/on-prem: plain HTTP, so Secure must be off and SameSite=lax.
IS_HTTPS_DEPLOY = (
    os.getenv("NODE_ENV") == "production"
    or (os.getenv("APP_URL") or "").startswith("https://")
)

# Session cookie SameSite policy. Embedding the app in a cross-site iframe needs
# "none"; a standalone deployment is better served by the
# stricter "lax". Defaults to "none" on HTTPS, "lax" otherwise; COOKIE_SAMESITE
# overrides. Browsers reject SameSite=None without Secure, so "none" forces Secure.
_samesite = (os.getenv("COOKIE_SAMESITE") or "").strip().lower()
COOKIE_SAMESITE = _samesite if _samesite in ("lax", "strict", "none") else (
    "none" if IS_HTTPS_DEPLOY else "lax"
)
COOKIE_SECURE = IS_HTTPS_DEPLOY or COOKIE_SAMESITE == "none"

PORT = int(os.getenv("PORT", "8000"))

# Vite dev server origin, allowed through CORS with credentials so the React app can
# hold a session while running on its own port.
DEV_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

# Built frontend - the public web root. Everything under it is served to any
# browser, so nothing private may live here. Overridable so tests can point it at
# a controlled tree.
DIST_DIR = Path(os.getenv("DIST_DIR") or (REPO_ROOT / "frontend" / "dist"))

# Files that exist for gated endpoints only (e.g. the Leadership source download).
# Deliberately outside frontend/, whose public/ and dist/ are served to everyone.
PRIVATE_DIR = Path(os.getenv("PRIVATE_DIR") or (REPO_ROOT / "private"))
