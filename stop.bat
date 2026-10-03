@echo off
REM ============================================================
REM  MiniChatbotAgent - stop everything started by start.bat.
REM  Closes the three console windows by title (best effort -
REM  taskkill's own success/failure exit code isn't reliable
REM  across Windows versions, so this doesn't depend on it), then
REM  kills whatever is still actually listening on their ports,
REM  which is what's really being asked here.
REM ============================================================
setlocal
echo.
echo  === Stopping MiniChatbotAgent ===
echo.

set FOUND=0

REM --- Close the named windows start.bat opened (best effort) ---------
for %%W in ("MiniChatbot API (4001)" "MiniChatbot Admin (5174)" "MiniChatbot Widget (5173)") do (
  taskkill /fi "WINDOWTITLE eq %%~W*" /t /f >nul 2>nul
)

REM --- The real check: is anything still bound to the dev ports? ------
REM One for /f over all three ports at once - nesting a second for /f
REM inside another do-block doesn't parse reliably in cmd.exe, so this
REM stays a single level deep.
for /f "tokens=5" %%I in ('netstat -ano ^| findstr /r /c:":4001 .*LISTENING" /c:":5174 .*LISTENING" /c:":5173 .*LISTENING"') do (
  echo  Stopping process on PID %%I ...
  taskkill /pid %%I /t /f >nul 2>nul
  set FOUND=1
)

if "%FOUND%"=="1" (
  echo.
  echo  Done. All MiniChatbotAgent services have been stopped.
) else (
  echo.
  echo  Nothing was running on ports 4001, 5174 or 5173 - already stopped.
)
echo.
pause
exit /b 0
