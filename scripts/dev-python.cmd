@echo off
REM ---------------------------------------------------------------------------
REM Windows dev launcher for the CyBridge FastAPI backend (the live backend).
REM
REM Serves the API and, once `npm run build` has produced dist/, the React app
REM too - both from http://localhost:8000 on a single origin.
REM
REM Resolves the interpreter itself rather than relying on PATH: the venv is the
REM preferred one because that is where the dependencies are installed, and a
REM parent process started before the venv existed will not have it on PATH.
REM ---------------------------------------------------------------------------

setlocal enabledelayedexpansion

REM Run from the repo root no matter where this was invoked from.
cd /d "%~dp0.."

set "PY_EXE="

REM 1. Project virtualenv - where requirements.txt was installed.
if exist "%CD%\backend\.venv\Scripts\python.exe" set "PY_EXE=%CD%\backend\.venv\Scripts\python.exe"

REM 2. Fall back to whatever Python is on PATH.
if not defined PY_EXE (
  for /f "delims=" %%I in ('where python.exe 2^>nul') do (
    if not defined PY_EXE set "PY_EXE=%%I"
  )
)

if not defined PY_EXE (
  echo.
  echo [dev-python.cmd] ERROR: could not find python.exe.
  echo [dev-python.cmd] Create the venv and install dependencies:
  echo [dev-python.cmd]   python -m venv backend\.venv
  echo [dev-python.cmd]   backend\.venv\Scripts\python -m pip install -r backend\requirements.txt
  echo.
  exit /b 1
)

if not defined PORT set "PORT=8000"

echo [dev-python.cmd] python: %PY_EXE%
echo [dev-python.cmd] http://localhost:%PORT%

REM --reload-dir keeps the watcher off dist/ and node_modules/, which would
REM otherwise restart the server on every frontend build.
"%PY_EXE%" -m uvicorn backend.app.main:app --host 0.0.0.0 --port %PORT% --reload --reload-dir backend\app %*
