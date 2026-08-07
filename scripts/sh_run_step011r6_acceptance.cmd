@echo off
setlocal
cd /d "%~dp0.."
python scripts\run_step011r6_acceptance.py %*
exit /b %ERRORLEVEL%
