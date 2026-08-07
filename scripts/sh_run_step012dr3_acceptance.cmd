@echo off
setlocal
cd /d "%~dp0.."
python scripts\run_step012dr3_acceptance.py
exit /b %errorlevel%
