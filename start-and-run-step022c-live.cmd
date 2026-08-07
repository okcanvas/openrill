@echo off
setlocal
cd /d "%~dp0"
where pnpm >nul 2>nul
if errorlevel 1 (
  echo OPENRILL_PNPM_REQUIRED
  exit /b 9009
)
call pnpm install --frozen-lockfile
if errorlevel 1 exit /b %ERRORLEVEL%
call pnpm mattermost:testbed:live
exit /b %ERRORLEVEL%
