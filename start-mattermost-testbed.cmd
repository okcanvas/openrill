@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo OPENRILL_NODE_REQUIRED
  exit /b 9009
)
call node "testbeds\mattermost\scripts\testbed.mjs" up
if errorlevel 1 exit /b %ERRORLEVEL%
call node "testbeds\mattermost\scripts\testbed.mjs" bootstrap
exit /b %ERRORLEVEL%
