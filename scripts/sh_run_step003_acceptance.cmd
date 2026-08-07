@echo off
setlocal
cd /d "%~dp0.."
python scripts\run_step003_acceptance.py %*
exit /b %errorlevel%
