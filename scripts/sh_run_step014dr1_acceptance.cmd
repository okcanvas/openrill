@echo off
setlocal
cd /d "%~dp0.."
pnpm acceptance:step014dr1
exit /b %ERRORLEVEL%
