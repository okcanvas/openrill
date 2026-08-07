@echo off
setlocal
cd /d "%~dp0.."
python scripts\run_step015a_acceptance.py %*
exit /b %ERRORLEVEL%
