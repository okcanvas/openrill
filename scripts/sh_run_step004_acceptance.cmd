@echo off
setlocal
cd /d "%~dp0.."
python scripts\run_step004_acceptance.py %*
exit /b %ERRORLEVEL%
