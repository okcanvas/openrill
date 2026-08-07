@echo off
setlocal
cd /d "%~dp0.."
python scripts\run_step012dr1_acceptance.py
set "RC=%ERRORLEVEL%"
endlocal & exit /b %RC%
