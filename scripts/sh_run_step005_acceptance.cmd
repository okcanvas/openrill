@echo off
setlocal
cd /d "%~dp0.."
python scripts\run_step005_acceptance.py %*
exit /b %ERRORLEVEL%
