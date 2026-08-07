@echo off
setlocal
cd /d "%~dp0.."
python scripts\run_step012cr1_acceptance.py %*
exit /b %errorlevel%
