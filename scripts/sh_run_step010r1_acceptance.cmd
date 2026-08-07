@echo off
setlocal
cd /d "%~dp0.."
python scripts\run_step010r1_acceptance.py %*
exit /b %errorlevel%
