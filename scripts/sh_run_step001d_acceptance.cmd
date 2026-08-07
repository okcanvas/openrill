@echo off
setlocal
cd /d "%~dp0.."
python scripts\run_step001d_acceptance.py %*
exit /b %ERRORLEVEL%
