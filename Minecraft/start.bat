@echo off
REM ============================================================================
REM Minecraft launcher — serves the game over HTTP so the ES modules load.
REM Double-clicking index.html uses file:// which the browser blocks for
REM module scripts (CORS), so the Play button never wires up. This fixes that.
REM ============================================================================
setlocal
cd /d "%~dp0"

set PORT=8000

echo Starting Minecraft on http://localhost:%PORT%/ ...
echo (Keep this window open while you play. Close it to stop the server.)

REM Open the browser after a short delay so the server is ready.
start "" cmd /c "timeout /t 1 >nul & start http://localhost:%PORT%/"

REM Start the server (foreground, so closing this window stops it).
py -3 -m http.server %PORT%
if errorlevel 1 (
  echo.
  echo [!] Failed to start server with "py". Trying "python"...
  python -m http.server %PORT%
)
if errorlevel 1 (
  echo.
  echo [!] Could not start the server. Make sure Python is installed
  echo     and not shadowed by the Microsoft Store alias.
  pause
)

endlocal
