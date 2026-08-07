@echo off
setlocal
cd /d "%~dp0.."
python scripts\run_step012c_acceptance.py %*
exit /b %errorlevel%
