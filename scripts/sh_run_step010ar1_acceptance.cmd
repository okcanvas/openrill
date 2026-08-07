@echo off
setlocal
cd /d "%~dp0.."
python scripts\run_step010ar1_acceptance.py %*
exit /b %errorlevel%
