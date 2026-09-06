@echo off
REM ---------------------------------------------------------------------------
REM Windows dev launcher for the CyBridge server.
REM
REM Why this exists: parent processes (editors, agent harnesses) that were started
REM before Node.js was installed inherit a PATH without it. The `npm` and `tsx`
REM wrapper scripts both shell out to a bare `node`, which then fails with
REM   '"node"' is not recognized as an internal or external command
REM even though Node is installed.
REM
REM So: locate node.exe ourselves, put its directory on PATH for any child process
REM that needs it, and launch tsx's CLI directly with an absolute node.exe path -
REM no dependence on `npm` or `node` being resolvable through PATH.
REM
REM On a machine where Node is already on PATH this is a plain pass-through.
REM ---------------------------------------------------------------------------

setlocal enabledelayedexpansion

REM Run from the repo root no matter where this was invoked from.
cd /d "%~dp0.."

set "NODE_EXE="

REM 1. Already on PATH?
for /f "delims=" %%I in ('where node.exe 2^>nul') do (
  if not defined NODE_EXE set "NODE_EXE=%%I"
)

REM 2. Standard install locations.
if not defined NODE_EXE (
  for %%D in (
    "%ProgramFiles%\nodejs"
    "%ProgramFiles(x86)%\nodejs"
    "%LOCALAPPDATA%\Programs\nodejs"
    "%APPDATA%\nvm"
    "C:\Program Files\nodejs"
  ) do (
    if not defined NODE_EXE if exist "%%~D\node.exe" set "NODE_EXE=%%~D\node.exe"
  )
)

if not defined NODE_EXE (
  echo.
  echo [dev.cmd] ERROR: could not find node.exe.
  echo [dev.cmd] Install Node.js LTS ^(winget install OpenJS.NodeJS.LTS^) and retry.
  echo.
  exit /b 1
)

for %%I in ("%NODE_EXE%") do set "NODE_DIR=%%~dpI"
set "PATH=%NODE_DIR%;%PATH%"

echo [dev.cmd] node: %NODE_EXE%

REM Launch tsx's CLI directly - bypasses both the npm and tsx .cmd shims.
"%NODE_EXE%" "%CD%\node_modules\tsx\dist\cli.mjs" server.ts %*
