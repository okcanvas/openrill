@echo off
setlocal
cd /d "%~dp0.."
python scripts\run_step011r4_acceptance.py %*
exit /b %errorlevel%
