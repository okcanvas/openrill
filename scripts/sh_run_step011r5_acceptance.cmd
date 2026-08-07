@echo off
setlocal
cd /d "%~dp0.."
python scripts\run_step011r5_acceptance.py %*
exit /b %ERRORLEVEL%
