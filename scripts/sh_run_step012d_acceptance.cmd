@echo off
setlocal
cd /d "%~dp0.."
python scripts\run_step012d_acceptance.py
exit /b %ERRORLEVEL%
