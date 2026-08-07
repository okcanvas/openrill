@echo off
setlocal
cd /d "%~dp0.."
python scripts\run_step012b_acceptance.py %*
exit /b %ERRORLEVEL%
