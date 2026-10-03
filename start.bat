@echo off
REM ============================================================
REM  MiniChatbotAgent - start everything locally.
REM  Double-click this file (or run "start.bat" in a terminal)
REM  and the whole stack comes up in its own windows.
REM
REM    API server   http://localhost:4001
REM    Admin panel  http://localhost:5174
REM    Widget demo  http://localhost:5175  (edit anything under apps/widget/src and it hot-reloads live here)
REM
REM  Close those windows (or press Ctrl+C in each) to stop.
REM ============================================================
setlocal
cd /d "%~dp0"

echo.
echo  === MiniChatbotAgent ===
echo.

REM --- Node present? -------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo  [X] Node.js was not found on your PATH.
  echo      Install Node 20 or newer from https://nodejs.org and run this again.
  goto :fail
)
for /f "delims=" %%v in ('node -v') do echo  [1/4] Node %%v

REM --- apps/server/.env present? ---------------------------------------
if not exist "apps\server\.env" (
  echo  [X] No apps\server\.env file found.
  echo      Copy apps\server\.env.example to apps\server\.env and fill in DATABASE_URL and an AI API key.
  goto :fail
)
echo  [2/4] apps\server\.env found

REM --- Dependencies installed? ---------------------------------------
if not exist "node_modules" (
  echo  [3/4] Installing dependencies ^(first run only, this takes a few minutes^)...
  call npm install
  if errorlevel 1 (
    echo  [X] npm install failed.
    goto :fail
  )
) else (
  echo  [3/4] Dependencies already installed
)

echo  [4/4] Applying database migrations...
call npm run db:migrate
if errorlevel 1 (
  echo  [X] Migrations failed - check DATABASE_URL in apps\server\.env and that the database is reachable.
  goto :fail
)

REM --- Launch each app in its own window ------------------------------
echo.
echo  Starting services...
start "MiniChatbot API (4001)"   cmd /k "cd /d "%~dp0" && npm run dev:server"
start "MiniChatbot Admin (5174)" cmd /k "cd /d "%~dp0" && npm run dev:admin"
start "MiniChatbot Widget (5173)" cmd /k "cd /d "%~dp0" && npm run dev:widget"

REM Give the dev servers a moment to bind their ports before opening the browser.
timeout /t 6 /nobreak >nul
start "" http://localhost:5174

echo.
echo  All started. Three windows are now running:
echo    API server   http://localhost:4001
echo    Admin panel  http://localhost:5174   ^<- opened in your browser
echo    Widget demo  http://localhost:5175   (live-reloads on save under apps/widget/src)
echo.
echo  Close those windows to stop everything.
echo.
pause
exit /b 0

:fail
echo.
pause
exit /b 1
