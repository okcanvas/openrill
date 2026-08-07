@echo off
setlocal
cd /d "%~dp0.."
python scripts\run_step006_acceptance.py %*
exit /b %errorlevel%
