@echo off
setlocal
cd /d "%~dp0.."
python scripts\run_step012dr4_acceptance.py %*
exit /b %ERRORLEVEL%
