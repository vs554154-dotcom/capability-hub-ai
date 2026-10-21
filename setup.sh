#!/bin/bash
# One-time local setup: frontend dependencies, the Python virtualenv, and a first
# build so the backend has a web root to serve.
set -e

echo "=== Setting up CyBridge ==="

echo "Installing frontend dependencies..."
npm install

echo "Installing the backend into backend/.venv..."
# Created only when missing, so a rerun never rewrites a venv that a running server
# has open.
[ -d backend/.venv ] || python -m venv backend/.venv
if [ -x backend/.venv/bin/python ]; then PY=backend/.venv/bin/python; else PY=backend/.venv/Scripts/python; fi
"$PY" -m pip install -r backend/requirements.txt -r backend/requirements-dev.txt

if [ ! -f .env ]; then
  echo "Creating .env from .env.example (set GEMINI_API_KEY there to enable the copilots)."
  cp .env.example .env
fi

echo "Type-checking and building the frontend..."
npm run lint
npm run build

echo "Running the backend tests..."
"$PY" -m pytest backend/tests -q

echo
echo "Done. Start the backend (API + built app on http://localhost:8000):"
echo "  $PY -m uvicorn backend.app.main:app --reload --reload-dir backend/app"
echo "For hot-reloading frontend work, also run: npm run dev  (http://localhost:5173)"
